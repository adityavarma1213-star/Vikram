'use strict';
const { istParts, istStamp, addDays } = require('./dates');

// Turn Dhan's parallel arrays into candle objects. Throws on structurally broken payloads.
function parseCandles(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Response is not a JSON object.');
  const keys = ['open', 'high', 'low', 'close', 'volume', 'timestamp'];
  for (const k of keys) {
    if (!Array.isArray(payload[k])) throw new Error(`Response is missing array "${k}".`);
  }
  const n = payload.timestamp.length;
  for (const k of keys) {
    if (payload[k].length !== n) throw new Error(`Response arrays have different lengths ("${k}" has ${payload[k].length}, timestamp has ${n}).`);
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      ts: Number(payload.timestamp[i]), open: Number(payload.open[i]), high: Number(payload.high[i]),
      low: Number(payload.low[i]), close: Number(payload.close[i]), volume: Number(payload.volume[i]),
    });
  }
  return rows;
}

// Validate and clean. Never invents or repairs a price: bad rows are DROPPED and counted.
function validateCandles(rows, { interval, from, to }) {
  const report = { received: rows.length, kept: 0, duplicatesDropped: 0, invalidDropped: 0, outOfRangeDropped: 0, invalidExamples: [] };
  const seen = new Set(); const kept = [];
  for (const r of rows) {
    const nums = [r.ts, r.open, r.high, r.low, r.close, r.volume];
    let problem = null;
    if (!nums.every(Number.isFinite)) problem = 'non-numeric value';
    else if (r.open <= 0 || r.high <= 0 || r.low <= 0 || r.close <= 0) problem = 'non-positive price';
    else if (r.volume < 0) problem = 'negative volume';
    else if (r.high < Math.max(r.open, r.close, r.low) || r.low > Math.min(r.open, r.close, r.high)) problem = 'OHLC relationship broken';
    if (problem) {
      report.invalidDropped++;
      if (report.invalidExamples.length < 5) report.invalidExamples.push(`${Number.isFinite(r.ts) ? istStamp(r.ts) : 'bad-timestamp'}: ${problem}`);
      continue;
    }
    const p = istParts(r.ts);
    if (p.date < from || p.date > to) { report.outOfRangeDropped++; continue; }
    if (seen.has(r.ts)) { report.duplicatesDropped++; continue; }
    seen.add(r.ts);
    kept.push(r);
  }
  kept.sort((a, b) => a.ts - b.ts);
  report.kept = kept.length;
  return { candles: kept, report };
}

// Coverage: which weekdays in range have no candle at all (could be exchange holidays -- we do
// NOT claim they are errors, we only report them). Intraday: days with fewer than expected bars.
function coverage(candles, { interval, from, to }) {
  const days = new Map();
  for (const c of candles) { const d = istParts(c.ts).date; days.set(d, (days.get(d) || 0) + 1); }
  const missingWeekdays = [];
  for (let d = from, guard = 0; d <= to && guard < 12000; d = addDays(d, 1), guard++) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6 && !days.has(d)) missingWeekdays.push(d);
  }
  const out = {
    tradingDaysWithData: days.size,
    weekdaysWithoutData: missingWeekdays.length,
    weekdaysWithoutDataSample: missingWeekdays.slice(0, 20),
    firstCandle: candles.length ? istStamp(candles[0].ts) : null,
    lastCandle: candles.length ? istStamp(candles[candles.length - 1].ts) : null,
    note: 'Weekdays without data may be NSE holidays. VIKRAM does not guess which.',
  };
  if (interval === '5m') {
    const FULL_DAY_BARS = 75;                      // 09:15-15:30 IST = 375 min / 5
    const short = [];
    for (const [d, n] of days) if (n < FULL_DAY_BARS) short.push(`${d} (${n} bars)`);
    out.intradayDaysWithFewerThan75Bars = short.length;
    out.intradayShortDaysSample = short.slice(0, 20);
  }
  return out;
}

module.exports = { parseCandles, validateCandles, coverage };
