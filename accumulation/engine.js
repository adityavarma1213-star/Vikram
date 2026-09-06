/*
 * VIKRAM Accumulation Engine v2
 * Evidence score + safety floors + N-of-M confirmation.
 * OI is used when F&O evidence exists; it is not a universal prerequisite.
 * News remains a separate contextual intelligence layer.
 */
(function (root) {
  const CFG = root.ACCUMULATION_CONFIG || (typeof require === 'function' ? require('./config') : null);
  const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const num = v => finite(v) ? Number(v) : null;
  const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const pct = (a, b) => finite(a) && finite(b) && Number(b) !== 0 ? ((Number(a) / Number(b)) - 1) * 100 : null;
  const dateKey = value => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value);
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  };

  function sortRows(rows) {
    return (rows || []).filter(Boolean).map(r => ({ ...r, trade_date: dateKey(r.trade_date || r.date) }))
      .filter(r => r.trade_date).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }

  function calculateObv(rows) {
    let obv = 0;
    return sortRows(rows).map((r, i, all) => {
      const close = num(r.close ?? r.last_price);
      const prev = num(i ? (all[i - 1].close ?? all[i - 1].last_price) : r.prev_close);
      const volume = num(r.volume) || 0;
      if (close !== null && prev !== null) {
        if (close > prev) obv += volume;
        else if (close < prev) obv -= volume;
      }
      return { ...r, obv };
    });
  }

  function scoreComponent(value, max) { return Math.max(0, Math.min(max, value)); }

  function evaluate(input) {
    const history = sortRows(input.history);
    const current = { ...(input.current || history[history.length - 1] || {}) };
    current.trade_date = dateKey(current.trade_date || current.date);
    const f = input.futures || null;
    const previousRows = history.filter(r => r.trade_date !== current.trade_date);
    const volumeHistory = previousRows.slice(-CFG.historyDays).map(r => num(r.volume)).filter(finite);
    const avgVolume = avg(volumeHistory);
    const currentVolume = num(current.volume);
    const volumeRatio = currentVolume !== null && avgVolume ? currentVolume / avgVolume : null;
    const close = num(current.close ?? current.last_price);
    const prevClose = num(current.prev_close);
    const priceChangePct = pct(close, prevClose);
    const deliveryPct = num(current.deliv_per ?? current.delivery_pct);
    const deliveryQty = num(current.deliv_qty ?? current.delivery_qty);
    const deliveryHistory = history.slice(-CFG.deliveryTrendLookback).map(r => num(r.deliv_per ?? r.delivery_pct)).filter(finite);
    const priorDeliveryAvg = deliveryHistory.length > 1 ? avg(deliveryHistory.slice(0, -1)) : null;
    const deliveryTrend = deliveryPct !== null && priorDeliveryAvg !== null ? deliveryPct - priorDeliveryAvg : null;

    const obvRows = calculateObv(history);
    const obvCurrent = obvRows.length ? obvRows[obvRows.length - 1].obv : null;
    const obvStart = obvRows.length > CFG.obvLookback ? obvRows[obvRows.length - 1 - CFG.obvLookback].obv : null;
    const obvTrend = finite(obvCurrent) && finite(obvStart) ? obvCurrent - obvStart : null;

    const futuresDate = f && (f.trade_date || f.date);
    const oiExactDate = !!f && dateKey(futuresDate) === current.trade_date;
    const oi = oiExactDate ? num(f.oi ?? f.open_interest) : null;
    const changeOi = oiExactDate ? num(f.change_oi ?? f.change_in_oi) : null;
    const oiConfirmed = oi !== null && changeOi !== null;
    const isFno = oiConfirmed;
    const weights = isFno ? CFG.weights.fno : CFG.weights.cash;

    let score = 0;
    let availableWeight = 0;
    const why = [];
    const components = [];
    const pillars = { volume: false, delivery: false, obv: false, futuresOi: false };

    function add(name, weight, points, detail) {
      if (points === null) return;
      score += points;
      availableWeight += weight;
      components.push({ name, weight, points: Math.round(points * 100) / 100, detail });
      if (detail) why.push(detail);
    }

    if (priceChangePct !== null) {
      let points;
      if (priceChangePct > 0.50) points = weights.price;
      else if (priceChangePct >= 0.10) points = weights.price * 0.80;
      else if (priceChangePct >= -0.20) points = weights.price * 0.55;
      else points = 0;
      add('Price action', weights.price, scoreComponent(points, weights.price), priceChangePct >= -0.20 ? `Price change is ${priceChangePct.toFixed(2)}%.` : 'Price is below the accumulation safety floor.');
    }

    if (volumeRatio !== null) {
      let points = volumeRatio >= 1.30 ? weights.volume : volumeRatio >= 1.00 ? weights.volume * (10 / 15) : volumeRatio >= 0.65 ? weights.volume * 0.40 : 0;
      add('Volume', weights.volume, points, `Volume ratio is ${volumeRatio.toFixed(2)}x.`);
      pillars.volume = volumeRatio >= 1.00 || (volumeRatio >= 0.80 && deliveryPct !== null && deliveryPct >= 55);
    }

    if (deliveryPct !== null) {
      let points = deliveryPct >= 55 ? weights.delivery : deliveryPct >= 45 ? weights.delivery * 0.72 : deliveryPct >= 35 ? weights.delivery * 0.40 : 0;
      if (deliveryTrend !== null && deliveryTrend > 0) points += weights.delivery * 0.08;
      add('Delivery', weights.delivery, Math.min(weights.delivery, points), deliveryTrend !== null && deliveryTrend > 0 ? `Delivery is ${deliveryPct.toFixed(1)}% and trending higher.` : `Delivery is ${deliveryPct.toFixed(1)}%.`);
      pillars.delivery = deliveryPct >= 45;
    }

    if (obvTrend !== null) {
      const points = obvTrend > 0 ? weights.obv : obvTrend === 0 ? weights.obv * 0.40 : 0;
      add('OBV', weights.obv, points, obvTrend > 0 ? 'OBV is rising over the lookback.' : obvTrend === 0 ? 'OBV is flat.' : 'OBV is falling.');
      pillars.obv = obvTrend > 0;
    }

    if (isFno) {
      let points = changeOi > 0 ? weights.futuresOi : changeOi === 0 ? weights.futuresOi * 0.40 : 0;
      add('Futures OI', weights.futuresOi, points, changeOi > 0 ? `Futures OI increased on the exact trading date (+${changeOi}).` : `Futures OI change is ${changeOi}.`);
      pillars.futuresOi = changeOi > 0;
    }

    const normalizedScore = availableWeight ? (score / availableWeight) * 100 : null;
    const enoughHistory = history.length >= CFG.minConfirmedHistory;
    const safetyFailures = [];
    if (!(priceChangePct !== null && priceChangePct >= CFG.safety.minPriceChangePct)) safetyFailures.push(`price change is below ${CFG.safety.minPriceChangePct}%`);
    if (!(deliveryPct !== null && deliveryPct >= CFG.safety.minDeliveryPct)) safetyFailures.push(`delivery is below ${CFG.safety.minDeliveryPct}%`);
    if (!enoughHistory) safetyFailures.push(`history is shorter than ${CFG.minConfirmedHistory} sessions`);

    const availablePillars = isFno ? 4 : 3;
    const confirmedQuorum = isFno ? CFG.quorum.fno.confirmed : CFG.quorum.cash.confirmed;
    const startingQuorum = isFno ? CFG.quorum.fno.starting : CFG.quorum.cash.starting;
    const pillarCount = [pillars.volume, pillars.delivery, pillars.obv, isFno ? pillars.futuresOi : false].filter(Boolean).length;
    const quietAbsorption = !safetyFailures.length && normalizedScore !== null && normalizedScore >= CFG.verdicts.quiet &&
      volumeRatio !== null && volumeRatio >= CFG.volumeRatio.quietMin && volumeRatio <= CFG.volumeRatio.quietMax &&
      deliveryPct >= 55 && obvTrend !== null && obvTrend > 0 && Math.abs(priceChangePct) <= CFG.flatPricePct;

    let verdict = 'UNCONFIRMED / MIXED';
    if (!safetyFailures.length && normalizedScore !== null && normalizedScore >= CFG.verdicts.confirmed && pillarCount >= confirmedQuorum) {
      verdict = 'ACCUMULATION CONFIRMED';
    } else if (quietAbsorption) {
      verdict = 'QUIET ABSORPTION';
    } else if (!safetyFailures.length && normalizedScore !== null && normalizedScore >= CFG.verdicts.starting && pillarCount >= startingQuorum) {
      verdict = 'ACCUMULATION STARTING';
    } else if (normalizedScore !== null && normalizedScore < CFG.verdicts.mixed) {
      verdict = 'DISTRIBUTION';
    }

    const gateFailures = safetyFailures.slice();
    if (!isFno && normalizedScore !== null && normalizedScore >= CFG.verdicts.confirmed && pillarCount < confirmedQuorum) gateFailures.push(`cash-equity quorum is ${pillarCount}/${availablePillars}, requires ${confirmedQuorum}/${availablePillars}`);
    if (isFno && normalizedScore !== null && normalizedScore >= CFG.verdicts.confirmed && pillarCount < confirmedQuorum) gateFailures.push(`F&O quorum is ${pillarCount}/${availablePillars}, requires ${confirmedQuorum}/${availablePillars}`);
    if (!isFno) why.push('Futures OI is unavailable; accumulation is evaluated on the three equity pillars.');
    if (gateFailures.length) why.push(`Confirmation conditions not all satisfied: ${gateFailures.join('; ')}.`);
    if (deliveryPct === null) why.push('Delivery data is unavailable.');
    if (volumeRatio === null) why.push('Volume history is insufficient for a reliable ratio.');
    if (!history.length) why.push('No verified EOD history is available.');

    return {
      symbol: String(input.symbol || current.symbol || '').toUpperCase(),
      tradeDate: current.trade_date || null,
      score: normalizedScore === null ? null : Math.round(normalizedScore),
      verdict,
      metrics: { close, prevClose, priceChangePct, volume: currentVolume, avgVolume, volumeRatio, deliveryPct, deliveryQty, deliveryTrend, obv: obvCurrent, obvTrend, futuresOi: oi, changeOi, oiExactDate, fnoAvailable: isFno, pillarCount, availablePillars },
      components,
      why,
      confirmation: { status: verdict === 'ACCUMULATION CONFIRMED' ? 'confirmed' : 'blocked', gateFailures, quorum: { passed: pillarCount, required: confirmedQuorum, available: availablePillars } }
    };
  }

  root.ACCUMULATION_ENGINE = { evaluate, calculateObv };
  if (typeof module !== 'undefined') module.exports = { evaluate, calculateObv };
})(typeof window !== 'undefined' ? window : globalThis);
