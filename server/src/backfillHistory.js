const fs = require('fs');
const path = require('path');
const { toIstCalendarDate, addDays, formatYmd } = require('./istDate');
const { MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');
// fetchCm/fetchFo/writeHistory are lazily required inside main() below, not at module load time.
// staticSnapshot.js pulls in csv-parse; hasAllNullDelivery/needsRefresh are pure data-integrity
// checks with no CSV-parsing or network dependency of their own, and keeping them decoupled lets
// them (and their regression tests) load/run without that dependency present.

const ROOT = path.resolve(__dirname, '../..');
const HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
const BACKFILL_CALENDAR_DAYS = Number(process.env.BACKFILL_CALENDAR_DAYS || 370);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function existingDates() {
  if (!fs.existsSync(HISTORY_DIR)) return new Set();
  return new Set(fs.readdirSync(HISTORY_DIR).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(name => name.slice(0, 10)));
}
// DATA-INTEGRITY-ONLY check (2026-09-27): a snapshot with a populated `futures` array was
// previously always treated as healthy, even when its CM rows carried no Delivery data at all.
// That is exactly the signature the DD-Mon-YYYY vs ISO date-comparison bug left behind (see
// normalizeBhavcopyDate() in staticSnapshot.js and REMEDIATION_STATUS.md): every CM row for the
// day silently fell back to the UDiFF source, which has no DELIV_QTY/DELIV_PER columns, so
// deliv_qty came back null for 100% of that day's rows -- a whole-day ingestion defect, not
// genuine per-symbol "delivery data unavailable" (which NSE marks per-symbol, not for an entire
// trading day; see deliveryColumnRequired.test.js). Detecting "every row null" therefore flags
// the real corruption pattern without misclassifying the rare legitimate case of an individual
// symbol lacking delivery data as staleness -- preserving Missing != Zero semantics: a single
// missing value is still just missing, never coerced into a refresh trigger. This does not
// change what counts as valid CM/Delivery data, nor any V15 scoring/confirmation input -- it only
// changes whether an existing on-disk snapshot is trusted as already-healthy.
function hasAllNullDelivery(snapshot) {
  const cm = Array.isArray(snapshot.cm) ? snapshot.cm : [];
  if (!cm.length) return false; // no CM rows at all is a different (pre-existing) failure mode
  return cm.every(row => row.deliv_qty === null || row.deliv_qty === undefined);
}
function needsRefresh(key) {
  const file = path.join(HISTORY_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return true;
  try {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(snapshot.futures) || snapshot.futures.length === 0) return true;
    if (hasAllNullDelivery(snapshot)) return true;
    return false;
  } catch (_) {
    return true;
  }
}
async function fetchWithBackoff(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await fn(); }
    catch (error) {
      lastError = error;
      const status = /NSE (429|5\d\d)/.exec(error.message)?.[1];
      const wait = status === '429' ? 30000 * attempt : 2000 * attempt;
      console.warn(`${label} attempt ${attempt}/3 failed: ${error.message}`);
      if (attempt < 3) await sleep(wait);
    }
  }
  throw lastError;
}
async function main() {
  const { fetchCm, fetchFo, writeHistory } = require('./staticSnapshot');
  const anchor = toIstCalendarDate();
  const existing = existingDates();
  let fetched = 0, refreshed = 0, skipped = 0, failed = 0;
  console.log(`Backfill target: ${BACKFILL_CALENDAR_DAYS} calendar days; retention ${MATERIALIZE_LOOKBACK_DAYS} snapshots.`);
  for (let i = 0; i < BACKFILL_CALENDAR_DAYS; i += 1) {
    const date = addDays(anchor, -i), key = formatYmd(date);
    const refresh = existing.has(key) && needsRefresh(key);
    if (existing.has(key) && !refresh) { skipped += 1; continue; }
    try {
      const cm = await fetchWithBackoff(() => fetchCm(date), `CM ${key}`);
      let futures = [];
      try { futures = await fetchWithBackoff(() => fetchFo(date), `F&O ${key}`); }
      catch (error) { console.warn(`F&O unavailable for ${key}; CM data will still be stored: ${error.message}`); }
      writeHistory({ tradeDate: key, cm, futures, generatedAt: new Date().toISOString() });
      if (refresh) refreshed += 1; else fetched += 1;
      console.log(`${refresh ? 'REFRESHED' : 'BACKFILLED'} ${key}: ${cm.length} CM rows, ${futures.length} futures rows`);
      await sleep(400);
    } catch (error) {
      failed += 1;
      console.log(`SKIP ${key}: ${error.message}`);
    }
  }
  console.log(`Backfill complete: fetched=${fetched}, refreshed=${refreshed}, existing=${skipped}, unavailable=${failed}`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { existingDates, needsRefresh, hasAllNullDelivery, fetchWithBackoff, main };