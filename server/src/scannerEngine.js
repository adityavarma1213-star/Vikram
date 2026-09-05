const CFG = {
  historyDays: 20,
  minConfirmedHistory: 10,
  flatPricePct: 0.25,
  volumeStrong: 1.5,
  volumeElevated: 1.2,
  deliveryStrong: 55,
  deliveryPositive: 45,
  deliveryLookback: 5,
  obvLookback: 5,
  weights: { price: 15, volume: 20, delivery: 20, obv: 15, futuresOi: 30 },
  confirmed: 75,
  starting: 55,
  mixed: 35
};

const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function dateKey(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const sortRows = rows => (rows || []).slice().sort((a, b) => {
  const ad = dateKey(a.trade_date) || '';
  const bd = dateKey(b.trade_date) || '';
  return ad.localeCompare(bd);
});

function evaluate(symbol, history, futures) {
  const rows = sortRows(history);
  const current = rows[rows.length - 1] || {};
  const prior = rows.slice(0, -1);
  const why = [];

  const volumes = prior.slice(-CFG.historyDays).map(r => num(r.volume)).filter(v => v !== null);
  const avgVolume = average(volumes);
  const volume = num(current.volume);
  const volumeRatio = volume !== null && avgVolume ? volume / avgVolume : null;

  const close = num(current.close ?? current.last_price);
  const prevClose = num(current.prev_close);
  const priceChangePct = close !== null && prevClose !== null && prevClose !== 0
    ? ((close / prevClose) - 1) * 100 : null;

  const deliveryPct = num(current.deliv_per);
  const deliveryQty = num(current.deliv_qty);
  const deliveryHistory = rows.slice(-CFG.deliveryLookback).map(r => num(r.deliv_per)).filter(v => v !== null);
  const previousDeliveryAverage = deliveryHistory.length > 1 ? average(deliveryHistory.slice(0, -1)) : null;
  const deliveryTrend = deliveryPct !== null && previousDeliveryAverage !== null
    ? deliveryPct - previousDeliveryAverage : null;

  let obv = 0;
  const obvValues = rows.map((row, index) => {
    const c = num(row.close ?? row.last_price);
    const previous = index > 0
      ? num(rows[index - 1].close ?? rows[index - 1].last_price)
      : num(row.prev_close);
    const v = num(row.volume) || 0;
    if (c !== null && previous !== null) {
      if (c > previous) obv += v;
      else if (c < previous) obv -= v;
    }
    return obv;
  });
  const obvTrend = obvValues.length > CFG.obvLookback
    ? obvValues[obvValues.length - 1] - obvValues[obvValues.length - 1 - CFG.obvLookback]
    : null;
  if (obvValues.length) obv = obvValues[obvValues.length - 1];

  const exactFutures = futures && dateKey(futures.trade_date) === dateKey(current.trade_date)
    ? futures : null;
  const futuresOi = exactFutures ? num(exactFutures.oi) : null;
  const changeOi = exactFutures ? num(exactFutures.change_oi) : null;

  let score = 0;
  let availableWeight = 0;
  const add = (weight, points, explanation) => {
    if (points === null) return;
    score += points;
    availableWeight += weight;
    if (explanation) why.push(explanation);
  };

  if (priceChangePct !== null) {
    add(CFG.weights.price,
      priceChangePct > CFG.flatPricePct ? 15 : priceChangePct >= -CFG.flatPricePct ? 9.75 : 2.25,
      priceChangePct > CFG.flatPricePct ? 'Price is firm/positive.' : priceChangePct >= -CFG.flatPricePct ? 'Price is broadly flat.' : 'Price is falling.'
    );
  } else why.push('Price change data is unavailable.');

  if (volumeRatio !== null) {
    add(CFG.weights.volume,
      volumeRatio >= CFG.volumeStrong ? 20 : volumeRatio >= CFG.volumeElevated ? 14 : volumeRatio >= 0.8 ? 7 : 0,
      `Volume ratio is ${volumeRatio.toFixed(2)}x.`
    );
  } else if (volume === null) {
    why.push('Volume data is unavailable.');
  } else {
    why.push('Volume is available, but a volume ratio needs prior trading-day history.');
  }

  if (deliveryPct !== null) {
    const base = deliveryPct >= CFG.deliveryStrong ? 20 : deliveryPct >= CFG.deliveryPositive ? 14 : 5;
    const trendBonus = deliveryTrend !== null && deliveryTrend > 0 ? 3 : 0;
    add(CFG.weights.delivery, Math.min(20, base + trendBonus),
      deliveryTrend !== null && deliveryTrend > 0
        ? `Delivery is ${deliveryPct.toFixed(1)}% and trending higher.`
        : `Delivery is ${deliveryPct.toFixed(1)}%.`
    );
  } else why.push('Delivery data is unavailable.');

  if (obvTrend !== null) {
    add(CFG.weights.obv, obvTrend > 0 ? 15 : obvTrend === 0 ? 7.5 : 0,
      obvTrend > 0 ? 'OBV is rising.' : obvTrend === 0 ? 'OBV is flat.' : 'OBV is falling.'
    );
  } else why.push('OBV trend needs more historical data.');

  if (futuresOi !== null && changeOi !== null) {
    add(CFG.weights.futuresOi, changeOi > 0 ? 30 : changeOi === 0 ? 12 : 0,
      changeOi > 0 ? `Futures OI increased by ${changeOi} on the exact date.` : `Futures OI change is ${changeOi}.`
    );
  } else if (futures && dateKey(futures.trade_date) !== dateKey(current.trade_date)) {
    why.push('Futures OI data exists but not for the exact trade date, so it was not scored.');
  } else {
    why.push('Futures OI confirmation is unavailable for the exact date.');
  }

  const normalizedScore = availableWeight ? (score / availableWeight) * 100 : null;
  const hasConfirmedInputs = volumeRatio !== null && deliveryPct !== null && futuresOi !== null && changeOi !== null;
  const sufficientHistory = rows.length >= CFG.minConfirmedHistory;

  let verdict = 'UNCONFIRMED / MIXED';
  if (normalizedScore !== null && normalizedScore >= CFG.confirmed && sufficientHistory && hasConfirmedInputs) {
    verdict = 'ACCUMULATION CONFIRMED';
  } else if (normalizedScore !== null && normalizedScore >= CFG.starting && (
    (priceChangePct !== null && Math.abs(priceChangePct) <= CFG.flatPricePct && changeOi !== null && changeOi > 0) ||
    (volumeRatio !== null && volumeRatio >= CFG.volumeElevated)
  )) {
    verdict = 'ACCUMULATION STARTING';
  } else if (normalizedScore !== null && normalizedScore < CFG.mixed) {
    verdict = 'DISTRIBUTION';
  }

  if (!sufficientHistory) why.push(`Only ${rows.length} historical rows are available; confirmed accumulation requires at least ${CFG.minConfirmedHistory}.`);
  if (rows.length === 0) why.push('No verified EOD history is available.');

  return {
    symbol,
    tradeDate: dateKey(current.trade_date),
    score: normalizedScore === null ? null : Math.round(normalizedScore),
    verdict,
    metrics: {
      close,
      prevClose,
      priceChangePct,
      volume,
      avgVolume,
      volumeRatio,
      deliveryPct,
      deliveryQty,
      deliveryTrend,
      obv: obvValues.length ? obv : null,
      obvTrend,
      futuresOi,
      changeOi,
      oiExactDate: !!exactFutures
    },
    why
  };
}

module.exports = { evaluate, CFG, dateKey };
