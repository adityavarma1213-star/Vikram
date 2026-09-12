# VIKRAM MASTER BLUEPRINT — canonical file map

Source blueprint: `docs/blueprint/VIKRAM_MASTER_BLUEPRINT_ROADMAP_MASTER_COMPREHENSIVE_09_SEP_2026.docx`
and `VIKRAM_MASTER_BLUEPRINT_ROADMAP_SEPTEMBER_2026.pdf`. This file maps each blueprint concept to
its ONE canonical implementation path, so future work doesn't create a second competing one.

| Concept | Canonical file |
|---|---|
| Accumulation Engine | `accumulation/engine.js` (never duplicate — see VIKRAM_DECISION_REGISTER.md) |
| Scanner materialization | `server/src/scanMaterializer.js`, `server/src/scannerEngine.js` |
| Ingestion + validation | `server/src/ingest.js`, `server/src/ingestValidation.js` |
| Point-in-time universe | `server/src/pointInTimeUniverse.js` |
| Survivorship | `server/src/survivorship.js` |
| Corporate actions (ratio adjustment) | `server/src/corporateActions.js` |
| Corporate actions (discontinuity detection, backtest-specific) | `backtest/lib/corporateActions.js` |
| Detection history calculator | `server/src/detectionHistory.js` (used by BOTH `staticSnapshot.js` and `ingest.js`) |
| Detection history UI rendering | `js/detectionHistoryView.js` |
| Historical verdict store | `server/src/historicalVerdictStore.js` |
| Timeframe label guard | `server/src/timeframeLabels.js` |
| Universe selector (current membership, UI) | `js/universeMembership.js`, `server/src/indexUniverses.js` |
| Opportunity Radar | `js/opportunityRadar.js` |
| Hidden Gems engine | `hiddenGems/engine.js` + `hiddenGems/config.js` (PROVISIONAL, unvalidated) |
| Hidden Gems backtest integration | `backtest/lib/hiddenGemsBacktest.js` |
| Immutable signal events (Hidden Gems/backtest scope) | `backtest/lib/signalEventStore.js` |
| ASM | `backtest/lib/asm.js` |
| Backtest runner | `backtest/backtestRunner.js` (event-based signal grouping, real-engine-wired) |
| Backtest downloader | `backtest/nseDownloader.js` |
| Backtest integrity/gate | `backtest/lib/manifest.js`, `backtest/lib/manifestIntegrity.js`, `backtest/lib/productionGate.js` |
| Allocation | `server/src/allocation.js` (calculation framework, not a validated methodology) |
| Live data | `server/src/liveData/*` (gate covers every network entry point) |
| Auth | `server/src/auth.js` |
| Alerts | `server/src/alerts/*` (single canonical dir — `alertEngine/` duplicate removed) |

## Known pre-existing legacy items (not part of the current architecture, not deleted this pass)
- `ui.js` (repo root) and `js/ui.js`: both confirmed unreferenced by any current page. Root copy
  has slightly MORE content (a risk-penalty explanation feature) than `js/ui.js` — a human should
  reconcile which is intended before either is removed or restored.
- `accumulation/api.js`: shared navigation component used by `about.html`/`alerts.html`/
  `scanner.html`, links to `index.html#hiddenGemsPreview` — but `index.html`'s own internal nav
  and the Hidden Gems section built this pass both use `#hiddenGems`. Pre-existing inconsistency,
  not introduced this pass; flagged for a human decision on which anchor name is canonical.
