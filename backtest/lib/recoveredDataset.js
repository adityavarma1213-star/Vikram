'use strict';
// Builds the replay input from data/market-history (the repaired, hash-traceable daily snapshots).
// Read-only: no file under data/ or backtest/data/ is written or altered.
//
// Rules:
//   - Rows are used exactly as stored. Nothing is filled, interpolated or defaulted.
//   - The same stale-duplicate (non-trading day) detector the original backtest uses is applied.
//   - A day whose delivery column is entirely zero/missing is NOT used as market data. It is
//     reported as DATA_INSUFFICIENT and excluded, so it can never pass as a valid scan.
//   - Futures: the earliest-expiry contract per symbol/date, exactly as backtestRunner.js and
//     staticSnapshot.js select it (the V15 pipeline's existing, unchanged behaviour).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scanForStaleDuplicates } = require('./staleDuplicateDetector');
const { assessDeliveryDay } = require('../../server/src/dataQuality');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function loadMarketHistoryDataset({ historyDir, from = null, to = null }) {
  const files = fs.readdirSync(historyDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const fileHashes = [];
  const cmByDate = {};
  const foByDate = {};
  for (const file of files) {
    const date = file.slice(0, 10);
    if ((from && date < from) || (to && date > to)) continue;
    const buf = fs.readFileSync(path.join(historyDir, file));
    const day = JSON.parse(buf.toString('utf8'));
    if (day.tradeDate !== date) throw new Error(`${file}: tradeDate ${day.tradeDate} does not match file name`);
    fileHashes.push({ date, sha256: sha256(buf) });
    cmByDate[date] = day.cm || [];
    foByDate[date] = day.futures || [];
  }
  const sessions = Object.keys(cmByDate).sort();
  const datasetVersion = sha256(Buffer.from(fileHashes.map(f => `${f.date}:${f.sha256}`).join('\n')));

  // Non-trading-day exclusion: identical detector to the original backtest.
  const excluded = new Map();
  for (const finding of scanForStaleDuplicates(cmByDate)) {
    if (finding.result.isStaleDuplicate) excluded.set(finding.date, { reason: 'STALE_DUPLICATE_OF_PREVIOUS_DAY', previousDate: finding.previousDate, matchRatio: finding.result.matchRatio });
  }

  // Whole-day delivery quality.
  const dayQuality = {};
  for (const date of sessions) {
    const q = assessDeliveryDay(cmByDate[date]);
    dayQuality[date] = q;
    if (q.status !== 'OK' && !excluded.has(date)) excluded.set(date, { reason: `DATA_INSUFFICIENT_${q.status}`, assessment: q });
  }

  const bySymbol = new Map();
  const futuresBySymbolDate = new Map();
  for (const date of sessions) {
    if (excluded.has(date)) continue;
    for (const row of cmByDate[date]) {
      if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
      bySymbol.get(row.symbol).push(row);
    }
    for (const row of foByDate[date]) {
      const key = `${row.symbol}|${row.trade_date}`;
      const existing = futuresBySymbolDate.get(key);
      if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row);
    }
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  const foDates = new Set(sessions.filter(d => foByDate[d].length > 0));
  return {
    source: 'data/market-history', datasetVersion, fileHashes, sessions,
    usableSessions: sessions.filter(d => !excluded.has(d)),
    excluded: Object.fromEntries(excluded), dayQuality, foDates: [...foDates].sort(),
    bySymbol, futuresBySymbolDate
  };
}

module.exports = { loadMarketHistoryDataset, sha256 };
