'use strict';
// #8 remediation: validate raw NSE rows BEFORE they can become trusted cm_eod / futures_eod rows,
// i.e. before they can ever influence a scanner score/verdict. Previously ingest.js only did
// light cleanup (empty-string -> null, non-numeric -> null via Number()) and inserted every row
// that survived the SERIES==='EQ' / instrument-type filter — a malformed or impossible value
// (e.g. a non-numeric close, a negative volume, high < low) silently became `null` or a stored
// number and was then treated as real, valid scanner evidence.
//
// This module classifies each row into exactly one status:
//   VALID      - required fields present, well-formed, and within sane ranges
//   MISSING    - a required field is absent/empty
//   MALFORMED  - a field is present but not a valid value of its expected type (bad number/date)
//   INVALID    - a field parses fine but is an impossible value (negative price, high<low, etc.)
//   DUPLICATE  - the same natural key (symbol+trade_date[+expiry]) already appeared in this batch
// Only VALID rows are returned for insertion. Everything else is reported, never silently turned
// into scanner evidence (never coerced to null-and-inserted, never dropped without a reason).
//
// UNSUPPORTED (e.g. a derivatives symbol with no F&O history) and "exact-date OI unexpectedly
// missing" are NOT ingestion-row concerns — they are evaluated per-symbol, after ingestion, by
// scanMaterializer.js / scannerEngine.js, which already implement DATA N/A / missing-OI handling.
// This module does not change that logic (see remediation item #13).

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function toNumber(v) {
  if (isBlank(v)) return { ok: false, missing: true };
  const cleaned = String(v).replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false, missing: false };
  const n = Number(cleaned);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, missing: false };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidYmd(s) {
  if (!DATE_RE.test(String(s || ''))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const SYMBOL_RE = /^[A-Z0-9&.-]{1,30}$/;

/**
 * Classify one raw NSE cash-market (bhavcopy) row.
 * @param {object} raw - raw CSV row (already filtered to SERIES==='EQ' by the caller)
 * @param {string} expectedYmd - the trade date (YYYY-MM-DD) this file was requested for
 */
function classifyCmRow(raw, expectedYmd) {
  const reasons = [];
  const symbol = String(raw.SYMBOL || '').trim().toUpperCase();
  if (!symbol) reasons.push({ status: 'MISSING', field: 'SYMBOL' });
  else if (!SYMBOL_RE.test(symbol)) reasons.push({ status: 'MALFORMED', field: 'SYMBOL' });

  if (!isValidYmd(expectedYmd)) reasons.push({ status: 'MALFORMED', field: 'trade_date' });

  const numericFields = ['PREV_CLOSE', 'OPEN_PRICE', 'HIGH_PRICE', 'LOW_PRICE', 'CLOSE_PRICE', 'TTL_TRD_QNTY'];
  const parsed = {};
  for (const field of numericFields) {
    const r = toNumber(raw[field]);
    if (r.missing) { reasons.push({ status: 'MISSING', field }); continue; }
    if (!r.ok) { reasons.push({ status: 'MALFORMED', field }); continue; }
    parsed[field] = r.value;
  }
  // Optional-but-if-present-must-be-well-formed fields.
  for (const field of ['LAST_PRICE', 'AVG_PRICE', 'DELIV_QTY', 'DELIV_PER', 'TURNOVER_LACS', 'NO_OF_TRADES']) {
    if (isBlank(raw[field])) continue;
    const r = toNumber(raw[field]);
    if (!r.ok) reasons.push({ status: 'MALFORMED', field });
    else parsed[field] = r.value;
  }

  if (reasons.length) return { status: reasons[0].status, reasons, symbol };

  // Impossible-value checks (only meaningful once the fields above parsed as numbers).
  for (const field of ['PREV_CLOSE', 'OPEN_PRICE', 'HIGH_PRICE', 'LOW_PRICE', 'CLOSE_PRICE', 'TTL_TRD_QNTY']) {
    if (parsed[field] < 0) reasons.push({ status: 'INVALID', field, reason: 'negative value' });
  }
  if (parsed.HIGH_PRICE < parsed.LOW_PRICE) reasons.push({ status: 'INVALID', field: 'HIGH_PRICE/LOW_PRICE', reason: 'high < low' });
  if (parsed.OPEN_PRICE > parsed.HIGH_PRICE || parsed.OPEN_PRICE < parsed.LOW_PRICE) reasons.push({ status: 'INVALID', field: 'OPEN_PRICE', reason: 'open outside high/low range' });
  if (parsed.CLOSE_PRICE > parsed.HIGH_PRICE || parsed.CLOSE_PRICE < parsed.LOW_PRICE) reasons.push({ status: 'INVALID', field: 'CLOSE_PRICE', reason: 'close outside high/low range' });
  if (parsed.DELIV_QTY != null && parsed.DELIV_QTY < 0) reasons.push({ status: 'INVALID', field: 'DELIV_QTY', reason: 'negative value' });
  if (parsed.DELIV_PER != null && (parsed.DELIV_PER < 0 || parsed.DELIV_PER > 100)) reasons.push({ status: 'INVALID', field: 'DELIV_PER', reason: 'out of 0-100 range' });
  // Delivery quantity cannot exceed traded quantity (allow a tiny tolerance for NSE rounding).
  if (parsed.DELIV_QTY != null && parsed.TTL_TRD_QNTY != null && parsed.DELIV_QTY > parsed.TTL_TRD_QNTY * 1.0001) {
    reasons.push({ status: 'INVALID', field: 'DELIV_QTY', reason: 'exceeds traded quantity' });
  }

  if (reasons.length) return { status: 'INVALID', reasons, symbol };

  return {
    status: 'VALID',
    symbol,
    row: {
      SYMBOL: symbol, SERIES: String(raw.SERIES || '').trim(), PREV_CLOSE: parsed.PREV_CLOSE, OPEN_PRICE: parsed.OPEN_PRICE,
      HIGH_PRICE: parsed.HIGH_PRICE, LOW_PRICE: parsed.LOW_PRICE, LAST_PRICE: parsed.LAST_PRICE ?? null, CLOSE_PRICE: parsed.CLOSE_PRICE,
      AVG_PRICE: parsed.AVG_PRICE ?? null, TTL_TRD_QNTY: parsed.TTL_TRD_QNTY, DELIV_QTY: parsed.DELIV_QTY ?? null,
      DELIV_PER: parsed.DELIV_PER ?? null, TURNOVER_LACS: parsed.TURNOVER_LACS ?? null, NO_OF_TRADES: parsed.NO_OF_TRADES ?? null
    }
  };
}

/**
 * Classify one raw NSE F&O (UDiFF) futures row.
 * @param {object} raw - raw CSV row (already filtered to Sgmt/FinInstrmTp/OptnTp by the caller)
 * @param {string} expectedYmd - the trade date this file was requested for
 */
function classifyFoRow(raw, expectedYmd) {
  const reasons = [];
  const symbol = String(raw.TckrSymb || '').trim().toUpperCase();
  if (!symbol) reasons.push({ status: 'MISSING', field: 'TckrSymb' });
  else if (!SYMBOL_RE.test(symbol)) reasons.push({ status: 'MALFORMED', field: 'TckrSymb' });

  const expiryRaw = String(raw.XpryDt || '').trim();
  if (!expiryRaw) reasons.push({ status: 'MISSING', field: 'XpryDt' });
  else if (!isValidYmd(expiryRaw)) reasons.push({ status: 'MALFORMED', field: 'XpryDt' });

  if (!isValidYmd(expectedYmd)) reasons.push({ status: 'MALFORMED', field: 'trade_date' });

  const oi = toNumber(raw.OpnIntrst);
  if (oi.missing) reasons.push({ status: 'MISSING', field: 'OpnIntrst' });
  else if (!oi.ok) reasons.push({ status: 'MALFORMED', field: 'OpnIntrst' });

  const changeOi = isBlank(raw.ChngInOpnIntrst) ? { ok: true, value: null } : toNumber(raw.ChngInOpnIntrst);
  if (!changeOi.ok) reasons.push({ status: 'MALFORMED', field: 'ChngInOpnIntrst' });

  const close = isBlank(raw.ClsPric) ? { ok: true, value: null } : toNumber(raw.ClsPric);
  if (!close.ok) reasons.push({ status: 'MALFORMED', field: 'ClsPric' });

  if (reasons.length) return { status: reasons[0].status, reasons, symbol };

  if (isValidYmd(expiryRaw) && isValidYmd(expectedYmd) && expiryRaw < expectedYmd) {
    reasons.push({ status: 'INVALID', field: 'XpryDt', reason: 'expiry before trade date' });
  }
  if (oi.value < 0) reasons.push({ status: 'INVALID', field: 'OpnIntrst', reason: 'negative value' });
  if (close.value != null && close.value < 0) reasons.push({ status: 'INVALID', field: 'ClsPric', reason: 'negative value' });

  if (reasons.length) return { status: 'INVALID', reasons, symbol };

  return {
    status: 'VALID',
    symbol,
    row: { TckrSymb: symbol, XpryDt: expiryRaw, ClsPric: close.value, OpnIntrst: oi.value, ChngInOpnIntrst: changeOi.value, FinInstrmTp: clean(raw.FinInstrmTp), FinInstrmNm: clean(raw.FinInstrmNm) }
  };
}

function clean(v) { return isBlank(v) ? null : String(v).trim(); }

/**
 * Validate a whole batch of raw rows for one trade date, deduplicating on the natural key.
 * Returns { valid: [rows...], invalid: [{status,reasons,symbol,key}], summary: {STATUS: count} }.
 * `keyFn` extracts the natural key (e.g. symbol, or symbol+expiry) used to detect duplicate rows
 * appearing more than once within the same source file.
 */
function validateBatch(rawRows, classify, expectedYmd, keyFn) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const summary = { VALID: 0, MISSING: 0, MALFORMED: 0, INVALID: 0, DUPLICATE: 0 };
  for (const raw of rawRows) {
    const result = classify(raw, expectedYmd);
    if (result.status !== 'VALID') {
      invalid.push({ status: result.status, reasons: result.reasons, symbol: result.symbol });
      summary[result.status] = (summary[result.status] || 0) + 1;
      continue;
    }
    const key = keyFn(result.row);
    if (seen.has(key)) {
      invalid.push({ status: 'DUPLICATE', reasons: [{ status: 'DUPLICATE', field: 'natural_key', reason: key }], symbol: result.symbol });
      summary.DUPLICATE += 1;
      continue;
    }
    seen.add(key);
    valid.push(result.row);
    summary.VALID += 1;
  }
  return { valid, invalid, summary };
}

module.exports = { classifyCmRow, classifyFoRow, validateBatch, isValidYmd, toNumber };
