# VIKRAM Forensic Integration Report

Generated against the uploaded `VIKRAM-SCANNER-REDESIGN-fixed` export. All findings below are
file/function-level evidence, not inference from filenames.

## PHASE 1-2: FORENSIC AUDIT (BEFORE)

| FEATURE | STATUS | SOURCE DATA | CALCULATION | OUTPUT | CONSUMER | EVIDENCE |
|---|---|---|---|---|---|---|
| 1-Year Research | COMPLETE, ISOLATED | `backtest/REAL_1YEAR_BACKTEST_RESULT.json` (real NSE, 776 signal events) | `backtest/backtestRunner.js` (pre-existing, real) | Same JSON, `signals[]` | `js/research.js` -> `research.html` | `js/research.js:` fetches the file directly, computes horizon stats client-side |
| Forward returns (1D/5D/20D/60D/120D) | COMPLETE | Same backtest JSON | `backtest/backtestRunner.js` | `signals[].horizons` | 1-Year Research page | Present and real; `INSUFFICIENT_FUTURE_DATA` used honestly where a horizon hasn't elapsed |
| ASM | COMPLETE, ISOLATED | Same backtest JSON's `signals` | `backtest/lib/asm.js` (`buildAsm`) | `asm.records[]` (MFE/MAE/drawdown/status per horizon, per event) | `js/research.js` -> research.html ASM tab | Real, tested (`backtest/test/asm.test.js`) |
| Hidden Gems (live) | PARTIAL, CURRENT-ONLY | `data/scanner.json` via Postgres `scanner_results`/`cm_eod` | `hiddenGems/engine.js` (`evaluate`) via `/api/hidden-gems` | Live classification JSON | `index.html` `renderHiddenGems()` (requires `window.ACCUMULATION_API_BASE`) | `evaluate()` took no historical/ASM input at all before this change |
| Hidden Gems (static site) | MISSING | n/a | n/a | n/a | `index.html`, no backend configured | `window.ACCUMULATION_API_BASE` is set nowhere in the repo; production is GitHub Pages (`.github/workflows/static-scanner.yml`) — Hidden Gems always rendered "VERIFICATION BLOCKED" |
| Opportunity Radar | PARTIAL, CURRENT-ONLY | `data/scanner.json` | `js/opportunityRadar.js` (`rankScore`, current volume/delivery/OI only) | Ranked list | `index.html` inline script | Zero references to ASM, backtest, or any historical field |
| Accumulation/Scanner engine | COMPLETE | Verified NSE EOD data | `accumulation/engine.js`, `frameworkEngine.js` | `data/scanner.json` | Scanner page, Hidden Gems, Opportunity Radar | Refreshed by `.github/workflows/static-scanner.yml` |
| NSE ingestion | COMPLETE | NSE bhavcopy/downloads | `server/src/*`, `backtest/*` downloaders | Postgres `cm_eod` | Everything downstream | Admin-gated (unchanged, untouched by this work) |

**Duplication found (beyond what was asked about):**
- `ui.js` (root) and `js/ui.js`: two diverging copies of an old "low market cap + score >= 60"
  Hidden Gems heuristic — exactly the anti-pattern flagged in the brief — but **zero** HTML file
  loaded either one. Dead code, not live behavior. **Removed** (see below).
- `js/discoveryRepair.js`: on the *live* page, this ran a `MutationObserver` that fully
  re-rendered `#opportunityRadar` with its own simplified score-only table every time the DOM
  changed — silently overwriting the tested, canonical `js/opportunityRadar.js` implementation
  every few hundred milliseconds. This was an active bug, not dead code. **Fixed** (see below).

## ANSWERS TO THE 10 SPECIFIC QUESTIONS

1. Real NSE data? **Yes** — `manifestSummary.data_provenance` in the committed backtest result is `REAL_NSE`.
2. 1D/5D/20D/60D/120D forward returns computed? **Yes**, all five, with honest `INSUFFICIENT_FUTURE_DATA` markers where not yet resolvable.
3. Does ASM consume 1-Year Research/backtest results? **Yes** — same `signals` array, same run.
4. Does ASM compute MFE/MAE/max drawdown/success-failure per horizon? **Yes.**
5. Does Hidden Gems consume 1-Year Research/ASM/historical stats? **No, before this change.** Only scanner/current data.
6. Does Opportunity Radar consume any historical evidence? **No, before this change.** Only scanner/current data.
7. Is there ONE canonical research/signal-results layer all downstream modules consume? **No — this was the core gap.** There were two disconnected islands: (Scanner -> Hidden Gems/Radar) and (Scanner -> Backtest -> 1-Year Research/ASM).
8. Multiple independent Hidden Gems/Radar implementations? **Yes** — the dead `ui.js`/`js/ui.js` pair, and the live `discoveryRepair.js` DOM takeover of Opportunity Radar.
9. Multiple independent scoring engines producing conflicting results? The frozen VIKRAM v15.0 IQE (`frameworkEngine.js`) is singular and untouched. The conflict was in *rendering*, not scoring: `discoveryRepair.js` painted a second, different Opportunity Radar table over the real one.
10. Can historical research automatically influence current Hidden Gems/Radar without a manual CSV step? **No, before this change.** Now yes — see below.

## CURRENT (BEFORE) DATA FLOW

```
Verified NSE Data
      |
Accumulation/Scanner engine
      |-> data/scanner.json --> Opportunity Radar (current-only)
      |                     `-> Hidden Gems (current-only, live backend only)
      `-> Backtest (backtestRunner.js)
              -> REAL_1YEAR_BACKTEST_RESULT.json
                     -> 1-Year Research (research.html)
                     -> ASM (research.html)
                     (dead end — nothing downstream reads this)
```

## ROOT CAUSE

Nobody wrote the aggregation step. ASM's real output is a flat list of individual past
*events* (one row per historical signal), keyed loosely, never rolled up **by symbol**. Hidden
Gems and Opportunity Radar both operate per-symbol on `data/scanner.json`. There was no function
anywhere in the repo that turned "N past events for symbol X" into "X's historical win rate,"
so there was nothing for the current-signal modules to join against — even though every input
they'd need already existed as real, computed data.

## WHAT WAS IMPLEMENTED (Phase 4)

New canonical layer: `backtest/lib/researchIntelligence.js` — pure aggregation, per symbol, per
horizon, over real ASM records: sample count, win rate, median/avg return, avg MFE/MAE/drawdown,
and a documented (not fitted/overfit) sample-size confidence tier. Zero fabrication: a
symbol/horizon with no computed outcomes gets an explicit `INSUFFICIENT_SAMPLE` record with every
numeric field `null`.

```
NSE DATA
   |
Accumulation/Signal Engine (unchanged)
   |
   |-> data/scanner.json --------------------------------------------+
   |                                                                  |
   `-> backtest/backtestRunner.js (unchanged calculation)             |
          -> REAL_1YEAR_BACKTEST_RESULT.json                         |
                -> asm.records[] (unchanged)                         |
                      -> buildResearchIntelligence()  [NEW]           |
                            -> data/researchIntelligence.json  [NEW]  |
                                   |                                  |
                    +--------------+------------------+               |
                    |                                  |               |
                    v                                  v               v
        server/src/index.js /api/hidden-gems   js/opportunityRadar.js buildDisclosure()
        (loads evidence, attaches to             (loads via js/researchIntelligence.js,
         hiddenGems.evaluate() result,            attaches to Level 5 disclosure —
         evaluate() itself unchanged)             rankScore untouched)
                    |                                  |
                    v                                  v
              Hidden Gems UI                   Opportunity Radar UI
        (index.html renderHiddenGems() —        (index.html renderOpportunityRadar())
         works even with NO live backend,
         via the static artifact directly)
```

Key design choices, matching the brief's explicit constraints:
- **No duplicate engine.** `buildResearchIntelligence()` consumes the *same* `asm` object
  `backtestRunner.js` already builds — it does not recompute forward returns, MFE, MAE, or
  drawdown itself.
- **No CSV step.** `data/researchIntelligence.json` is a static artifact fetched automatically by
  the browser (`js/researchIntelligence.js`) and read directly by the server
  (`server/src/index.js`), exactly like `data/scanner.json` already is.
- **Historical evidence never changes current classification/score.** `hiddenGems/engine.js`'s
  `classify()` is untouched; `historicalEvidence` is attached as a sibling field. Same for
  `js/opportunityRadar.js`'s `rankScore()` — verified by a new test
  (`server/test/opportunityRadar.test.js`, test 8) that asserts rank score is bit-for-bit
  identical with and without an intelligence map supplied.
- **Frozen IQE untouched.** No line in `frameworkEngine.js` / `js/frameworkEngine.js` was changed.
- **CI regeneration.** `.github/workflows/research-intelligence.yml` rebuilds the artifact
  whenever the real backtest result changes — no manual step required going forward.

## DUPLICATE/LEGACY CLEANUP

- **Removed:** `ui.js`, `js/ui.js` (confirmed zero references in any `.html` file before removal;
  their only mentions were in `CHECKSUMS.json`, which was updated to drop the stale entries).
- **Trimmed:** `js/discoveryRepair.js` — removed the `MutationObserver`/`renderBox()`/`cleanup()`
  logic that repeatedly overwrote `#opportunityRadar` with a second, simpler implementation.
  Kept its other, unrelated job (patching the Company Overview panel's score/verdict labels for
  `?symbol=` deep links), which does not touch Hidden Gems or Opportunity Radar.
- **Left alone (out of scope, flagged for awareness):** `js/researchRepair.js` does a very similar
  Company Overview patch to the one kept in `discoveryRepair.js`. Likely a second, smaller
  duplication, but unrelated to the Hidden Gems/ASM/Radar integration this task targeted — did not
  touch it to avoid unnecessary risk.

## TESTS ACTUALLY RUN (this sandbox, no network/DB)

**backtest/**: 13 of 15 pass. `downloaderResume.test.js` and `liveNetworkProbe.test.js` fail —
both pre-existing, both require live network access this sandbox does not have (confirmed
unrelated to this change: they fail identically before and after).
New: `backtest/test/researchIntelligence.test.js` — 7 assertions, all pass.

**server/**: 29 of 31 pass. `detectionHistory.test.js` and `indexUniverses.test.js` fail —
both pre-existing, both require the `pg` package / a live Postgres connection, neither available
in this sandbox (confirmed unrelated: same failure before and after).
Extended: `server/test/opportunityRadar.test.js` (+1 test, 4 assertions) and
`server/test/hiddenGemsEngine.test.js` (+1 test, 5 assertions) — all pass.

## TESTS BLOCKED AND WHY

- `npm test` in `server/` and `backtest/` could not be run as a single command: no network access
  to `npm install` (`pg`, `express`, `csv-parse`, `unzipper`, `web-push` are not vendored in this
  sandbox). Every test file that doesn't `require()` one of those packages was run directly with
  `node <file>.test.js` instead (see list above).
- Full integration test (`server/test/integration.test.js`) self-skips without `DATABASE_URL` —
  ran, and it printed `SKIP` rather than a false pass.
- Could not start the live Express server or exercise `/api/hidden-gems` over HTTP end-to-end —
  no Postgres in this sandbox. The route code was verified by static syntax check
  (`node --check server/src/index.js`) and by reasoning through the (unit-tested) function it
  calls, but the live HTTP path itself is unverified here.
- Could not open `index.html` in a real browser — verified by extracting and `node --check`-ing
  the inline `<script>` block, and by confirming every DOM id it references exists in the file.

## SECURITY CHECK

No changes were made to `server/src/*` authentication/admin middleware, the PostgreSQL advisory
lock, or ingestion endpoints — the only edit in `server/src/index.js` is inside the pre-existing,
unauthenticated-read `/api/hidden-gems` GET route (research-only, already public), adding a
synchronous local-file read of `data/researchIntelligence.json` (no new external input, no new
write path, no new admin-adjacent code).

## DATA INTEGRITY CHECK

`data/researchIntelligence.json` was generated by actually running
`backtest/scripts/buildResearchIntelligence.js` against the real, already-committed
`backtest/REAL_1YEAR_BACKTEST_RESULT.json` — 191 symbols, 897 real `COMPUTED` horizon
outcomes and 58 honest `INSUFFICIENT_SAMPLE` outcomes (spot-checked, see audit steps above). No
value in that file was invented, estimated, or interpolated.

## FINAL VERIFICATION (Phase "second forensic audit") — 10-point checklist

1. One canonical research result exists: `data/researchIntelligence.json` — **YES**.
2. 1-Year Research consumes it: unchanged (it already used the real backtest result directly;
   no change was needed or made here) — **N/A / already correct**.
3. ASM consumes it: ASM is the *source* of it (`buildResearchIntelligence(asm)`), not a
   consumer — **verified correct by construction**.
4. Hidden Gems consumes it: `server/src/index.js` `/api/hidden-gems` loads and attaches it per
   symbol — **YES**; `index.html`'s static fallback also reads it directly — **YES**.
5. Opportunity Radar consumes it: `js/opportunityRadar.js buildDisclosure()` + `index.html` —
   **YES**.
6. No manual CSV step required: both consumers fetch/read the JSON artifact automatically —
   **YES**.
7. No duplicate calculation engine silently active: `discoveryRepair.js`'s competing Opportunity
   Radar renderer removed; dead `ui.js`/`js/ui.js` removed — **YES**.
8. Historical data is real: traced to `REAL_1YEAR_BACKTEST_RESULT.json`'s
   `data_provenance: REAL_NSE` — **YES**.
9. Missing data is not fabricated: 58 `INSUFFICIENT_SAMPLE` entries with null fields confirmed
   present in the real output — **YES**.
10. VIKRAM v15.0 IQE unchanged: no diff in `frameworkEngine.js` / `js/frameworkEngine.js` —
    **YES**.
11. Existing security intact: no auth/admin/ingestion files touched — **YES**.

## REMAINING LIMITATIONS

- The live `/api/hidden-gems` HTTP route with the new evidence wiring was verified statically, not
  by an actual HTTP round-trip (no Postgres available here).
- `js/researchRepair.js` vs. the trimmed `js/discoveryRepair.js` company-overview duplication was
  identified but intentionally left untouched (out of scope for this task).
- `data/researchIntelligence.json` will go stale exactly as fast as
  `backtest/REAL_1YEAR_BACKTEST_RESULT.json` does; the new
  `.github/workflows/research-intelligence.yml` keeps it fresh automatically going forward, but
  has not itself been run (cannot run GitHub Actions from this sandbox) — verify it fires green
  after the first real push that touches the backtest result.
