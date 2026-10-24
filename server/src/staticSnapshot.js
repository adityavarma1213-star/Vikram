const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { formatYmd } = require('./istDate');
const { buildScannerResults, buildPeriodResults, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');

const ROOT = path.resolve(__dirname, '../..');
const accumulationEngine = require(path.join(ROOT, 'accumulation', 'engine'));
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'market-history');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'scanner.json');
function clean(v) { return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim(); }
function num(v) { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : null; }
function parseCsv(buf) { return parse(buf.toString('utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: false, bom: true }); }
function requireColumns(rows, source, columns) { if (!rows.length) throw new Error(`${source}: empty CSV`); const headers = new Set(Object.keys(rows[0])); const missing = columns.filter(column => !headers.has(column)); if (missing.length) throw new Error(`${source}: schema mismatch; missing columns: ${missing.join(', ')}`); }
function sourceTradeDate(rows, requestedDate, source) { const actual = clean(rows.find(r => clean(r.TradDt))?.TradDt); if (!actual) throw new Error(`${source}: missing TradDt source date`); if (actual.slice(0, 10) !== formatYmd(requestedDate)) throw new Error(`${source}: archive returned ${actual.slice(0, 10)} while ${formatYmd(requestedDate)} was requested`); return actual.slice(0, 10); }
function readHistory() { fs.mkdirSync(HISTORY_DIR, { recursive: true }); return fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(-MATERIALIZE_LOOKBACK_DAYS).map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8'))); }
function writeHistory(snapshot) { fs.mkdirSync(HISTORY_DIR, { recursive: true }); fs.writeFileSync(path.join(HISTORY_DIR, `${snapshot.tradeDate}.json`), `${JSON.stringify(snapshot)}\n`); const files = fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort(); for (const name of files.slice(0, -MATERIALIZE_LOOKBACK_DAYS)) fs.unlinkSync(path.join(HISTORY_DIR, name)); }
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
  const out = new Map();
  for (const result of currentResults || []) { if (result.verdict !== 'ACCUMULATION CONFIRMED') continue; const symbol = String(result.symbol || '').toUpperCase(); const rows = bySymbol.get(symbol) || []; if (!rows.length) continue; const latestDate = String(result.tradeDate || rows[rows.length - 1].trade_date); const latestIndex = rows.findIndex(r => String(r.trade_date) === latestDate); if (latestIndex < 0) continue; let detectedTradingDays = 0; let firstDetectedDate = null; for (let i = latestIndex; i >= 0; i -= 1) { const current = rows[i]; const history = rows.slice(0, i + 1); const exact = futures.get(`${symbol}|${current.trade_date}`); const futureState = exact || { available: false, derivativesSupported: derivativesSymbols.has(symbol), trade_date: current.trade_date }; const evaluated = accumulationEngine.evaluate({ symbol, history, current, futures: futureState }); if (evaluated.verdict !== 'ACCUMULATION CONFIRMED') break; detectedTradingDays += 1; firstDetectedDate = current.trade_date; } if (detectedTradingDays) out.set(symbol, { firstDetectedDate, latestDetectedDate: latestDate, detectedTradingDays, detectionStatus: detectedTradingDays === 1 ? 'New' : 'Active' }); }
  return out;
}
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { readHistory, writeHistory, materialize, buildCurrentDetection };
