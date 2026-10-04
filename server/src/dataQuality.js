'use strict';
// Missing != Zero primitives and whole-day data-quality checks. Dependency-free on purpose so it
// can be used by the ingest paths, the backtest, the snapshot store and the tests.
//
// Semantics (permanent):
//   MISSING  - blank / absent / NSE "-" placeholder. Becomes null. NEVER 0.
//   INVALID  - present but not a finite number. Becomes null and is reported as invalid.
//   ZERO     - an explicitly reported 0 / "0" / "0.00". Stays the number 0.
//   VALUE    - any other finite number.

const STATES = Object.freeze({ MISSING: 'MISSING', INVALID: 'INVALID', ZERO: 'ZERO', VALUE: 'VALUE' });
const PLACEHOLDER = /^(-+|n\/?a|nan|null|nil|none)$/i;

class DataQualityError extends Error {
  constructor(message, assessment) {
    super(message);
    this.name = 'DataQualityError';
    this.assessment = assessment || null;
  }
}

function parseNumeric(raw) {
  if (raw === undefined || raw === null) return { state: STATES.MISSING, value: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { state: STATES.INVALID, value: null };
    return { state: raw === 0 ? STATES.ZERO : STATES.VALUE, value: raw };
  }
  const text = String(raw).trim();
  if (text === '' || PLACEHOLDER.test(text)) return { state: STATES.MISSING, value: null };
  const x = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(x)) return { state: STATES.INVALID, value: null };
  return { state: x === 0 ? STATES.ZERO : STATES.VALUE, value: x };
}

// Number or null. A blank/placeholder/invalid input is null, never 0.
function toNumberOrNull(raw) {
  return parseNumeric(raw).value;
}

// Whole-day delivery check. A market day whose delivery column is entirely zero (or entirely
// missing) is a data-ingestion defect, not market data: NSE reports delivery per symbol and a
// genuine trading day always has many positive values.
function assessDeliveryDay(cmRows) {
  const rows = Array.isArray(cmRows) ? cmRows : [];
  const out = { status: 'OK', rows: rows.length, positive: 0, zero: 0, missing: 0, positiveShare: 0 };
  if (!rows.length) { out.status = 'NO_ROWS'; return out; }
  for (const row of rows) {
    const per = toNumberOrNull(row.deliv_per); // raw '' / '-' cells are MISSING here too, never zero
    const qty = toNumberOrNull(row.deliv_qty);
    const perMissing = per === null || per === undefined;
    const qtyMissing = qty === null || qty === undefined;
    if (perMissing && qtyMissing) out.missing += 1;
    else if (per > 0 || qty > 0) out.positive += 1;
    else out.zero += 1;
  }
  out.positiveShare = out.positive / out.rows;
  if (out.positive === 0 && out.missing === out.rows) out.status = 'ALL_DELIVERY_MISSING';
  else if (out.positive === 0 && out.missing === 0) out.status = 'ALL_DELIVERY_ZERO';
  else if (out.positive === 0) out.status = 'ALL_DELIVERY_ZERO_OR_MISSING';
  return out;
}

function isValidDeliveryDay(assessment) {
  return !!assessment && assessment.status === 'OK';
}

// Throws DataQualityError for a day that must not pass as valid market data.
function requireValidDeliveryDay(cmRows, label) {
  const assessment = assessDeliveryDay(cmRows);
  if (!isValidDeliveryDay(assessment)) {
    throw new DataQualityError(`${label || 'CM day'}: ${assessment.status} (rows=${assessment.rows}, positive=${assessment.positive}, zero=${assessment.zero}, missing=${assessment.missing}) - refusing to treat as valid market data`, assessment);
  }
  return assessment;
}

module.exports = { STATES, DataQualityError, parseNumeric, toNumberOrNull, assessDeliveryDay, isValidDeliveryDay, requireValidDeliveryDay };
