'use strict';
// PROVISIONAL Hidden Gems configuration.
//
// configVersion is embedded in every engine result specifically so nothing downstream can
// present these numbers as validated. Every threshold below is either:
//   (a) taken directly from docs/hidden-gems/HIDDEN_GEMS_ALGORITHM_SPEC.md's own recommended
//       interim value (cited in comments), or
//   (b) a minimal, clearly-labeled placeholder where the spec explicitly says the number
//       "REQUIRES BACKTESTING" (see docs/hidden-gems/HIDDEN_GEMS_OPEN_DECISIONS.md §3) and no
//       walk-forward validation has been run (no real NSE history has even been acquired yet —
//       see backtest/data/manifest.json).
// NONE of these values should be read as "VIKRAM's real Hidden Gems thresholds." They exist so
// the pipeline is executable and testable; replacing them requires the walk-forward process in
// the spec's §O.5, once real multi-year NSE data exists.

const CONFIG_VERSION = 'HIDDEN_GEMS_PROVISIONAL_v1_UNVALIDATED';

module.exports = {
  configVersion: CONFIG_VERSION,
  validated: false,
  validationRequired: 'Walk-forward backtest per HIDDEN_GEMS_ALGORITHM_SPEC.md §O.5 — not yet performed (no real NSE history acquired).',

  // §1.1 (Open Decisions): "Context + tier-based thresholds now, historical-recognition-based as
  // long-run target." NIFTY membership adjusts the bar, it never excludes or flatly penalizes.
  tierAdjustment: {
    NONE: { stealthScoreMultiplier: 1.0 },      // not in any tracked index — baseline bar
    'NIFTY 500': { stealthScoreMultiplier: 1.1 }, // slightly higher bar: more likely partially watched
    'NIFTY 200': { stealthScoreMultiplier: 1.25 },
    'NIFTY 50': { stealthScoreMultiplier: 1.5 }   // large-cap: needs much stronger stealth evidence
  },

  // Opportunity-qualification bar — spec lists this as "REQUIRES BACKTESTING" (Open Decisions
  // §3). Provisional choice: require the strict base verdict only (not STARTING), as the more
  // conservative placeholder pending validation.
  opportunityQualifiesOn: ['ACCUMULATION CONFIRMED'],

  // Stealth moderate-vs-extreme cutoffs — "REQUIRES BACKTESTING" (Open Decisions §3). Provisional
  // placeholders only.
  stealth: {
    minSessions: 10,          // spec's own worked example used 30 sessions, explicitly "untested"
    volumeRatioModerateMax: 2.0, // above this, volume looks "already noticed", not stealthy
    obvSlopeModerateMax: 0.15
  },

  // Recognition trigger cutoffs — "REQUIRES BACKTESTING" (Open Decisions §3).
  recognition: {
    priceExpansionPersistenceSessions: 5,
    volumePercentileRecognized: 90,
    triggerCounts: { notRecognized: 0, emergingRecognition: 1, recognized: 2 }
  },

  // Institutional under-recognition thresholds — "REQUIRES BACKTESTING" (Open Decisions §3).
  institutional: {
    underRecognizedMaxCombinedPct: 15,  // FII+DII+MF combined holding below this = under-recognized
    accelerationMinPct: 1.0             // minimum QoQ increase to count as "accelerating"
  },

  // Data Confidence: rejected formula was "available/total fields" (Open Decisions §3, explicitly
  // rejected in spec §M.1). Provisional replacement: critical categories are recognition state
  // and institutional state — if EITHER is DATA_INSUFFICIENT, confidence is capped at LOW no
  // matter how many minor fields are present.
  dataConfidence: {
    criticalCategories: ['recognitionState', 'institutionalState'],
    tiers: { HIGH: 0.8, MEDIUM: 0.5, LOW: 0 }
  },

  // Failure-rate return floor, minimum lead time, max incubation window — all "REQUIRES
  // BACKTESTING" (Open Decisions §3). Left as explicit nulls: using an invented number here would
  // be worse than admitting it doesn't exist yet.
  failureRateReturnFloorPct: null,
  minimumValidLeadTimeTradingDays: null,
  maxIncubationWindowTradingDays: null
};
