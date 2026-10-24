// AUDIT FOLLOW-UP (§5): corporate actions (splits, bonuses, mergers, symbol
// changes) were completely unhandled — a real BLOCKER for trusting any
// eventual 5-year performance number. This module does NOT invent
// adjustment factors and does NOT silently "fix" prices. It does two
// things, both grounded in real, inspectable logic:
//
//   1. (REMOVED) This module used to attempt a direct fetch of NSE's corporate-actions
//      endpoint. That direct NSE acquisition code was deleted (see
//      docs/NSE_ACQUISITION_REMOVED.md). Corporate-action data must now come from a
//      separately authorized source; until one exists, coverage stays
//      CORPORATE_ACTION_DATA_REQUIRED.
//
//   2. Independent of any external data, a purely arithmetic heuristic
//      flags large single-day price discontinuities in the ALREADY
//      DOWNLOADED real price series as SUSPECTED_CORPORATE_ACTION. This
//      uses no external data and fabricates nothing — it only flags,
//      never adjusts.
//
// If (1) has never successfully returned data for a given date range, the
// pipeline's overall corporate-action coverage status is
// CORPORATE_ACTION_DATA_REQUIRED, and that must be surfaced in the final
// report rather than silently treating every discontinuity as an ordinary
// market move.

const DEFAULT_DISCONTINUITY_THRESHOLD_PCT = 20; // |1-day return| beyond this is flagged

// Pure function — no network, no fabrication. Flags days in an already-real
// price series where the single-day move is large enough that it is more
// likely to reflect a split/bonus/merger than ordinary trading, so a
// downstream consumer can treat that day's signal with explicit caution
// instead of silently trusting an unadjusted price jump.
function detectPriceDiscontinuities(history, thresholdPct = DEFAULT_DISCONTINUITY_THRESHOLD_PCT) {
  const flagged = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1];
    const curr = history[i];
    if (!prev.close || !curr.close || prev.close <= 0) continue;
    const changePct = ((curr.close - prev.close) / prev.close) * 100;
    if (Math.abs(changePct) >= thresholdPct) {
      flagged.push({
        date: curr.trade_date, prevClose: prev.close, close: curr.close,
        changePct: Math.round(changePct * 100) / 100,
        reason: 'SUSPECTED_CORPORATE_ACTION',
        note: 'Heuristic only: an unusually large single-day price move. Could be a genuine split/bonus/merger, OR a genuine large real market move (e.g. a results-driven crash/rally). This flag does NOT distinguish the two — it only tells a consumer to look closer before trusting the raw return.'
      });
    }
  }
  return flagged;
}

// Given whatever corporate-action result a caller supplies (or none),
// decide the overall coverage state to surface in the final report. Never
// silently defaults to "available."
function assessCoverage(fetchResult) {
  if (!fetchResult) return { status: 'CORPORATE_ACTION_DATA_REQUIRED', reason: 'No corporate-action fetch was ever attempted for this run.' };
  if (fetchResult.ok) return { status: 'DATA_AVAILABLE', reason: null, recordCount: fetchResult.records.length };
  return {
    status: 'CORPORATE_ACTION_DATA_REQUIRED',
    reason: `Real NSE corporate-actions source could not be reached (${fetchResult.status ? `HTTP ${fetchResult.status}` : fetchResult.error}). Discontinuity flags below are heuristic-only and have NOT been cross-checked against an authoritative source.`
  };
}

module.exports = { DEFAULT_DISCONTINUITY_THRESHOLD_PCT, detectPriceDiscontinuities, assessCoverage };
