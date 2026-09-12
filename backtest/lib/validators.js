const crypto = require('crypto');
const { normalizeNseDateToIso } = require('./dateNormalize');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function clean(v) { return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim(); }
function num(v) { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : null; }

// Fails loudly (throws) rather than silently accepting a schema NSE didn't
// actually promise us — a format change should surface as MALFORMED, not
// as quietly-wrong data.
function requireColumns(rows, sourceLabel, requiredColumns) {
  if (!rows.length) throw new Error(`${sourceLabel}: empty file (0 rows)`);
  const headers = new Set(Object.keys(rows[0]));
  const missing = requiredColumns.filter(c => !headers.has(c));
  if (missing.length) {
    throw new Error(`${sourceLabel}: schema mismatch (NSE format change?) — missing columns: ${missing.join(', ')}`);
  }
}

// The single most important invariant check called out in the audit trail
// for this project: a delivery quantity can never exceed traded volume.
// A prior (rejected) pipeline treated this as VALID; here it is a hard fail.
function validateCmRow(row) {
  const errors = [];
  if (!row.symbol) errors.push('missing symbol');
  if (!row.trade_date) errors.push('missing trade_date');
  if (row.volume !== null && row.deliv_qty !== null && row.volume > 0 && row.deliv_qty > row.volume) {
    errors.push(`delivery_qty (${row.deliv_qty}) exceeds volume (${row.volume})`);
  }
  if (row.close !== null && row.close <= 0) errors.push(`non-positive close (${row.close})`);
  if (row.deliv_per !== null && (row.deliv_per < 0 || row.deliv_per > 100)) errors.push(`delivery_pct out of range (${row.deliv_per})`);
  return errors;
}

function validateFoRow(row) {
  const errors = [];
  if (!row.symbol) errors.push('missing symbol');
  if (!row.trade_date) errors.push('missing trade_date');
  if (!row.expiry) errors.push('missing expiry');
  if (row.oi !== null && row.oi < 0) errors.push(`negative OI (${row.oi})`);
  return errors;
}

// Detects duplicate (symbol, trade_date[, expiry]) rows within one file —
// a common NSE-archive corruption/re-publish symptom.
function findDuplicates(rows, keyFn) {
  const seen = new Map();
  const duplicates = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) duplicates.push(key);
    seen.set(key, true);
  }
  return [...new Set(duplicates)];
}

// Confirms the file's OWN internal trade-date column matches the date we
// requested it for. This is what catches NSE serving a stale/cached file,
// or a URL pattern that silently resolves to the wrong day.
//
// AUDIT FOLLOW-UP (§4): previously compared raw_string.slice(0,10) directly
// against the ISO requested date, which silently assumed the source column
// was already ISO-formatted. It now normalizes through dateNormalize.js,
// which explicitly supports every date representation these NSE URL
// families are known to use, and fails closed (reports UNRECOGNIZED_FORMAT)
// rather than silently misparsing an unfamiliar format.
function confirmTradeDate(rows, requestedYmd, dateField) {
  const rawValues = rows.map(r => clean(r[dateField])).filter(Boolean);
  if (rawValues.length === 0) return { ok: false, reason: 'no trade date found in file' };

  const normalized = rawValues.map(v => ({ raw: v, iso: normalizeNseDateToIso(v) }));
  const unrecognized = normalized.filter(n => n.iso === null);
  if (unrecognized.length > 0) {
    return { ok: false, reason: `UNRECOGNIZED_DATE_FORMAT: could not parse date value(s) e.g. "${unrecognized[0].raw}" in column ${dateField} — this may indicate a new NSE date format not yet supported by lib/dateNormalize.js` };
  }

  const found = new Set(normalized.map(n => n.iso));
  if (found.size > 1) return { ok: false, reason: `file contains multiple trade dates: ${[...found].join(', ')}` };
  const actual = [...found][0];
  if (actual !== requestedYmd) return { ok: false, reason: `file trade date ${actual} does not match requested ${requestedYmd}` };
  return { ok: true };
}

module.exports = { sha256, clean, num, requireColumns, validateCmRow, validateFoRow, findDuplicates, confirmTradeDate };
