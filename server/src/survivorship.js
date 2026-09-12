'use strict';
// Survivorship-bias prevention.
//
// A backtest that only uses today's surviving stock list silently excludes every company that
// was delisted, merged, or suspended during the backtest window — inflating results, since
// failures vanish from the universe instead of counting against it.
//
// `security_lifecycle` (schema.sql) is empty by default: this codebase has no real historical
// delisting feed yet (see docs/hidden-gems/HIDDEN_GEMS_OPEN_DECISIONS.md §2.6). This module
// therefore always reports whether survivorship data actually exists for a query, rather than
// silently assuming "not listed as delisted" means "definitely tradable" — the honest state
// while the lifecycle table is empty is UNKNOWN, not TRADABLE.

// lifecycleRows: array of {symbol, listed_date, delisted_date}. When no row exists for a
// symbol, this returns UNKNOWN (not true/false) — the caller must not treat "we have no record"
// as proof of survivorship-bias-free coverage.
function tradabilityOn(symbol, date, lifecycleRows) {
  const sym = String(symbol || '').trim().toUpperCase();
  const row = (lifecycleRows || []).find(r => String(r.symbol || '').toUpperCase() === sym);
  if (!row) return { status: 'UNKNOWN', reason: 'No lifecycle record for this symbol — survivorship data not yet available.' };
  const listed = row.listed_date ?? row.listedDate;
  const delisted = row.delisted_date ?? row.delistedDate;
  if (listed && String(date) < String(listed)) return { status: 'NOT_YET_LISTED', reason: `Listed on ${listed}` };
  if (delisted && String(date) > String(delisted)) return { status: 'DELISTED', reason: `Delisted on ${delisted}${row.delisting_reason ? ` (${row.delisting_reason})` : ''}` };
  return { status: 'TRADABLE', reason: null };
}

// Filters a candidate symbol list down to those genuinely tradable on `date`, and separately
// reports how many were excluded for UNKNOWN vs DELISTED/NOT_YET_LISTED reasons, so a backtest
// report can honestly state "survivorship coverage: N/M symbols verified" instead of implying
// full coverage it doesn't have.
function filterTradableAsOf(symbols, date, lifecycleRows) {
  const tradable = [];
  const excluded = [];
  const unknown = [];
  for (const symbol of symbols || []) {
    const result = tradabilityOn(symbol, date, lifecycleRows);
    if (result.status === 'TRADABLE') tradable.push(symbol);
    else if (result.status === 'UNKNOWN') { tradable.push(symbol); unknown.push(symbol); } // included, but flagged unverified
    else excluded.push({ symbol, ...result });
  }
  return {
    tradable,
    excluded,
    survivorshipCoverage: symbols && symbols.length ? Math.round(((symbols.length - unknown.length) / symbols.length) * 1000) / 10 : null,
    unverifiedSymbols: unknown
  };
}

module.exports = { tradabilityOn, filterTradableAsOf };
