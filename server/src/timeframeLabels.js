'use strict';
// Centralized period-label text. See docs/governance/VIKRAM_TIMEFRAME_ARCHITECTURE.md.
//
// PERIOD_ROWS (server/src/index.js) controls how many trailing trading sessions feed a CURRENT
// verdict — it never means "as of N ago." Any UI copy for these periods must say so explicitly,
// so this is the one place that copy is allowed to be written, rather than being duplicated
// (and potentially drifted into misleading wording) on multiple pages.

const PERIOD_SESSIONS = { '1D': 1, '1W': 5, '1M': 22, '3M': 66, '6M': 132, '1Y': 252 };

function currentLookbackLabel(period) {
  const sessions = PERIOD_SESSIONS[period];
  if (!sessions) return null;
  return `Current verdict \u2014 trailing ${sessions} trading session${sessions === 1 ? '' : 's'}`;
}

// A historical-snapshot label is intentionally a DIFFERENT shape of string (includes the actual
// date), so it can never be confused with a current-lookback label at a glance.
function historicalSnapshotLabel(tradeDate) {
  if (!tradeDate) return null;
  return `Historical snapshot as of ${tradeDate}`;
}

module.exports = { PERIOD_SESSIONS, currentLookbackLabel, historicalSnapshotLabel };
