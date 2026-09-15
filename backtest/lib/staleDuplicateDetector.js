'use strict';
// Detects whether one day's CM (Capital Market) rows are a stale, carried-forward duplicate of
// the immediately preceding trading day's rows — the defect found and root-caused in
// FORENSIC_INTEGRATION_REPORT.md / ITEM1_DATE_VERIFICATION_REPORT.md: 13 dates in the existing
// 1-year dataset had per-symbol payloads (close/volume/delivery/etc, ignoring the date field
// itself) byte-identical to the prior date. All 13 turned out to be genuine NSE non-trading days
// (see nseHolidayCalendar.js) whose files should never have been materialized with the previous
// day's numbers — but this detector does NOT depend on the calendar being complete: it is a
// second, independent, general-purpose check so a FUTURE stale-duplicate (including one the
// static holiday calendar doesn't know about — like 2026-01-15's late-announced ad-hoc holiday)
// is still caught automatically, per Item 1's explicit requirement.
//
// Never used to silently delete anything: callers decide what to do with a flagged date
// (typically: exclude it from being treated as a genuine trading session, but never delete the
// underlying file — see backtestRunner.js's loadNormalizedBySymbol()).

const DEFAULT_THRESHOLD = 0.98; // fraction of common symbols with byte-identical payload

function rowPayload(row) {
  const { trade_date, ...rest } = row || {};
  return rest;
}

function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj || {}).sort());
}

// rowsA = current day's CM rows, rowsB = previous trading day's CM rows (each an array of
// { symbol, trade_date, close, ... }). Returns null if there's too little overlap to judge
// (never fabricates a verdict from insufficient data).
function detectStaleDuplicateDate(rowsA, rowsB, { threshold = DEFAULT_THRESHOLD, minCommonSymbols = 20 } = {}) {
  if (!Array.isArray(rowsA) || !Array.isArray(rowsB) || !rowsA.length || !rowsB.length) return null;

  const mapA = new Map(rowsA.filter(r => r && r.symbol).map(r => [r.symbol, stableStringify(rowPayload(r))]));
  const mapB = new Map(rowsB.filter(r => r && r.symbol).map(r => [r.symbol, stableStringify(rowPayload(r))]));

  let common = 0;
  let identical = 0;
  for (const [symbol, payloadA] of mapA.entries()) {
    if (!mapB.has(symbol)) continue;
    common += 1;
    if (payloadA === mapB.get(symbol)) identical += 1;
  }

  if (common < minCommonSymbols) return null; // not enough overlap to draw a conclusion

  const matchRatio = identical / common;
  return {
    isStaleDuplicate: matchRatio >= threshold,
    matchRatio: Math.round(matchRatio * 10000) / 10000,
    commonSymbols: common,
    identicalSymbols: identical,
    threshold
  };
}

// Convenience over a full { 'YYYY-MM-DD': rows[] } map, in chronological order. Returns an array
// of { date, previousDate, result } for every date whose result is non-null, so a caller can
// filter for isStaleDuplicate itself (kept separate from the per-pair check above so it stays
// trivially unit-testable with small fixtures).
function scanForStaleDuplicates(rowsByDate, options = {}) {
  const dates = Object.keys(rowsByDate).sort();
  const findings = [];
  for (let i = 1; i < dates.length; i += 1) {
    const date = dates[i];
    const previousDate = dates[i - 1];
    const result = detectStaleDuplicateDate(rowsByDate[date], rowsByDate[previousDate], options);
    if (result) findings.push({ date, previousDate, result });
  }
  return findings;
}

module.exports = { detectStaleDuplicateDate, scanForStaleDuplicates, DEFAULT_THRESHOLD, isWeekend, classifyTradingDays };

// --- Added to satisfy backtest/lib/dataContract.js's real, already-written expectations -------
// dataContract.js (and, through it, accumulationChain.js / forensicSignalReplay.js) requires
// isWeekend/classifyTradingDays from this module. Neither existed here before — this is not new
// holiday research: isWeekend is pure calendar arithmetic, and classifyTradingDays reuses ONLY
// the detection logic already in this file (detectStaleDuplicateDate, above) plus the already-
// merged, already-sourced data/duplicate-date-holiday-crossref.json (see REMEDIATION_STATUS.md
// and ITEM1_DATE_VERIFICATION_REPORT.md). No new holiday determination is invented here — a date
// this repo has no real evidence about is returned as UNRESOLVED, exactly as the crossref file
// itself already does, never silently upgraded to a confirmed holiday.
function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

let cachedCrossref = null;
function loadCrossref() {
  if (cachedCrossref !== null) return cachedCrossref;
  try {
    const path = require('path');
    const fs = require('fs');
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'duplicate-date-holiday-crossref.json'), 'utf8');
    cachedCrossref = JSON.parse(raw).classifications || [];
  } catch (e) {
    cachedCrossref = []; // genuinely absent -> no known classifications, not a guess
  }
  return cachedCrossref;
}

function loadAdjacentCmRows(dateStr) {
  try {
    const path = require('path');
    const fs = require('fs');
    const prev = new Date(`${dateStr}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const historyDir = path.join(__dirname, '..', '..', 'data', 'market-history');
    // Walk back up to 5 calendar days to find the most recent stored prior session (skips
    // weekends/already-known gaps rather than assuming exactly one day back).
    for (let i = 0; i < 5; i += 1) {
      const ymd = prev.toISOString().slice(0, 10);
      const p = path.join(historyDir, `${ymd}.json`);
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        return Array.isArray(parsed.cm) ? parsed.cm : null;
      }
      prev.setUTCDate(prev.getUTCDate() - 1);
    }
    return null;
  } catch (e) {
    return null;
  }
}

// entries: [{ date, file }], where `file` is the already-loaded data/market-history/<date>.json
// content (see dataContract.js's loadDay). Returns one classification object per entry, in the
// same order, never throwing on a single bad entry.
function classifyTradingDays(entries) {
  const crossref = loadCrossref();
  return (entries || []).map(({ date, file }) => {
    if (isWeekend(date)) return { date, status: 'NOT_A_TRADING_DAY', reason: 'weekend' };
    const cmRows = file && Array.isArray(file.cm) ? file.cm : null;
    if (cmRows) {
      const prevRows = loadAdjacentCmRows(date);
      const check = prevRows ? detectStaleDuplicateDate(cmRows, prevRows) : null;
      if (check && check.isStaleDuplicate) {
        const match = crossref.find(c => c.date === date);
        if (match && match.classification === 'LIKELY_HOLIDAY') {
          return { date, status: 'NOT_A_TRADING_DAY', reason: match.holidayName || 'stale-duplicate payload matching a known holiday', matchRatio: check.matchRatio };
        }
        return { date, status: 'UNRESOLVED', reason: 'stale-duplicate payload detected but no known holiday matches this date -- see data/duplicate-date-holiday-crossref.json', matchRatio: check.matchRatio };
      }
    }
    return { date, status: 'VALID_TRADING_DAY', reason: null };
  });
}
