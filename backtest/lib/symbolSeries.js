'use strict';
// Per-symbol chronological series index over data/market-history/*.json.
//
// AccumulationDNA/SOAI/FalseAccumulationDetector all need "this symbol's CM
// and F&O rows in date order, up to some as-of date" repeatedly. Rather than
// each module re-scanning every market-history file, this builds one
// in-memory index (real data only, read once per process) and every
// downstream lookup below is a plain array slice.
//
// NO-LOOK-AHEAD: every function here takes an `asOfDate` and filters strictly
// to `trade_date <= asOfDate`. Callers must never pass a future date's data
// into a calculation meant to represent what was knowable at asOfDate.

const fs = require('fs');
const path = require('path');

function defaultHistoryDir() {
  return path.join(__dirname, '..', '..', 'data', 'market-history');
}

function buildIndex(historyDir = defaultHistoryDir()) {
  const cmBySymbol = new Map();
  const foBySymbol = new Map();
  const allDates = [];

  const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort();
  for (const f of files) {
    let file;
    try { file = JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf8')); }
    catch (e) { continue; } // malformed files are handled/flagged by dataContract & staleDuplicateDetector, not here
    const date = f.replace('.json', '');
    allDates.push(date);
    for (const row of file.cm || []) {
      const sym = String(row.symbol || '').toUpperCase();
      if (!sym) continue;
      if (!cmBySymbol.has(sym)) cmBySymbol.set(sym, []);
      cmBySymbol.get(sym).push({ trade_date: row.trade_date || date, close: row.close ?? null, prev_close: row.prev_close ?? null, volume: row.volume ?? null, deliv_qty: row.deliv_qty ?? null, deliv_per: row.deliv_per ?? null });
    }
    for (const row of file.futures || []) {
      const sym = String(row.symbol || '').toUpperCase();
      if (!sym) continue;
      if (!foBySymbol.has(sym)) foBySymbol.set(sym, []);
      foBySymbol.get(sym).push({ trade_date: row.trade_date || date, expiry: row.expiry ?? null, close: row.close ?? null, oi: row.oi ?? null, change_oi: row.change_oi ?? null });
    }
  }
  // sort each symbol's rows chronologically once, up front
  for (const arr of cmBySymbol.values()) arr.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  for (const arr of foBySymbol.values()) arr.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  allDates.sort();

  return {
    // Rows with trade_date <= asOfDate, most-recent-last. Never includes anything after asOfDate.
    cmSeriesAsOf(symbol, asOfDate) {
      const rows = cmBySymbol.get(String(symbol).toUpperCase()) || [];
      return rows.filter(r => r.trade_date <= asOfDate);
    },
    foSeriesAsOf(symbol, asOfDate) {
      const rows = foBySymbol.get(String(symbol).toUpperCase()) || [];
      return rows.filter(r => r.trade_date <= asOfDate);
    },
    symbols() { return [...cmBySymbol.keys()]; },
    allTradingDates() { return allDates; }
  };
}

// Process-wide singleton so repeated calls across engines in one run don't
// re-read 263+ files from disk each time. Explicit reset for tests.
let _cached = null;
function getSharedIndex(historyDir) {
  if (!_cached || historyDir) _cached = buildIndex(historyDir);
  return _cached;
}
function _resetSharedIndexForTests() { _cached = null; }

module.exports = { buildIndex, getSharedIndex, _resetSharedIndexForTests };
