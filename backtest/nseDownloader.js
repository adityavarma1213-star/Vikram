// 5-year NSE historical downloader for the VIKRAM accumulation engine.
//
// This deliberately reuses the exact NSE URL patterns already proven to work
// elsewhere in this same repo (server/src/staticSnapshot.js, server/src/ingest.js)
// rather than inventing new ones, and adds what those files don't do:
//   - preserves the ORIGINAL raw downloaded file, unmodified, on disk
//   - computes and records a SHA-256 of every raw file
//   - records source URL / trading date / download status / validation status
//     for every attempted date in an append-as-you-go checkpoint manifest
//   - supports resume: a killed/interrupted run picks up where it left off
//   - stops (does not fabricate data) if NSE access is blocked
//
// It does NOT invent a trading calendar. A candidate weekday is only recorded
// as a confirmed trading session once NSE's own archive returns a file whose
// internal TradDt/DATE1 matches the requested date (see lib/validators.js).

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
let unzipper;
try { unzipper = require('unzipper'); } catch (e) { unzipper = null; }

const { formatYmd, formatDdMmYyyy, formatYmdCompact, candidateSessionDates } = require('./lib/dateUtils');
const { sha256, clean, num, requireColumns, validateCmRow, validateFoRow, findDuplicates, confirmTradeDate } = require('./lib/validators');
const { Manifest } = require('./lib/manifest');

const ROOT = __dirname;
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json');
const NSE_HOME = 'https://www.nseindia.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36',
  Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9', Referer: `${NSE_HOME}/`
};

// Known NSE archive URL FAMILIES across the target window. NSE changed the CM
// bhavcopy format to "UDiFF" CSV-in-ZIP; the legacy "sec_bhavdata_full" CSV
// endpoint has continued to be served alongside it for recent history. Both
// are tried, oldest-compatible-format last, so a format change mid-window
// does not stop the run — it just changes which URL succeeds for which date.
function cmCandidateUrls(date) {
  return [
    { url: `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`, format: 'UDIFF_ZIP' },
    { url: `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${formatDdMmYyyy(date)}.csv`, format: 'LEGACY_CSV' }
  ];
}
function foCandidateUrls(date) {
  return [
    { url: `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`, format: 'UDIFF_ZIP' }
  ];
}

async function fetchRaw(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 403) {
    const denyReason = res.headers.get('x-deny-reason');
    const body = await res.text().catch(() => '');
    const err = new Error(`BLOCKED (403${denyReason ? `, x-deny-reason: ${denyReason}` : ''}): ${body.slice(0, 200)}`);
    err.blocked = true;
    throw err;
  }
  if (!res.ok) { const err = new Error(`NSE HTTP ${res.status} for ${url}`); err.httpStatus = res.status; throw err; }
  return Buffer.from(await res.arrayBuffer());
}

function extractCsvFromZip(buf) {
  if (!unzipper) throw new Error('unzipper package not installed — run `npm install` in backtest/ first');
  return unzipper.Open.buffer(buf).then(zip => {
    const file = zip.files.find(f => /\.csv$/i.test(f.path));
    if (!file) throw new Error('archive did not contain a .csv file');
    return file.buffer();
  });
}

function parseCsvBuffer(buf) {
  return parse(buf.toString('utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true });
}

function normalizeCmRows(rawRows, format, ymd) {
  if (format === 'UDIFF_ZIP') {
    requireColumns(rawRows, 'NSE UDiFF CM', ['TradDt', 'TckrSymb', 'SctySrs', 'ClsPric', 'PrvsClsgPric', 'TtlTradgVol']);
    const dateCheck = confirmTradeDate(rawRows, ymd, 'TradDt');
    return {
      dateCheck,
      rows: rawRows.filter(r => clean(r.SctySrs) === 'EQ').map(r => ({
        symbol: clean(r.TckrSymb), trade_date: ymd, close: num(r.ClsPric), last_price: num(r.LastPric),
        prev_close: num(r.PrvsClsgPric), volume: num(r.TtlTradgVol), deliv_qty: num(r.DlvryQty), deliv_per: num(r.DlvryPct)
      })).filter(r => r.symbol)
    };
  }
  requireColumns(rawRows, 'NSE legacy sec_bhavdata_full', ['SYMBOL', 'SERIES', 'CLOSE_PRICE', 'PREV_CLOSE', 'TTL_TRD_QNTY']);
  const dateField = rawRows[0].DATE1 !== undefined ? 'DATE1' : (rawRows[0].TradeDate !== undefined ? 'TradeDate' : 'TRADE_DATE');
  const dateCheck = dateField in rawRows[0] ? confirmTradeDate(rawRows, ymd, dateField) : { ok: true, reason: 'no date column to cross-check (older format)' };
  return {
    dateCheck,
    rows: rawRows.filter(r => clean(r.SERIES) === 'EQ').map(r => ({
      symbol: clean(r.SYMBOL), trade_date: ymd, close: num(r.CLOSE_PRICE), last_price: num(r.LAST_PRICE),
      prev_close: num(r.PREV_CLOSE), volume: num(r.TTL_TRD_QNTY), deliv_qty: num(r.DELIV_QTY), deliv_per: num(r.DELIV_PER)
    })).filter(r => r.symbol)
  };
}

function normalizeFoRows(rawRows, ymd) {
  requireColumns(rawRows, 'NSE F&O UDiFF', ['TradDt', 'TckrSymb', 'Sgmt', 'FinInstrmTp', 'XpryDt', 'OpnIntrst', 'ChngInOpnIntrst']);
  const dateCheck = confirmTradeDate(rawRows, ymd, 'TradDt');
  const rows = rawRows
    .filter(r => clean(r.Sgmt)?.toUpperCase() === 'FO')
    .filter(r => ['STF', 'IDF'].includes(clean(r.FinInstrmTp)?.toUpperCase()))
    .filter(r => ['XX', null].includes(clean(r.OptnTp)?.toUpperCase() || null))
    .map(r => ({ symbol: clean(r.TckrSymb), trade_date: ymd, expiry: clean(r.XpryDt), close: num(r.ClsPric), oi: num(r.OpnIntrst), change_oi: num(r.ChngInOpnIntrst) }))
    .filter(r => r.symbol && r.expiry);
  return { dateCheck, rows };
}

async function downloadOneSegment(segment, date, manifest, { onBlocked }) {
  const ymd = formatYmd(date);
  if (manifest.isDone(segment, ymd)) return { skipped: true };

  const candidates = segment === 'CM' ? cmCandidateUrls(date) : foCandidateUrls(date);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const rawBuf = await fetchRaw(candidate.url);
      const ext = candidate.format === 'UDIFF_ZIP' ? 'csv.zip' : 'csv';
      const filePath = path.join(RAW_DIR, segment.toLowerCase(), `${ymd}.${candidate.format}.${ext}`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, rawBuf); // preserve the ORIGINAL file, byte-for-byte
      const checksum = sha256(rawBuf);

      const csvBuf = candidate.format === 'UDIFF_ZIP' ? await extractCsvFromZip(rawBuf) : rawBuf;
      const rawRows = parseCsvBuffer(csvBuf);
      const { dateCheck, rows } = segment === 'CM' ? normalizeCmRows(rawRows, candidate.format, ymd) : normalizeFoRows(rawRows, ymd);

      if (!dateCheck.ok) throw new Error(`date verification failed: ${dateCheck.reason}`);

      const rowErrors = [];
      const dupKeys = segment === 'CM' ? findDuplicates(rows, r => `${r.symbol}|${r.trade_date}`) : findDuplicates(rows, r => `${r.symbol}|${r.trade_date}|${r.expiry}`);
      if (dupKeys.length) rowErrors.push(`${dupKeys.length} duplicate row key(s), e.g. ${dupKeys.slice(0, 3).join(', ')}`);
      let malformedCount = 0;
      for (const row of rows) {
        const errs = segment === 'CM' ? validateCmRow(row) : validateFoRow(row);
        if (errs.length) { malformedCount += 1; if (rowErrors.length < 20) rowErrors.push(`${row.symbol}: ${errs.join('; ')}`); }
      }

      const validationStatus = rowErrors.length === 0 ? 'VALID' : (malformedCount > rows.length * 0.5 ? 'MALFORMED' : 'INVALID');

      manifest.record(segment, ymd, {
        source_url: candidate.url, download_status: 'SUCCESS', sha256: checksum,
        file_path: path.relative(ROOT, filePath), validation_status: validationStatus,
        validation_errors: rowErrors, row_count: rows.length
      });

      if (validationStatus === 'VALID') {
        const normalizedPath = path.join(ROOT, 'data', 'normalized', segment.toLowerCase(), `${ymd}.json`);
        fs.mkdirSync(path.dirname(normalizedPath), { recursive: true });
        fs.writeFileSync(normalizedPath, JSON.stringify(rows));
      }
      return { skipped: false, status: 'SUCCESS', validationStatus, rowCount: rows.length };
    } catch (error) {
      lastError = error;
      if (error.blocked) {
        manifest.record(segment, ymd, { source_url: candidate.url, download_status: 'BLOCKED', validation_status: 'NOT_APPLICABLE', validation_errors: [error.message] });
        onBlocked(error, candidate.url);
        return { skipped: false, status: 'BLOCKED', error };
      }
      // try next candidate URL/format before giving up on this date
    }
  }

  // All candidates failed for reasons other than a hard block (404 = likely a
  // non-trading day; anything else = a real failure worth recording distinctly).
  const isLikelyNonTradingDay = lastError && lastError.httpStatus === 404;
  manifest.record(segment, ymd, {
    source_url: candidates[candidates.length - 1].url,
    download_status: isLikelyNonTradingDay ? 'NOT_A_TRADING_DAY' : 'FAILED',
    validation_status: 'NOT_APPLICABLE',
    validation_errors: [lastError ? lastError.message : 'unknown error']
  });
  return { skipped: false, status: isLikelyNonTradingDay ? 'NOT_A_TRADING_DAY' : 'FAILED' };
}

async function run({ startDate, endDate, segments = ['CM', 'FO'], sleepMs = 300, stopOnBlock = true }) {
  const manifest = new Manifest(MANIFEST_PATH);
  const dates = candidateSessionDates(startDate, endDate);
  let blocked = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  console.log(`Downloader starting: ${dates.length} candidate weekday(s) from ${formatYmd(startDate)} to ${formatYmd(endDate)}, segments=${segments.join(',')}`);

  for (const date of dates) {
    for (const segment of segments) {
      const result = await downloadOneSegment(segment, date, manifest, {
        onBlocked: (error, url) => { blocked = { error: error.message, url, date: formatYmd(date), segment }; }
      });
      if (result.status === 'BLOCKED' && stopOnBlock) {
        console.error(`\nSTOPPED: NSE access BLOCKED at ${formatYmd(date)} [${segment}]`);
        console.error(`  URL: ${blocked.url}`);
        console.error(`  Reason: ${blocked.error}`);
        console.error('Per policy, the pipeline does not substitute synthetic data and stops here.');
        return { blocked, manifest: manifest.summary() };
      }
      if (!result.skipped) await sleep(sleepMs);
    }
  }

  console.log('Downloader finished (no blocking error encountered).');
  return { blocked: null, manifest: manifest.summary() };
}

module.exports = { run, downloadOneSegment, cmCandidateUrls, foCandidateUrls, RAW_DIR, MANIFEST_PATH };

if (require.main === module) {
  const { toIstCalendarDate, addDays } = require('./lib/dateUtils');
  const end = toIstCalendarDate();
  const start = addDays(end, -5 * 365);
  run({ startDate: start, endDate: end }).then(result => {
    fs.writeFileSync(path.join(ROOT, 'reports', 'download_run_summary.json'), JSON.stringify(result, null, 2));
    process.exit(result.blocked ? 2 : 0);
  }).catch(err => { console.error('FATAL:', err); process.exit(1); });
}
