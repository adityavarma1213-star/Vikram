const CFG = require('../../accumulation/config');
const { evaluate: evaluateAccumulation, dateKey: accumulationDateKey } = require('../../accumulation/engine');

function dateKey(value) {
  return accumulationDateKey(value);
}

const num = value => { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
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

// The accumulation engine is the single source of truth for accumulation scoring,
// hard confirmation gates, and verdicts. This wrapper only adds the broader technical snapshot.
function evaluate(symbol, history, futures) {
  const rows = sortRows(history);
  const current = rows[rows.length - 1] || {};
  const result = evaluateAccumulation({ symbol, history: rows, current, futures });
  return {
    ...result,
    technical: technical(rows),
    financial: null
  };
}

module.exports = { evaluate, CFG, dateKey, technical };
