// Direct NSE acquisition removed. Read-only materialization of stored snapshots.
const fs=require('fs'); const path=require('path');
const {buildScannerResults,buildPeriodResults,MATERIALIZE_LOOKBACK_DAYS}=require('./scanMaterializer');
const ROOT=path.resolve(__dirname,'../..'); const DATA_DIR=path.join(ROOT,'data'); const HISTORY_DIR=path.join(DATA_DIR,'market-history'); const SNAPSHOT_FILE=path.join(DATA_DIR,'scanner.json');
function readHistory() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  return fs.readdirSync(HISTORY_DIR)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .slice(-MATERIALIZE_LOOKBACK_DAYS)
    .map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8')));
}

function materialize(historySnapshots) {
  const historyBySymbol = new Map();
  const futuresBySymbolDate = new Map();
  for (const day of historySnapshots) {
    for (const row of day.cm || []) {
      if (!historyBySymbol.has(row.symbol)) historyBySymbol.set(row.symbol, []);
      historyBySymbol.get(row.symbol).push(row);
    }
    for (const row of day.futures || []) {
      const key = `${row.symbol}|${row.trade_date}`;
      const existing = futuresBySymbolDate.get(key);
      if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row);
    }
  }
  for (const rows of historyBySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  return buildScannerResults(historyBySymbol, futuresBySymbolDate);
}


module.exports={readHistory,materialize};
