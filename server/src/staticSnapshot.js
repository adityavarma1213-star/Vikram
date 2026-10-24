// DIRECT NSE ACQUISITION REMOVED (see docs/NSE_ACQUISITION_REMOVED.md).
// This module no longer downloads or requests anything from NSE. The former fetchCm / fetchFo /
// fetchUniverse / ingestLatest / writeHistory functions, the NSE URL constants and request headers,
// raw-byte capture and the CLI entrypoint were deleted. Only offline parsing helpers and the
// history-reading / scanner-materialization logic over ALREADY-STORED data remain.
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { formatYmd } = require('./istDate');
const { buildScannerResults, buildPeriodResults, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');
const { buildDetectionMap } = require('./detectionHistory');

const ROOT = path.resolve(__dirname, '../..');
const accumulationEngine = require(path.join(ROOT, 'accumulation', 'engine'));
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'market-history');
function clean(v) { return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim(); }
function num(v) { if (v === undefined || v === null || String(v).trim() === '') return null; const x = Number(String(v).replace(/,/g, '')); return Number.isFinite(x) ? x : null; }
function parseCsv(buf) { return parse(buf.toString('utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: false, bom: true }); }
function requireColumns(rows, source, columns) { if (!rows.length) throw new Error(`${source}: empty CSV`); const headers = new Set(Object.keys(rows[0])); const missing = columns.filter(column => !headers.has(column)); if (missing.length) throw new Error(`${source}: schema mismatch; missing columns: ${missing.join(', ')}`); }
function sourceTradeDate(rows, requestedDate, source) { const actual = clean(rows.find(r => clean(r.TradDt))?.TradDt); if (!actual) throw new Error(`${source}: missing TradDt source date`); if (actual.slice(0, 10) !== formatYmd(requestedDate)) throw new Error(`${source}: archive returned ${actual.slice(0, 10)} while ${formatYmd(requestedDate)} was requested`); return actual.slice(0, 10); }
function readHistory() { fs.mkdirSync(HISTORY_DIR, { recursive: true }); return fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(-MATERIALIZE_LOOKBACK_DAYS).map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8'))); }
function materialize(historySnapshots) {
  const historyBySymbol = new Map(); const futuresBySymbolDate = new Map(); const derivativesSymbols = new Set();
  for (const day of historySnapshots) { for (const row of day.cm || []) { if (!historyBySymbol.has(row.symbol)) historyBySymbol.set(row.symbol, []); historyBySymbol.get(row.symbol).push(row); } for (const row of day.futures || []) { const key = `${row.symbol}|${row.trade_date}`; derivativesSymbols.add(String(row.symbol || '').toUpperCase()); const existing = futuresBySymbolDate.get(key); if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row); } }
  for (const rows of historyBySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  return { results: buildScannerResults(historyBySymbol, futuresBySymbolDate, derivativesSymbols), periods: buildPeriodResults(historyBySymbol, futuresBySymbolDate, derivativesSymbols), derivativesSymbols };
}
function buildCurrentDetection(historySnapshots, currentResults) {
  const bySymbol = new Map(); const futures = new Map(); const derivativesSymbols = new Set();
  for (const day of historySnapshots) { for (const row of day.cm || []) { const symbol = String(row.symbol || '').toUpperCase(); if (!symbol) continue; if (!bySymbol.has(symbol)) bySymbol.set(symbol, []); bySymbol.get(symbol).push(row); } for (const row of day.futures || []) { const symbol = String(row.symbol || '').toUpperCase(); derivativesSymbols.add(symbol); const key = `${symbol}|${row.trade_date}`; const existing = futures.get(key); if (!existing || String(row.expiry) < String(existing.expiry)) futures.set(key, row); } }
  for (const rows of bySymbol.values()) rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  // Delegates to the canonical shared calculator (server/src/detectionHistory.js), which both
  // this static-snapshot path and the live ingest.js path call, so the two deployment modes
  // cannot silently drift out of feature parity with each other again.
  return buildDetectionMap(bySymbol, futures, derivativesSymbols, currentResults, accumulationEngine.evaluate);
}
module.exports = { readHistory, materialize, buildCurrentDetection, parseCsv, requireColumns, sourceTradeDate, num };