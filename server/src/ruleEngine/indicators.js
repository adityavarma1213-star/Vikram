'use strict';

function num(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }
function rows(history) { return (history || []).map(r => ({
  open: num(r.open), high: num(r.high), low: num(r.low), close: num(r.close ?? r.last_price), volume: num(r.volume)
})); }
function closes(history) { return rows(history).map(r => r.close).filter(v => v !== null); }
function sma(values, n) { return values.length < n ? null : values.slice(-n).reduce((a, b) => a + b, 0) / n; }
function ema(values, n) {
  if (values.length < n) return null;
  let e = sma(values.slice(0, n), n); const k = 2 / (n + 1);
  for (let i = n; i < values.length; i += 1) e = values[i] * k + e * (1 - k);
  return e;
}
function rsi(values, n = 14) {
  if (values.length <= n) return null;
  let gains = 0; let losses = 0;
  for (let i = 1; i <= n; i += 1) { const d = values[i] - values[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0); }
  let avgGain = gains / n; let avgLoss = losses / n;
  for (let i = n + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
function trueRanges(rs) {
  const out = [];
  for (let i = 0; i < rs.length; i += 1) {
    const r = rs[i]; if (r.high === null || r.low === null) continue;
    const prev = i > 0 ? rs[i - 1].close : null;
    out.push(Math.max(r.high - r.low, prev === null ? 0 : Math.abs(r.high - prev), prev === null ? 0 : Math.abs(r.low - prev)));
  }
  return out;
}
function atr(rs, n = 14) { return sma(trueRanges(rs), n); }
function adx(rs, n = 14) {
  if (rs.length < n + 1) return null;
  const trs = []; const plus = []; const minus = [];
  for (let i = 1; i < rs.length; i += 1) {
    const cur = rs[i]; const prev = rs[i - 1];
    if ([cur.high, cur.low, prev.close].some(v => v === null)) continue;
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
    const up = cur.high - prev.high; const down = prev.low - cur.low;
    plus.push(up > down && up > 0 ? up : 0); minus.push(down > up && down > 0 ? down : 0);
  }
  if (trs.length < n) return null;
  const tr = sma(trs, n); const p = sma(plus, n); const m = sma(minus, n);
  if (tr === null || tr === 0 || p === null || m === null) return null;
  const pdi = 100 * p / tr; const mdi = 100 * m / tr;
  return pdi + mdi === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi);
}
function obv(rs) {
  if (!rs.length) return null; let value = 0;
  for (let i = 1; i < rs.length; i += 1) {
    if (rs[i].close === null || rs[i - 1].close === null || rs[i].volume === null) continue;
    if (rs[i].close > rs[i - 1].close) value += rs[i].volume;
    else if (rs[i].close < rs[i - 1].close) value -= rs[i].volume;
  }
  return value;
}
function macd(values, fast = 12, slow = 26, signal = 9) {
  if (values.length < slow + signal) return null;
  const line = [];
  for (let i = slow; i <= values.length; i += 1) {
    const part = values.slice(0, i); line.push(ema(part, fast) - ema(part, slow));
  }
  const macdLine = line[line.length - 1]; const signalLine = ema(line, signal);
  return { line: macdLine, signal: signalLine, histogram: signalLine === null ? null : macdLine - signalLine };
}
function bollinger(values, n = 20, mult = 2) {
  if (values.length < n) return null;
  const slice = values.slice(-n); const middle = sma(slice, n);
  const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / n; const sd = Math.sqrt(variance);
  return { middle, upper: middle + mult * sd, lower: middle - mult * sd };
}
function stochastic(rs, n = 14) {
  if (rs.length < n) return null;
  const slice = rs.slice(-n); const highs = slice.map(r => r.high).filter(v => v !== null); const lows = slice.map(r => r.low).filter(v => v !== null);
  const close = slice[slice.length - 1].close; if (close === null || !highs.length || !lows.length) return null;
  const high = Math.max(...highs); const low = Math.min(...lows); return high === low ? 100 : 100 * (close - low) / (high - low);
}
function cci(rs, n = 20) {
  const typical = rs.map(r => r.high !== null && r.low !== null && r.close !== null ? (r.high + r.low + r.close) / 3 : null).filter(v => v !== null);
  if (typical.length < n) return null;
  const mean = sma(typical, n); const slice = typical.slice(-n); const dev = slice.reduce((s, v) => s + Math.abs(v - mean), 0) / n;
  return dev === 0 ? 0 : (typical[typical.length - 1] - mean) / (0.015 * dev);
}
function indicator(name, history) {
  const key = String(name || '').toUpperCase().replace(/\s+/g, '');
  const match = key.match(/\d+/); const n = match ? Number(match[0]) : 14;
  const rs = rows(history); const v = rs.map(r => r.close).filter(x => x !== null);
  if (key.startsWith('SMA')) return sma(v, n);
  if (key.startsWith('EMA')) return ema(v, n);
  if (key.startsWith('RSI')) return rsi(v, n);
  if (key === 'MACD' || key === 'MACDLINE') return macd(v)?.line ?? null;
  if (key === 'MACDSIGNAL') return macd(v)?.signal ?? null;
  if (key === 'MACDHIST' || key === 'MACDHISTOGRAM') return macd(v)?.histogram ?? null;
  if (key === 'BBUPPER' || key === 'BOLLINGERUPPER') return bollinger(v, n || 20)?.upper ?? null;
  if (key === 'BBMIDDLE' || key === 'BOLLINGERMIDDLE') return bollinger(v, n || 20)?.middle ?? null;
  if (key === 'BBLOWER' || key === 'BOLLINGERLOWER') return bollinger(v, n || 20)?.lower ?? null;
  if (key.startsWith('ATR')) return atr(rs, n);
  if (key.startsWith('ADX')) return adx(rs, n);
  if (key === 'OBV') return obv(rs);
  if (key.startsWith('STOCHASTIC') || key.startsWith('STOCH')) return stochastic(rs, n);
  if (key.startsWith('CCI')) return cci(rs, n || 20);
  return null;
}

module.exports = { sma, ema, rsi, atr, adx, obv, macd, bollinger, stochastic, cci, indicator };
