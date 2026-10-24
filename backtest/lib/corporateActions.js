// Offline corporate-action heuristic only; no external source is contacted.
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
function assessCoverage(fetchResult) {
  if (!fetchResult) return { status: 'CORPORATE_ACTION_DATA_REQUIRED', reason: 'No corporate-action fetch was ever attempted for this run.' };
  if (fetchResult.ok) return { status: 'DATA_AVAILABLE', reason: null, recordCount: fetchResult.records.length };
  return {
    status: 'CORPORATE_ACTION_DATA_REQUIRED',
    reason: `Real NSE corporate-actions source could not be reached (${fetchResult.status ? `HTTP ${fetchResult.status}` : fetchResult.error}). Discontinuity flags below are heuristic-only and have NOT been cross-checked against an authoritative source.`
  };
}

module.exports={DEFAULT_DISCONTINUITY_THRESHOLD_PCT,detectPriceDiscontinuities,assessCoverage};
