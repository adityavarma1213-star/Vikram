'use strict';
const { istStamp, istParts } = require('./dates');

const HEADER = ['symbol', 'security_id', 'exchange_segment', 'interval', 'timestamp_ist', 'date_ist', 'open', 'high', 'low', 'close', 'volume'];

// Guard against spreadsheet formula injection: a text cell starting with = + - @ gets a quote.
function safeText(v) {
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
function cell(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(candles, meta) {
  const lines = [HEADER.join(',')];
  for (const c of candles) {
    lines.push([
      cell(safeText(meta.symbol)), cell(safeText(meta.securityId)), meta.exchangeSegment, meta.interval,
      istStamp(c.ts), istParts(c.ts).date, c.open, c.high, c.low, c.close, c.volume,
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

function csvFilename({ symbol, interval, from, to, complete }) {
  const safe = String(symbol).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 30);
  return `dhan_${safe}_${interval}_${from}_${to}${complete ? '' : '_PARTIAL'}.csv`;
}

module.exports = { toCsv, csvFilename, HEADER };
