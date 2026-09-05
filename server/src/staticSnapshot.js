const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');
const { toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact } = require('./istDate');
const { buildScannerResults, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'market-history');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'scanner.json');
const SEARCH_WINDOW_DAYS = 10;

const NSE_HOME = 'https://www.nseindia.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${NSE_HOME}/`
};

function clean(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim();
}

function num(v) {
  const x = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(x) ? x : null;
}

function parseCsv(buf) {
  return parse(buf.toString('utf8').replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });
}

async function get(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`NSE ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchCm(date) {
  const urls = [
    `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${formatDdMmYyyy(date)}.csv`,
    `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`
  ];
  for (const url of urls) {
    try {
      const buf = await get(url);
      if (url.endsWith('.zip')) {
        const zip = await unzipper.Open.buffer(buf);
        const file = zip.files.find(f => /\.csv$/i.test(f.path));
        if (!file) throw new Error('No CSV found in CM archive');
        return parseCsv(await file.buffer())
          .filter(r => clean(r.SctySrs) === 'EQ' || clean(r.SERIES) === 'EQ')
          .map(r => ({
            symbol: clean(r.TckrSymb || r.SYMBOL),
            trade_date: formatYmd(date),
            close: num(r.ClsPric ?? r.CLOSE_PRICE),
            last_price: num(r.LastPric ?? r.LAST_PRICE),
            prev_close: num(r.PrvsClsgPric ?? r.PREV_CLOSE),
            volume: num(r.TtlTradgVol ?? r.TTL_TRD_QNTY),
            deliv_qty: num(r.DlvryQty ?? r.DELIV_QTY),
            deliv_per: num(r.DlvryPct ?? r.DELIV_PER)
          }))
          .filter(r => r.symbol);
      }
      return parseCsv(buf)
        .filter(r => clean(r.SERIES) === 'EQ')
        .map(r => ({
          symbol: clean(r.SYMBOL),
          trade_date: formatYmd(date),
          close: num(r.CLOSE_PRICE),
          last_price: num(r.LAST_PRICE),
          prev_close: num(r.PREV_CLOSE),
          volume: num(r.TTL_TRD_QNTY),
          deliv_qty: num(r.DELIV_QTY),
          deliv_per: num(r.DELIV_PER)
        }))
        .filter(r => r.symbol);
    } catch (error) {
      if (url === urls[urls.length - 1]) throw error;
    }
  }
  throw new Error('No NSE CM file available');
}

async function fetchFo(date) {
  const url = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`;
  const zip = await unzipper.Open.buffer(await get(url));
  const file = zip.files.find(f => /\.csv$/i.test(f.path));
  if (!file) throw new Error('No CSV found in NSE F&O archive');
  return parseCsv(await file.buffer())
    .filter(r => clean(r.Sgmt) === 'FO' && clean(r.FinInstrmTp) === 'STF' && clean(r.OptnTp) === 'XX')
    .map(r => ({
      symbol: clean(r.TckrSymb),
      trade_date: formatYmd(date),
      expiry: clean(r.XpryDt),
      close: num(r.ClsPric),
      oi: num(r.OpnIntrst),
      change_oi: num(r.ChngInOpnIntrst)
    }))
    .filter(r => r.symbol && r.expiry);
}

function readHistory() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  return fs.readdirSync(HISTORY_DIR)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .slice(-MATERIALIZE_LOOKBACK_DAYS)
    .map(name => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8')));
}

function writeHistory(snapshot) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(HISTORY_DIR, `${snapshot.tradeDate}.json`), `${JSON.stringify(snapshot)}\n`);
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
  for (const name of files.slice(0, -MATERIALIZE_LOOKBACK_DAYS)) fs.unlinkSync(path.join(HISTORY_DIR, name));
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

async function ingestLatest() {
  const anchor = toIstCalendarDate();
  let lastError = null;
  for (let i = 0; i < SEARCH_WINDOW_DAYS; i += 1) {
    const date = addDays(anchor, -i);
    try {
      const cm = await fetchCm(date);
      let futures = [];
      try {
        futures = await fetchFo(date);
      } catch (error) {
        console.warn(`F&O unavailable for ${formatYmd(date)}: ${error.message}`);
      }
      const snapshot = { tradeDate: formatYmd(date), cm, futures, generatedAt: new Date().toISOString() };
      writeHistory(snapshot);
      return snapshot;
    } catch (error) {
      lastError = error;
      console.log(`SKIP ${formatYmd(date)}: ${error.message}`);
    }
  }
  throw new Error(`No recent NSE CM file was available in the last ${SEARCH_WINDOW_DAYS} calendar days: ${lastError?.message || 'unknown error'}`);
}

async function main() {
  const latest = await ingestLatest();
  const history = readHistory();
  const results = materialize(history);
  const snapshot = {
    status: 'ok',
    asOf: latest.tradeDate,
    generatedAt: new Date().toISOString(),
    source: 'NSE EOD public archives',
    historyDays: history.length,
    results
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshot)}\n`);
  console.log(`SNAPSHOT ${latest.tradeDate}: ${results.length} symbols from ${history.length} stored trading-day snapshot(s)`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });

module.exports = { fetchCm, fetchFo, readHistory, materialize, ingestLatest };
