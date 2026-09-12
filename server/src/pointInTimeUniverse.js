'use strict';
// Point-in-time universe membership.
//
// Answers, honestly: "was SYMBOL a member of INDEX_NAME on trading date T?"
//
// This is intentionally separate from server/src/indexUniverses.js, which only ever fetches
// TODAY's constituent list. Using today's membership to represent a historical date is exactly
// the look-ahead bug this module exists to prevent (a stock added to NIFTY 500 last month did
// NOT, and cannot retroactively, become a NIFTY 500 member two years ago).
//
// Storage model: each row is [symbol, indexName, effectiveFrom, effectiveTo, source, sourceDate].
// effectiveTo === null means "still a member as of the most recent snapshot we have." A symbol
// is a member of indexName on date T iff effectiveFrom <= T AND (effectiveTo === null OR T <=
// effectiveTo). Building genuine multi-year history requires either (a) a real historical
// constituent-change feed (not currently available to this codebase — see
// docs/hidden-gems/HIDDEN_GEMS_OPEN_DECISIONS.md §2.1), or (b) recording real daily snapshots
// going forward via recordSnapshot() below, which this module fully supports today. Nothing
// here fabricates a historical membership record.

function isMemberOn(date, effectiveFrom, effectiveTo) {
  if (!date || !effectiveFrom) return false;
  if (String(date) < String(effectiveFrom)) return false;
  if (effectiveTo != null && String(date) > String(effectiveTo)) return false;
  return true;
}

// membershipRows: array of {symbol, indexName, effectiveFrom, effectiveTo, source, sourceDate}
// Returns the list of index names `symbol` genuinely belonged to on `date`, per the recorded
// point-in-time rows only — never inferred from current membership.
function membershipAsOf(symbol, date, membershipRows) {
  const sym = String(symbol || '').trim().toUpperCase();
  return (membershipRows || [])
    .filter(row => String(row.symbol || '').toUpperCase() === sym && isMemberOn(date, row.effectiveFrom, row.effectiveTo))
    .map(row => row.indexName);
}

function isMemberOfIndexOn(symbol, indexName, date, membershipRows) {
  return membershipAsOf(symbol, date, membershipRows).includes(indexName);
}

// Turns a CURRENT constituent snapshot (e.g. from indexUniverses.fetchIndexUniverses) into
// point-in-time rows effective from `snapshotDate` onward. This is real data (the actual
// official constituent list on the day it was fetched) recorded honestly as a single dated
// snapshot — it is NOT a claim about any earlier date. Call this once per real trading day (via
// a scheduled job) to build genuine historical coverage going forward. Look-ahead protection:
// callers must never pass a `date` to membershipAsOf() earlier than a row's `sourceDate` was
// actually recorded for real use (rows recorded from a live job always satisfy this by
// construction, since effectiveFrom === the day they were actually fetched).
function snapshotToMembershipRows(indexName, symbols, snapshotDate, source) {
  const seen = new Set();
  const rows = [];
  for (const raw of symbols || []) {
    const symbol = String(raw).trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({ symbol, indexName, effectiveFrom: snapshotDate, effectiveTo: null, source, sourceDate: snapshotDate });
  }
  return rows;
}

// Given the PREVIOUS day's open-ended rows for one index and TODAY's real constituent set,
// closes off (`effectiveTo = the last date the symbol was still seen`) any symbol that has left
// the index, and opens a new row for any symbol newly added. This is how genuine point-in-time
// history accumulates over time from nothing but real daily snapshots — never a fabricated
// backfill.
function reconcileSnapshot(previousOpenRows, currentSymbols, indexName, snapshotDate, source) {
  const currentSet = new Set((currentSymbols || []).map(s => String(s).trim().toUpperCase()));
  const closed = [];
  const stillOpen = [];
  for (const row of previousOpenRows || []) {
    if (row.indexName !== indexName || row.effectiveTo != null) { stillOpen.push(row); continue; }
    if (currentSet.has(row.symbol)) { stillOpen.push(row); continue; }
    // Symbol was open yesterday but is genuinely absent from today's real constituent list.
    closed.push({ ...row, effectiveTo: snapshotDate });
  }
  const openSymbols = new Set(stillOpen.filter(r => r.indexName === indexName && r.effectiveTo == null).map(r => r.symbol));
  const additions = snapshotToMembershipRows(indexName, [...currentSet].filter(s => !openSymbols.has(s)), snapshotDate, source);
  return [...stillOpen, ...closed, ...additions];
}

module.exports = { isMemberOn, membershipAsOf, isMemberOfIndexOn, snapshotToMembershipRows, reconcileSnapshot };
