# VIKRAM DATA DICTIONARY

Canonical field meanings, so the same name is never redefined inconsistently across modules.

| Field | Meaning | Source of truth |
|---|---|---|
| `verdict` | ACCUMULATION CONFIRMED / ACCUMULATION STARTING / UNCONFIRMED / MIXED / DISTRIBUTION | `accumulation/engine.js` |
| `score` | The engine's own composite score for the CURRENT lookback-window evaluation (not a historical snapshot score unless explicitly from `historicalVerdictStore`) | `accumulation/engine.js` |
| `why` | The engine's own real explanation strings for its verdict | `accumulation/engine.js` |
| `metrics.volumeRatio` | Recent average volume / prior baseline average volume | `server/src/scannerEngine.js` |
| `metrics.deliveryPct` | Delivery quantity as % of traded quantity | same |
| `metrics.changeOi` | Change in futures open interest for the exact trade date (only when `hasDerivatives`) | same |
| `detection.firstDetectedDate` / `firstDetectedPrice` | The real historical trade date / close price on the FIRST day of the current unbroken CONFIRMED streak | `server/src/detectionHistory.js` |
| `detection.latestDetectedDate` / `latestDetectedPrice` | Same, for the most recent day of that streak | same |
| `detection.detectedTradingDays` | Count of consecutive TRADING SESSIONS (never calendar days) the streak has held | same |
| T0 / P0 | Immutable detection date/price for a Hidden-Gem-relevant or backtest signal event — set once, never recalculated | `backtest/lib/signalEventStore.js`, `hiddenGems/engine.js` |
| `tier` (Hidden Gems) | Real point-in-time or current NIFTY membership used as CONTEXT for the stealth bar — never a disqualifier | `hiddenGems/engine.js` |
| `dataConfidence` (Hidden Gems) | HIGH/MEDIUM/LOW based on whether critical evidence categories exist and pass validation — never `available/total` fraction | same |
| Current lookback vs. historical snapshot | See `docs/governance/VIKRAM_TIMEFRAME_ARCHITECTURE.md` — these are NEVER interchangeable | `server/src/timeframeLabels.js` |
| `pricesAdjusted` / `adjustmentSource` | Whether a row's price reflects a real recorded corporate action, or is genuinely unadjusted (`NONE_RECORDED`) | `server/src/corporateActions.js` |
| `survivorshipCoverage` | % of a candidate symbol list that has an actual lifecycle record (not a guess of "probably fine") | `server/src/survivorship.js` |
