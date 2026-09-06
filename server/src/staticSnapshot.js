const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');
const { toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact } = require('./istDate');
const { buildScannerResults, buildPeriodResults, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');
const accumulationEngine = require(path.join(ROOT = path.resolve(__dirname, '../..'), 'accumulation', 'engine'));

const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'market-history');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'scanner.json');
const SEARCH_WINDOW_DAYS = 10;
const NSE_HOME = 'https://www.nseindia.com';
const NSE_EQUITY_UNIVERSE = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36', Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9', Referer: `${NSE_HOME}/` };
function clean(v) { return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim(); }
function num(v) { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : null; }
function parseCsv(buf) { return parse(buf.toString('utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: false, bom: true }); }
function requireColumns(rows, source, columns) { if (!rows.length) throw new Error(`${source}: empty CSV`); const headers = new Set(Object.keys(rows[0])); const missing = columns.filter(column => !headers.has(column)); if (missing.length) throw new Error(`${source}: schema mismatch; missing columns: ${missing.join(', ')}`); }
async function get(url) { const response = await fetch(url, { headers: HEADERS }); if (!response.ok) throw new Error(`NSE ${response.status} for ${url}`); return Buffer.from(await response.arrayBuffer()); }
async function fetchUniverse() {
  const rows = parseCsv(await get(NSE_EQUITY_UNIVERSE));
  requireColumns(rows, 'NSE equity universe', ['SYMBOL', 'NAME OF COMPANY', 'SERIES']);
  const map = new Map();
  for (const row of rows) { const symbol = clean(row.SYMBOL); const name = clean(row['NAME OF COMPANY']); if (symbol && name && clean(row.SERIES) === 'EQ') map.set(symbol, name); }
  return map;
}
async function fetchCm(date) {
  const urls = [`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${formatDdMmYyyy(date)}.csv`, `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`];
  for (const url of urls) {
    try {
      const buf = await get(url); let rows;
      if (url.endsWith('.zip')) {
        const zip = await unzipper.Open.buffer(buf); const file = zip.files.find(f => /\.csv$/i.test(f.path)); if (!file) throw new Error('No CSV found in CM archive'); rows = parseCsv(await file.buffer()); requireColumns(rows, 'NSE UDiFF CM', ['TckrSymb', 'SctySrs', 'ClsPric', 'PrvsClsgPric', 'TtlTradgVol']);
        return rows.filter(r => clean(r.SctySrs) === 'EQ').map(r => ({ symbol: clean(r.TckrSymb), trade_date: formatYmd(date), close: num(r.ClsPric), last_price: num(r.LastPric), prev_close: num(r.PrvsClsgPric), volume: num(r.TtlTradgVol), deliv_qty: num(r.DlvryQty), deliv_per: num(r.DlvryPct) })).filter(r => r.symbol);
      }
      rows = parseCsv(buf); requireColumns(rows, 'NSE security-wise bhavcopy', ['SYMBOL', 'SERIES', 'CLOSE_PRICE', 'PREV_CLOSE', 'TTL_TRD_QNTY']);
      return rows.filter(r => clean(r.SERIES) === 'EQ').map(r => ({ symbol: clean(r.SYMBOL), trade_date: formatYmd(date), close: num(r.CLOSE_PRICE), last_price: num(r.LAST_PRICE), prev_close: num(r.PREV_CLOSE), volume: num(r.TTL_TRD_QNTY), deliv_qty: num(r.DELIV_QTY), deliv_per: num(r.DELIV_PER) })).filter(r => r.symbol);
    } catch (error) { if (url === urls[urls.length - 1]) throw error; }
  }
  throw new Error('No NSE CM file available');
}
async function fetchFo(date) {
  const url = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`;
  const zip = await unzipper.Open.buffer(await get(url)); const file = zip.files.find(f => /\.csv$/i.test(f.path)); if (!file) throw new Error('No CSV found in NSE F&O archive'); const rows = parseCsv(await file.buffer());
  requireColumns(rows, 'NSE F&O UDiFF', ['TckrSymb', 'FinInstrmTp', 'XpryDt', 'OpnIntrst', 'ChngInOpnIntrst']);
  return rows.filter(r => clean(r.Sgmt) === 'FO' && clean(r.FinInstrmTp) === 'STF' && (clean(r.OptnTp) === 'XX' || !clean(r.OptnTp))).map(r => ({ symbol: clean(r.TckrSymb), trade_date: formatYmd(date), expiry: clean(r.XpryDt), close: num(r.ClsPric), oi: num(r.OpnIntrst), change_oi: num(r.ChngInOpnIntrst) })).filter(r => r.symbol && r.expiry);
}
function readHistory() { fs.mkdirSync(HISTORY_DIR, { recursive: true }); return fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(-MATERIALIZE_LOOKBACK_DAYS).map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8'))); }
function writeHistory(snapshot) { fs.mkdirSync(HISTORY_DIR, { recursive: true }); fs.writeFileSync(path.join(HISTORY_DIR, `${snapshot.tradeDate}.json`), `${JSON.stringify(snapshot)}\n`); const files = fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort(); for (const name of files.slice(0, -MATERIALIZE_LOOKBACK_DAYS)) fs.unlinkSync(path.join(HISTORY_DIR, name)); }
function materialize(historySnapshots) { const historyBySymbol = new Map(); const futuresBySymbolDate = new Map(); for (const day of historySnapshots) { for (const row of day.cm || []) { if (!historyBySymbol.has(row.symbol)) historyBySymbol.set(row.symbol, []); historyBySymbol.get(row.symbol).push(row); } for (const row of day.futures || []) { const key = `${row.symbol}|${row.trade_date}`; const existing = futuresBySymbolDate.get(key); if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row); } } for (const rows of historyBySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date)); return { results: buildScannerResults(historyBySymbol, futuresBySymbolDate), periods: buildPeriodResults(historyBySymbol, futuresBySymbolDate) }; }
function buildCurrentDetection(historySnapshots, currentResults) {
  const bySymbol = new Map();
  const futures = new Map();
  for (const day of historySnapshots) {
    for (const row of day.cm || []) {
      const symbol = String(row.symbol || '').toUpperCase();
      if (!symbol) continue;
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      bySymbol.get(symbol).push(row);
    }
    for (const row of day.futures || []) {
      const key = `${String(row.symbol || '').toUpperCase()}|${row.trade_date}`;
      const existing = futures.get(key);
      if (!existing || String(row.expiry) < String(existing.expiry)) futures.set(key, row);
    }
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const out = new Map();
  for (const result of currentResults || []) {
    if (result.verdict !== 'ACCUMULATION CONFIRMED') continue;
    const symbol = String(result.symbol || '').toUpperCase();
    const rows = bySymbol.get(symbol) || [];
    if (!rows.length) continue;
    const latestDate = String(result.tradeDate || rows[rows.length - 1].trade_date);
    const latestIndex = rows.findIndex(r => String(r.trade_date) === latestDate);
    if (latestIndex < 0) continue;
    let detectedTradingDays = 0;
    let firstDetectedDate = null;
    for (let i = latestIndex; i >= 0; i -= 1) {
      const current = rows[i];
      const history = rows.slice(0, i + 1);
      const evaluated = accumulationEngine.evaluate({ symbol, history, current, futures: futures.get(`${symbol}|${current.trade_date}`) || null });
      if (evaluated.verdict !== 'ACCUMULATION CONFIRMED') break;
      detectedTradingDays += 1;
      firstDetectedDate = current.trade_date;
    }
    if (detectedTradingDays) out.set(symbol, { firstDetectedDate, latestDetectedDate: latestDate, detectedTradingDays, detectionStatus: detectedTradingDays === 1 ? 'New' : 'Active' });
  }
  return out;
}
async function ingestLatest() { const anchor = toIstCalendarDate(); let lastError = null; for (let i = 0; i < SEARCH_WINDOW_DAYS; i += 1) { const date = addDays(anchor, -i); try { const cm = await fetchCm(date); let futures = []; try { futures = await fetchFo(date); } catch (error) { console.warn(`F&O unavailable for ${formatYmd(date)}: ${error.message}`); } const snapshot = { tradeDate: formatYmd(date), cm, futures, generatedAt: new Date().toISOString() }; writeHistory(snapshot); return snapshot; } catch (error) { lastError = error; console.log(`SKIP ${formatYmd(date)}: ${error.message}`); } } throw new Error(`No recent NSE CM file was available in the last ${SEARCH_WINDOW_DAYS} calendar days: ${lastError?.message || 'unknown error'}`); }
async function main() {
  const latest = await ingestLatest(); const history = readHistory(); const materialized = materialize(history); let universe = new Map(); try { universe = await fetchUniverse(); } catch (error) { console.warn(`NSE company-name universe unavailable: ${error.message}`); }
  const latestSymbols = new Set((latest.cm || []).map(row => String(row.symbol || '').toUpperCase()));
  const currentResults = materialized.results.filter(row => String(row.tradeDate || '') === latest.tradeDate && latestSymbols.has(String(row.symbol || '').toUpperCase()));
  const detection = buildCurrentDetection(history, currentResults);
  const addNames = rows => rows.map(row => ({ ...row, companyName: universe.get(row.symbol) || null, detection: detection.get(String(row.symbol || '').toUpperCase()) || null }));
  const tradingDays = history.map(day => day.tradeDate).filter(Boolean);
  const snapshot = { status: 'ok', dataStatus: 'EOD VERIFIED', asOf: latest.tradeDate, generatedAt: new Date().toISOString(), source: 'NSE EOD public archives', universeSource: NSE_EQUITY_UNIVERSE, historyDays: history.length, tradingDays, results: addNames(currentResults), periods: Object.fromEntries(Object.entries(materialized.periods).map(([key, rows]) => [key, addNames(rows)])) };
  fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshot)}\n`); console.log(`SNAPSHOT ${latest.tradeDate}: ${currentResults.length} current-date symbols from ${history.length} stored trading-day snapshot(s); confirmed streaks: ${detection.size}`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { fetchCm, fetchFo, fetchUniverse, readHistory, writeHistory, materialize, buildCurrentDetection, ingestLatest, parseCsv, requireColumns };