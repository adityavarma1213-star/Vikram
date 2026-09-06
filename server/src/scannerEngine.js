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
const num = value => { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function dateKey(value) { if (value === null || value === undefined) return null; if (value instanceof Date) return value.toISOString().slice(0, 10); return String(value).slice(0, 10); }
const sortRows = rows => (rows || []).slice().sort((a, b) => (dateKey(a.trade_date) || '').localeCompare(dateKey(b.trade_date) || ''));
function sma(values, n) { return values.length >= n ? average(values.slice(-n)) : null; }
function ema(values, n) { if (values.length < n) return null; let e = sma(values.slice(0, n), n); const k = 2 / (n + 1); for (let i = n; i < values.length; i += 1) e = values[i] * k + e * (1 - k); return e; }
function rsi(values, n = 14) { if (values.length <= n) return null; let gains = 0; let losses = 0; for (let i = 1; i <= n; i += 1) { const d = values[i] - values[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0); } let avgGain = gains / n; let avgLoss = losses / n; for (let i = n + 1; i < values.length; i += 1) { const d = values[i] - values[i - 1]; avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n; avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n; } if (avgLoss === 0) return 100; return 100 - 100 / (1 + avgGain / avgLoss); }
function macd(values) { const lineSeries = []; for (let i = 0; i < values.length; i += 1) { const e12 = ema(values.slice(0, i + 1), 12); const e26 = ema(values.slice(0, i + 1), 26); if (e12 !== null && e26 !== null) lineSeries.push(e12 - e26); } if (lineSeries.length < 9) return { line: null, signal: null, histogram: null }; const line = lineSeries.at(-1); const signal = ema(lineSeries, 9); return { line, signal, histogram: signal === null ? null : line - signal }; }
function technical(history) {
  const rows = sortRows(history); const closes = rows.map(r => num(r.close ?? r.last_price)).filter(v => v !== null); const volumes = rows.map(r => num(r.volume)).filter(v => v !== null); const current = rows.at(-1) || {}; const volume = num(current.volume); const avgVolume20 = sma(volumes.slice(0, -1), 20); const deliveryPct = num(current.deliv_per);
  let obv = 0; const obvValues = [];
  for (let i = 1; i < rows.length; i += 1) { const c = num(rows[i].close ?? rows[i].last_price); const p = num(rows[i - 1].close ?? rows[i - 1].last_price); const v = num(rows[i].volume); if (c !== null && p !== null && v !== null) { if (c > p) obv += v; else if (c < p) obv -= v; } obvValues.push(obv); }
  const obvTrend = obvValues.length > 5 ? obvValues.at(-1) - obvValues.at(-6) : null; const macdValue = macd(closes); const recent = closes.slice(-20);
  return { rsi14: rsi(closes, 14), macd: macdValue.line, macdSignal: macdValue.signal, macdHistogram: macdValue.histogram, adx14: null, ema20: ema(closes, 20), ema50: ema(closes, 50), ema200: ema(closes, 200), support: recent.length ? Math.min(...recent) : null, resistance: recent.length ? Math.max(...recent) : null, volume, volumeRatio: volume !== null && avgVolume20 ? volume / avgVolume20 : null, obv: obvValues.length ? obv : null, obvTrend, deliveryPct, high52Week: closes.length ? Math.max(...closes.slice(-252)) : null, low52Week: closes.length ? Math.min(...closes.slice(-252)) : null, adxAvailable: false, dataNote: 'Calculated from verified NSE EOD CM history. ADX requires high/low fields not currently ingested.' };
}
function evaluate(symbol, history, futures) {
  const rows = sortRows(history); const current = rows[rows.length - 1] || {}; const prior = rows.slice(0, -1); const why = [];
  const volumes = prior.slice(-CFG.historyDays).map(r => num(r.volume)).filter(v => v !== null); const avgVolume = average(volumes); const volume = num(current.volume); const volumeRatio = volume !== null && avgVolume ? volume / avgVolume : null;
  const close = num(current.close ?? current.last_price); const prevClose = num(current.prev_close); const priceChangePct = close !== null && prevClose !== null && prevClose !== 0 ? ((close / prevClose) - 1) * 100 : null;
  const deliveryPct = num(current.deliv_per); const deliveryQty = num(current.deliv_qty); const deliveryHistory = rows.slice(-CFG.deliveryLookback).map(r => num(r.deliv_per)).filter(v => v !== null); const previousDeliveryAverage = deliveryHistory.length > 1 ? average(deliveryHistory.slice(0, -1)) : null; const deliveryTrend = deliveryPct !== null && previousDeliveryAverage !== null ? deliveryPct - previousDeliveryAverage : null;
  let obv = 0; const obvValues = rows.map((row, index) => { const c = num(row.close ?? row.last_price); const previous = index > 0 ? num(rows[index - 1].close ?? rows[index - 1].last_price) : num(row.prev_close); const v = num(row.volume) || 0; if (c !== null && previous !== null) { if (c > previous) obv += v; else if (c < previous) obv -= v; } return obv; });
  const obvTrend = obvValues.length > CFG.obvLookback ? obvValues.at(-1) - obvValues[obvValues.length - 1 - CFG.obvLookback] : null; if (obvValues.length) obv = obvValues.at(-1);
  const exactFutures = futures && dateKey(futures.trade_date) === dateKey(current.trade_date) ? futures : null; const futuresOi = exactFutures ? num(exactFutures.oi) : null; const changeOi = exactFutures ? num(exactFutures.change_oi) : null;
  let score = 0; let availableWeight = 0; const add = (weight, points, explanation) => { if (points === null) return; score += points; availableWeight += weight; if (explanation) why.push(explanation); };
  if (priceChangePct !== null) add(CFG.weights.price, priceChangePct > CFG.flatPricePct ? 15 : priceChangePct >= -CFG.flatPricePct ? 9.75 : 2.25, priceChangePct > CFG.flatPricePct ? 'Price is firm/positive.' : priceChangePct >= -CFG.flatPricePct ? 'Price is broadly flat.' : 'Price is falling.'); else why.push('Price change data is unavailable.');
  if (volumeRatio !== null) add(CFG.weights.volume, volumeRatio >= CFG.volumeStrong ? 20 : volumeRatio >= CFG.volumeElevated ? 14 : volumeRatio >= 0.8 ? 7 : 0, `Volume ratio is ${volumeRatio.toFixed(2)}x.`); else why.push('Volume ratio is unavailable.');
  if (deliveryPct !== null) { const base = deliveryPct >= CFG.deliveryStrong ? 20 : deliveryPct >= CFG.deliveryPositive ? 14 : 5; const trendBonus = deliveryTrend !== null && deliveryTrend > 0 ? 3 : 0; add(CFG.weights.delivery, Math.min(20, base + trendBonus), deliveryTrend !== null && deliveryTrend > 0 ? `Delivery is ${deliveryPct.toFixed(1)}% and trending higher.` : `Delivery is ${deliveryPct.toFixed(1)}%.`); } else why.push('Delivery data is unavailable.');
  if (obvTrend !== null) add(CFG.weights.obv, obvTrend > 0 ? 15 : obvTrend === 0 ? 7.5 : 0, obvTrend > 0 ? 'OBV is rising.' : obvTrend === 0 ? 'OBV is flat.' : 'OBV is falling.'); else why.push('OBV trend needs more historical data.');
  if (futuresOi !== null && changeOi !== null) add(CFG.weights.futuresOi, changeOi > 0 ? 30 : changeOi === 0 ? 12 : 0, changeOi > 0 ? `Futures OI increased by ${changeOi} on the exact date.` : `Futures OI change is ${changeOi}.`); else if (futures && dateKey(futures.trade_date) !== dateKey(current.trade_date)) why.push('Futures OI data exists but not for the exact trade date, so it was not scored.'); else why.push('Futures OI confirmation is unavailable for the exact date.');
  const normalizedScore = availableWeight ? (score / availableWeight) * 100 : null; const hasConfirmedInputs = volumeRatio !== null && deliveryPct !== null && futuresOi !== null && changeOi !== null; const sufficientHistory = rows.length >= CFG.minConfirmedHistory;
  let verdict = 'UNCONFIRMED / MIXED'; if (normalizedScore !== null && normalizedScore >= CFG.confirmed && sufficientHistory && hasConfirmedInputs) verdict = 'ACCUMULATION CONFIRMED'; else if (normalizedScore !== null && normalizedScore >= CFG.starting && ((priceChangePct !== null && Math.abs(priceChangePct) <= CFG.flatPricePct && changeOi !== null && changeOi > 0) || (volumeRatio !== null && volumeRatio >= CFG.volumeElevated))) verdict = 'ACCUMULATION STARTING'; else if (normalizedScore !== null && normalizedScore < CFG.mixed) verdict = 'DISTRIBUTION';
  if (!sufficientHistory) why.push(`Only ${rows.length} historical rows are available; confirmed accumulation requires at least ${CFG.minConfirmedHistory}.`);
  return { symbol, tradeDate: dateKey(current.trade_date), score: normalizedScore === null ? null : Math.round(normalizedScore), verdict, metrics: { close, prevClose, priceChangePct, volume, avgVolume, volumeRatio, deliveryPct, deliveryQty, deliveryTrend, obv: obvValues.length ? obv : null, obvTrend, futuresOi, changeOi, oiExactDate: !!exactFutures }, technical: technical(rows), financial: null, why };
}
module.exports = { evaluate, CFG, dateKey, technical };