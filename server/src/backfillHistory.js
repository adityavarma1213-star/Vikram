const fs = require('fs');
const path = require('path');
// DIRECT NSE ACQUISITION REMOVED (see docs/NSE_ACQUISITION_REMOVED.md): the former backfill
// loop (fetchWithBackoff / main) that downloaded NSE files day by day was deleted. Only the pure,
// offline data-integrity checks over ALREADY-STORED snapshots remain below.

const ROOT = path.resolve(__dirname, '../..');
const HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
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
// SECOND CORRUPTION SIGNATURE (found 2026-09-27, auditing data/market-history/2026-09-04,
// 09-07..09-11, 09-15): those seven dates are not all-null -- every CM row has deliv_qty/
// deliv_per as the literal number 0, which the null-only check above does not match
// (0 !== null/undefined), so needsRefresh() never flagged those on-disk snapshots for
// re-fetch and the corruption became permanent. A single symbol legitimately reporting zero
// delivery on a given day is real NSE data (Missing != Zero: a genuine per-symbol 0 stays 0,
// is not coerced to "missing", and must not itself trigger a refresh loop) -- but every row
// across an entire day's CM set (2,600+ symbols) reporting exactly 0 is not a plausible market
// outcome and matches a whole-day ingestion defect where the Delivery columns fell back to a
// numeric zero default instead of null/undefined. Detecting "every row is exactly 0" alongside
// "every row is null" catches both known corruption signatures while still leaving an isolated
// per-symbol 0 alone. This still does not touch V15 scoring/confirmation.
function hasAllNullDelivery(snapshot) {
  const cm = Array.isArray(snapshot.cm) ? snapshot.cm : [];
  if (!cm.length) return false; // no CM rows at all is a different (pre-existing) failure mode
  if (cm.every(row => row.deliv_qty === null || row.deliv_qty === undefined)) return true;
  return cm.every(row => row.deliv_qty === 0);
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
module.exports = { existingDates, needsRefresh, hasAllNullDelivery };