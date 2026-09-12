// AUDIT FOLLOW-UP (§5): corporate actions (splits, bonuses, mergers, symbol
// changes) were completely unhandled — a real BLOCKER for trusting any
// eventual 5-year performance number. This module does NOT invent
// adjustment factors and does NOT silently "fix" prices. It does two
// things, both grounded in real, inspectable logic:
//
//   1. Attempts to fetch NSE's own corporate-actions data so any real
//      run has the authoritative source, if and when network access
//      exists. The endpoint below is the one referenced by commonly-used
//      open-source NSE tooling (e.g. nsepython, jugaad-data) for exactly
//      this purpose — it is NOT invented for this project — but it has
//      NOT been LIVE VERIFIED from this sandbox (same network wall as
//      everything else; see AUDIT.md). If it 404s, changes shape, or is
//      otherwise wrong once real access exists, this must be corrected
//      against NSE's live response, not assumed correct forever.
//
//   2. Independent of (1) ever succeeding, a purely arithmetic heuristic
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

const NSE_CORPORATE_ACTIONS_URL = 'https://www.nseindia.com/api/corporates-corporateActions';
// Referenced format (UNVERIFIED live): ?index=equities&from_date=DD-MM-YYYY&to_date=DD-MM-YYYY

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

// Attempts the real fetch. In this sandbox this will fail with the same
// host_not_allowed block as everything else — that is expected and is
// reported honestly, not swallowed.
async function fetchCorporateActionsRaw(fromDdMmYyyy, toDdMmYyyy, { fetchImpl = fetch } = {}) {
  const url = `${NSE_CORPORATE_ACTIONS_URL}?index=equities&from_date=${fromDdMmYyyy}&to_date=${toDdMmYyyy}`;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', Referer: 'https://www.nseindia.com/' } });
    if (!res.ok) {
      const denyReason = res.headers && res.headers.get ? res.headers.get('x-deny-reason') : null;
      return { ok: false, url, status: res.status, denyReason, coverage: 'CORPORATE_ACTION_DATA_REQUIRED' };
    }
    const data = await res.json();
    return { ok: true, url, records: Array.isArray(data) ? data : (data.data || []), coverage: 'DATA_AVAILABLE' };
  } catch (error) {
    return { ok: false, url, error: error.message, coverage: 'CORPORATE_ACTION_DATA_REQUIRED' };
  }
}

// Given whatever the fetch attempt above returned (or was never attempted),
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

module.exports = { NSE_CORPORATE_ACTIONS_URL, DEFAULT_DISCONTINUITY_THRESHOLD_PCT, detectPriceDiscontinuities, fetchCorporateActionsRaw, assessCoverage };
