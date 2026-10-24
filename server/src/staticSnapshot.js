// Direct NSE acquisition removed. Read-only materialization of previously stored snapshots.
const fs=require('fs'); const path=require('path');
const {buildScannerResults,buildPeriodResults,MATERIALIZE_LOOKBACK_DAYS}=require('./scanMaterializer');
const {buildDetectionMap}=require('./detectionHistory');
const ROOT=path.resolve(__dirname,'../..'); const DATA_DIR=path.join(ROOT,'data'); const HISTORY_DIR=path.join(DATA_DIR,'market-history'); const SNAPSHOT_FILE=path.join(DATA_DIR,'scanner.json'); const accumulationEngine=require(path.join(ROOT,'accumulation','engine'));
function readHistory() { if (!fs.existsSync(HISTORY_DIR)) return []; return fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(-MATERIALIZE_LOOKBACK_DAYS).map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8'))); }
function materialize(historySnapshots) { const historyBySymbol = new Map(); const futuresBySymbolDate = new Map(); for (const day of historySnapshots) { for (const row of day.cm || []) { if (!historyBySymbol.has(row.symbol)) historyBySymbol.set(row.symbol, []); historyBySymbol.get(row.symbol).push(row); } for (const row of day.futures || []) { const key = `${row.symbol}|${row.trade_date}`; const existing = futuresBySymbolDate.get(key); if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row); } } for (const rows of historyBySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date)); return { results: buildScannerResults(historyBySymbol, futuresBySymbolDate), periods: buildPeriodResults(historyBySymbol, futuresBySymbolDate) }; }
function buildCurrentDetection(historySnapshots, currentResults) {
  const bySymbol = new Map(); const futures = new Map();
  for (const day of historySnapshots) {
    for (const row of day.cm || []) { const symbol = String(row.symbol || '').toUpperCase(); if (!symbol) continue; if (!bySymbol.has(symbol)) bySymbol.set(symbol, []); bySymbol.get(symbol).push(row); }
    for (const row of day.futures || []) { const key = `${String(row.symbol || '').toUpperCase()}|${row.trade_date}`; const existing = futures.get(key); if (!existing || String(row.expiry) < String(existing.expiry)) futures.set(key, row); }
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const out = new Map();
  for (const result of currentResults || []) {
    if (result.verdict !== 'ACCUMULATION CONFIRMED') continue;
    const symbol = String(result.symbol || '').toUpperCase(); const rows = bySymbol.get(symbol) || []; if (!rows.length) continue;
    const latestDate = String(result.tradeDate || rows[rows.length - 1].trade_date); const latestIndex = rows.findIndex(r => String(r.trade_date) === latestDate); if (latestIndex < 0) continue;
    let detectedTradingDays = 0; let firstDetectedDate = null;
    for (let i = latestIndex; i >= 0; i -= 1) {
      const current = rows[i]; const history = rows.slice(0, i + 1);
      const evaluated = accumulationEngine.evaluate({ symbol, history, current, futures: futures.get(`${symbol}|${current.trade_date}`) || null });
      if (evaluated.verdict !== 'ACCUMULATION CONFIRMED') break;
      detectedTradingDays += 1; firstDetectedDate = current.trade_date;
    }
    if (detectedTradingDays) out.set(symbol, { firstDetectedDate, latestDetectedDate: latestDate, detectedTradingDays, detectionStatus: detectedTradingDays === 1 ? 'New' : 'Active' });
  }
  return out;
}

module.exports={readHistory,materialize,buildCurrentDetection};
