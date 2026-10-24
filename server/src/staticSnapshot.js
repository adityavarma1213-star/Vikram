// Direct NSE acquisition removed. Read-only materialization of previously stored snapshots.
const fs=require('fs'); const path=require('path');
const {buildScannerResults,buildPeriodResults,MATERIALIZE_LOOKBACK_DAYS}=require('./scanMaterializer');
const {buildDetectionMap}=require('./detectionHistory');
const ROOT=path.resolve(__dirname,'../..'); const DATA_DIR=path.join(ROOT,'data'); const HISTORY_DIR=path.join(DATA_DIR,'market-history'); const SNAPSHOT_FILE=path.join(DATA_DIR,'scanner.json'); const accumulationEngine=require(path.join(ROOT,'accumulation','engine'));
function readHistory() { if (!fs.existsSync(HISTORY_DIR)) return []; return fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(-MATERIALIZE_LOOKBACK_DAYS).map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8'))); }
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

module.exports={readHistory,materialize,buildCurrentDetection};
