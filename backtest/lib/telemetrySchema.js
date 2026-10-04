'use strict';
// Canonical V15 decision-record schema.
//
// One schema, engine field names everywhere. The record carries the frozen engine's output
// VERBATIM (metrics, components, why, gate failures); this module never recomputes, rounds or
// renames a decision-time value. In particular:
//   volumeRatio  -> column "volumeRatio"   (never "volume_ratio")
//   obv          -> column "obv"           (the OBV level)
//   obvTrend     -> column "obvTrend"      (OBV change over the lookback; the value the gate uses)
// Missing values are null in JSON and "N/A" in CSV/Markdown. They are never 0.
//
// Legacy snake_case headers used by the original report are listed in LEGACY_ALIASES for
// documentation only; they are not emitted as extra columns.

const SCHEMA_VERSION = 'v15-decision-record/1';

const METRIC_FIELDS = Object.freeze([
  'close', 'prevClose', 'priceChangePct', 'volume', 'avgVolume', 'volumeRatio',
  'deliveryPct', 'deliveryQty', 'deliveryTrend', 'obv', 'obvTrend',
  'futuresOi', 'changeOi', 'oiPct', 'oiExactDate'
]);

const LEGACY_ALIASES = Object.freeze({
  catch_date: 'tradeDate', delivery_pct: 'deliveryPct', volume_ratio: 'volumeRatio',
  oi: 'futuresOi', oi_change: 'changeOi', gate_status: 'confirmationStatus'
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Builds the canonical record from a frozen-engine evaluate() result.
function buildDecisionRecord(symbol, result, { historyLength = null } = {}) {
  if (!result || typeof result !== 'object') throw new Error('buildDecisionRecord: engine result is required');
  const metrics = {};
  for (const field of METRIC_FIELDS) metrics[field] = result.metrics && field in result.metrics ? result.metrics[field] : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    symbol: String(symbol || result.symbol || '').toUpperCase(),
    securityId: { symbol: String(symbol || result.symbol || '').toUpperCase(), isin: null, isinStatus: 'NOT_AVAILABLE' },
    tradeDate: result.tradeDate || null,
    close: metrics.close,
    verdict: result.verdict,
    score: result.score === undefined ? null : result.score,
    confirmationStatus: result.confirmation ? result.confirmation.status : null,
    gateFailures: result.confirmation && Array.isArray(result.confirmation.gateFailures) ? result.confirmation.gateFailures.slice() : null,
    metrics,
    components: cloneJson(result.components) || [],
    why: Array.isArray(result.why) ? result.why.slice() : [],
    historyLength
  };
}

// CSV columns: decision fields first, then run-level provenance. Order is part of the contract.
const CSV_COLUMNS = Object.freeze([
  'symbol', 'tradeDate', 'eventIndex', 'streakDay', 'streakLength',
  'close', 'verdict', 'confirmationStatus', 'score',
  'priceChangePct', 'volume', 'avgVolume', 'volumeRatio',
  'deliveryPct', 'deliveryQty', 'deliveryTrend',
  'obv', 'obvTrend', 'futuresOi', 'changeOi', 'oiPct', 'oiExactDate',
  'gateFailures', 'historyLength', 'components', 'why',
  'engineSha256', 'configSha256', 'datasetVersion', 'dataStatus', 'evidence'
]);

function cell(value) {
  if (value === null || value === undefined) return 'N/A';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Flatten one decision record (+ event context + provenance) to the CSV column set.
function recordToFlat(record, context = {}) {
  const m = record.metrics || {};
  return {
    symbol: record.symbol, tradeDate: record.tradeDate,
    eventIndex: context.eventIndex ?? null, streakDay: context.streakDay ?? null, streakLength: context.streakLength ?? null,
    close: record.close, verdict: record.verdict, confirmationStatus: record.confirmationStatus, score: record.score,
    priceChangePct: m.priceChangePct, volume: m.volume, avgVolume: m.avgVolume, volumeRatio: m.volumeRatio,
    deliveryPct: m.deliveryPct, deliveryQty: m.deliveryQty, deliveryTrend: m.deliveryTrend,
    obv: m.obv, obvTrend: m.obvTrend, futuresOi: m.futuresOi, changeOi: m.changeOi, oiPct: m.oiPct, oiExactDate: m.oiExactDate,
    gateFailures: record.gateFailures, historyLength: record.historyLength,
    components: record.components, why: record.why,
    engineSha256: context.engineSha256 ?? null, configSha256: context.configSha256 ?? null,
    datasetVersion: context.datasetVersion ?? null, dataStatus: context.dataStatus ?? null, evidence: context.evidence ?? null
  };
}

function csvEscape(text) {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(flatRows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of flatRows) lines.push(CSV_COLUMNS.map(c => csvEscape(cell(row[c]))).join(','));
  return `${lines.join('\n')}\n`;
}

// Minimal RFC4180 parser (used by tests and the comparison step; no dependency).
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false; } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// "N/A" -> null, numeric text -> number, "true"/"false" -> boolean, JSON arrays stay arrays.
function csvCellToValue(text) {
  if (text === 'N/A') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text !== '' && !Number.isNaN(Number(text)) && /^-?\d/.test(text)) return Number(text);
  if (/^[\[{]/.test(text)) { try { return JSON.parse(text); } catch { return text; } }
  return text;
}

module.exports = { SCHEMA_VERSION, METRIC_FIELDS, LEGACY_ALIASES, CSV_COLUMNS, buildDecisionRecord, recordToFlat, toCsv, parseCsv, csvCellToValue };
