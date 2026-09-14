# VIKRAM Master Feature Checklist — Session Log

Continues from `DATA_FOUNDATION_CHECKLIST_12_SEP_2026.md` (Session 1: data
foundation, stale-duplicate detector, backtest data contract). That file's
content is preserved below the divider unchanged. This file is now the
canonical running checklist; future sessions should update THIS file.

**Status legend:** IMPLEMENTED / PARTIALLY IMPLEMENTED / DATA INSUFFICIENT /
VERIFICATION BLOCKED / NOT STARTED

## Session 2 (13 Sep 2026) — Accumulation DNA, SOAI, False Accumulation Detector

**Environment unchanged:** still no network path to nseindia.com/niftyindices.com
from this sandbox (not re-tested this session — no reason to expect it changed,
re-verify at the start of the session that actually resumes network-dependent work).

### 1. Accumulation DNA — **IMPLEMENTED**
- `backtest/lib/accumulationDNA.js` + `backtest/test/accumulationDNA.test.js`.
- Deterministic, self-relative (each symbol vs its own trailing baseline, never a
  cross-sectional magic number) classifier covering: AGGRESSIVE_ACCUMULATION,
  PRICE_SUPPRESSED_ACCUMULATION, DELIVERY_LED_ACCUMULATION, FO_LED_ACCUMULATION,
  BREAKOUT_ACCUMULATION, LATE_ACCUMULATION, QUIET_ACCUMULATION,
  EARLY_ACCUMULATION, DISTRIBUTION, and an explicit neutral NO_CLEAR_PATTERN
  (never forces a label when nothing matches).
- Every result carries `evidence` (the raw ratios), `confidence`
  (LOW/MODERATE — never HIGH without a much longer verified track record),
  and `limitations` (states plainly that "volatility" is close-to-close
  stdev, not true ATR, because this dataset has no intraday high/low —
  verified by inspecting all CM fields across 10 real files).
- Tested against 4 synthetic fixtures with known deterministic outcomes
  (aggressive / price-suppressed / distribution / no-pattern) AND a real-data
  scan of 25 real symbols as of 2026-09-04: **24 classified, 1
  DATA_INSUFFICIENT**, no fabricated inputs.

### 2. SOAI (Stealth Order Absorption Index) — **IMPLEMENTED**
- `backtest/lib/soai.js` + `backtest/test/soai.test.js`.
- Formula, limitations, and rationale fully documented in the module header:
  `soaiRaw = sum(deliv_qty)/(sum(|close - prev_close|)+1)` over a window,
  then a z-score of the recent window's ratio against that SAME symbol's own
  trailing baseline windows. No cross-stock comparison.
  Discloses `abs(close-prev_close)` is a range proxy, not true ATR (no
  high/low field exists in this dataset).
  Labels use evidence-based language only —
  `PRICE_SUPPRESSED_ABSORPTION_PATTERN` /
  `ELEVATED_ABSORPTION_WITH_PRICE_PARTICIPATION` / `BELOW_NORMAL_ABSORPTION` /
  `NORMAL_RANGE` — never "secret institutional buying" or similar.
- Tested with hand-computed exact values (`soaiRawForWindow` verified against
  a manually worked example) plus real-data scan: 24/25 symbols calculated.

### 3. False Accumulation Detector — **IMPLEMENTED (with an honest, permanent ceiling)**
- `backtest/lib/falseAccumulationDetector.js` +
  `backtest/test/falseAccumulationDetector.test.js`.
- Reuses (does not duplicate) `corporateActions.detectPriceDiscontinuities`.
- Adds real checks: futures-rollover proximity (using the actual `expiry`
  field already in F&O data), self-relative volume-spike z-score.
- Explicitly, permanently reports the bulk/block-deal check as
  `DATA_INSUFFICIENT` — this repository contains **no bulk/block-deal fields
  anywhere** (checked). **`ACCUMULATION_CONFIRMED` is never emitted by this
  engine** and the module header states why: confirming would require
  disclosure-level data this dataset does not have. Verified by test:
  no constructed input produces `ACCUMULATION_CONFIRMED`.
- Real-data scan of 25 symbols as of 2026-09-04: 12 ACCUMULATION_LIKELY,
  12 ACCUMULATION_UNCERTAIN, 1 DATA_INSUFFICIENT.

### 4. Integration into VIKRAM scoring — **PARTIALLY IMPLEMENTED**
- `backtest/lib/accumulationIntelligence.js` +
  `backtest/test/accumulationIntelligence.test.js` — composes the three
  engines above (pure composition, no new competing calculation) into one
  record with `evidenceFor` / `evidenceAgainst` arrays directly answering
  "why did VIKRAM consider this accumulation" and "what could make this
  signal false." Verified no-look-ahead: a record built as-of an earlier
  real date contains no data from later dates (asserted in test).
- **NOT YET DONE:** wiring this record into the actual live scanner/scoring
  output surfaced by the existing production scanners
  (`ACCUMULATION_SCANNER_STATUS.md` etc.) — this session only built and
  tested the engine and its composition layer, not the UI/API integration
  point. That is the concrete next step for this item.
- Supporting infra: `backtest/lib/symbolSeries.js` (new) — a shared,
  no-look-ahead, per-symbol chronological index over
  `data/market-history/*.json`, built once and reused by all three engines
  so there is exactly one place symbol history is assembled.

### Test results this session
All 21 backtest test files run individually:
19 PASS (including 6 new: `accumulationDNA`, `soai`,
`falseAccumulationDetector`, `accumulationIntelligence`, plus the 2 from
session 1). 2 FAIL, both pre-existing and unrelated to this session's
changes: `downloaderResume.test.js` (pre-existing manifest-isolation bug,
identified session 1) and `liveNetworkProbe.test.js` (network-dependent,
expected). No regressions introduced.

### Not started this session (unchanged from session 1's list otherwise)
5. Signal DNA — NOT STARTED (should consume `accumulationIntelligence.js`
   output as one of its dimensions once started)
6. Historical Analogue Engine — NOT STARTED
7. VIKRAM Memory — NOT STARTED
8. False-Signal Memory — NOT STARTED
9. Market Regime Engine — NOT STARTED
10. Sector Accumulation Intelligence — NOT STARTED
11–16. Capital Rotation / Accumulation Chain / Value Chain / Participant OI /
   Promoter-Insider / Block-Deal Intelligence — NOT STARTED (several of
   these, e.g. Promoter/Insider, Block-Deal, Participant OI-by-category,
   will land on `VERIFICATION BLOCKED` once attempted: this dataset has no
   promoter/insider disclosure, no bulk/block-deal records, and no
   FII/DII/client OI breakdown — only aggregate OI/change_oi. Confirmed
   during this session while building the False Accumulation Detector.)
17. Governance/Forensic Overlay — NOT STARTED
18. ASM/GSM Intelligence — existing work untouched this session
19–21. Recommendation Engine / Lifecycle / Scanner Catch Timeline — NOT
   STARTED this session (forward-outcomes engine already existed pre-session
   1, per `REAL_1YEAR_BACKTEST_RESULT.json`)
22–23. Signal Decay / Self-Scorecard — NOT STARTED
24. Recommendation Delta Explainer — NOT STARTED
25–26. Research Provenance Lab / Research Lab — NOT STARTED
27. What Changed Today — NOT STARTED
28. Forensic Signal Replay (final integration) — NOT STARTED; depends on
   most items above existing first

### 5. Signal DNA — **IMPLEMENTED (with two permanently-disclosed unavailable dimensions)**
- `backtest/lib/signalDNA.js` + `backtest/test/signalDNA.test.js`, plus
  `backtest/lib/sectorLookup.js` (new small helper).
- Pure composition over Accumulation DNA / SOAI / False Accumulation
  Detector (no new duplicate calculation) into one fixed-shape record with a
  reproducible string `fingerprint` (verified deterministic: building twice
  for the same symbol/date yields an identical fingerprint — asserted in test).
- `sectorLookup.js` safely text-extracts ticker→sector pairs from the
  existing `js/companyDatabase.js` WITHOUT `require()`/`eval()`-ing it (that
  file references `window` and isn't Node-safe) — disclosed as sparse:
  verified only 5 tickers exist in that file, so `sector` is `available:
  false` for every other symbol, never guessed.
- `marketRegime` and `relativeStrength` dimensions are **permanently**
  `available: false` until Market Regime Engine (#9) and an index-level
  price series respectively are built — neither exists in this codebase yet
  (confirmed by searching for both this session). Not a bug; disclosed in
  the module header and enforced by test.
- `compareSignalDNA(a, b)` — a similarity function for the future Historical
  Analogue Engine (#6): computes distance only over numeric dimensions
  present in BOTH records, returns `DATA_INSUFFICIENT` (not a fabricated
  score) when fewer than 2 dimensions overlap. Verified: comparing a record
  to itself gives similarity ≈ 1; comparing an under-history record returns
  `DATA_INSUFFICIENT`.
- Real-data test: built for 10 real symbols as of 2026-09-04, all with
  disclosed-unavailable regime/relative-strength dimensions as expected.

### Updated test results (end of session 2)
21 backtest test files (8 new across the two milestones this session:
`accumulationDNA`, `soai`, `falseAccumulationDetector`,
`accumulationIntelligence`, `signalDNA`, plus session 1's `staleDuplicateDetector`
and `dataContract` — 7 new library modules total). **19 PASS, 2 FAIL**
(`downloaderResume.test.js` pre-existing isolation bug,
`liveNetworkProbe.test.js` network-dependent/expected) — unchanged from
before this work, no regressions.

## Session 3 (13 Sep 2026) — QC Audit Pass on Accumulation Engines

Per explicit instruction: no new engines built this session; this was a
rigorous audit of the 5 engines from session 2, fixing only demonstrated
technical issues. No engine was rebuilt or replaced.

### 1. SOAI audit — 1 genuine bug found and fixed
- **Bug (real, not cosmetic):** `soaiRawForWindow` summed `deliv_qty` over
  every day-index 1..end regardless of whether that day's `close` was valid,
  while the range total only summed pairs with valid closes — a missing
  close could silently misalign the two sums. Fixed: both sums now walk the
  same pairs in lockstep.
- **Second bug:** missing `deliv_qty` was silently treated as `0` via
  `r.deliv_qty || 0`, which could understate real absorption without any
  disclosure. Fixed: a window with >20% missing delivery observations now
  returns `null` (→ `DATA_INSUFFICIENT`) instead of a value computed on
  substituted zeros.
- Terminology check: confirmed (grep) the module never called the range
  proxy "true ATR" anywhere — already correctly labeled a "close-to-close
  range proxy" in comments; strengthened the header wording further to be
  unambiguous.
- New tests added: missing close values, missing delivery below/above the
  20% threshold, zero-movement window (no division-by-zero), zero-variance
  baseline (must yield `INSUFFICIENT_SIGNAL` with the reason text
  containing "zero-variance baseline"), reproducibility (deep-equal on
  identical input).
- Real-data re-run after the fix: **2,661/2,950 real symbols** calculable
  (`289 DATA_INSUFFICIENT`) as of the latest date, full dataset.

### 2. Accumulation DNA audit — 1 genuine bug found and fixed
- **Bug (real):** `windowStats` required only 2 non-null closes anywhere in
  a window before computing full price/volatility stats — an "N-day" window
  could silently be driven by as few as 2 real observations. Fixed: a
  window now needs ≥70% real close coverage or returns `null`
  (`DATA_INSUFFICIENT`).
- **Second bug:** `deliveryRatio`/`volumeRatio` were computed from
  `mean()` over whatever non-null delivery/volume values existed, with no
  floor — a ratio built from 10% real data could still drive a
  classification. Fixed: either ratio is nulled out (never fabricated) if
  either window's coverage for that field is below 50%, and the reason is
  recorded in `limitations`.
- Confirmed via code read: no future data used (all input arrays are
  caller-filtered to ≤ asOfDate), no cross-stock normalization (every ratio
  is self-relative), `NO_CLEAR_PATTERN` remains reachable and is exercised
  by tests, thresholds are explicitly disclosed as "a first defensible cut,
  not statistically optimized" (unchanged wording, re-verified this
  session).
- New tests added: sparse-close window (< 70% coverage → `DATA_INSUFFICIENT`),
  sparse-delivery window (ratio nulled, not fabricated), reproducibility,
  confidence-ceiling check (`confidence` is never `HIGH` — asserted against
  all synthetic scenarios).
- Real-data re-run: **2,730/2,950 real symbols** classified,
  `220 DATA_INSUFFICIENT`, full dataset.

### 3. False Accumulation Detector audit — no bugs found, additional tests added
- Verified by code read + tests that no `DATA_INSUFFICIENT` check can ever
  become `CLEAR`: each of the four checks has its own independent
  branch, and one test each now specifically forces the
  `rolloverProximity`- and `volumeSpike`-insufficient paths and asserts they
  stay `DATA_INSUFFICIENT`.
- Verified `bulkBlockDealDisambiguation` is `DATA_INSUFFICIENT` in every
  constructed scenario (looped assertion across all 7 test fixtures).
- Added a source-level grep assertion inside the test itself: the literal
  string `ACCUMULATION_CONFIRMED` never appears as an assignable `verdict`
  value anywhere in `falseAccumulationDetector.js`.
- Reproducibility test added (deep-equal on identical input).
- **No code changes to this file** — checksum-verified identical to before
  this session (see §8 below).
- Real-data re-run: **1,388 ACCUMULATION_LIKELY / 1,519 ACCUMULATION_UNCERTAIN
  / 31 FALSE_ACCUMULATION_RISK / 12 DATA_INSUFFICIENT**, full 2,950-symbol
  dataset, zero `ACCUMULATION_CONFIRMED`.

### 4. Signal DNA audit — genuine normalization bug found and fixed (the most important finding this session)
- **Bug (real, exactly as flagged):** `compareSignalDNA` computed raw
  Euclidean distance directly over price (%, ~±20), volatility (decimal,
  ~0.005–0.05), delivery (%, 0–100), F&O OI ratio (~1.0-centered), and SOAI
  (already a z-score, ~±3) — units that are not comparable. Delivery's
  0–100 range would numerically dominate volatility's 0.005–0.05 range
  regardless of which difference actually mattered more.
- **Fix — real-data calibration, not invented weights:** added
  `computePopulationStats(symbols, asOfDate, index, buildSignalDNA)`, which
  scans real Signal DNA records (never synthetic) and computes an actual
  mean/stdev per dimension from that real sample. `compareSignalDNA(a, b,
  populationStats)` now z-scores each dimension independently using those
  real, measured statistics if — and only if — that specific dimension has
  ≥15 real samples; a thinly-sampled dimension (this dataset's F&O/OI data
  has real, documented gaps) is excluded from that comparison rather than
  either being calibrated on too little evidence or dragging the whole
  comparison back to raw units.
- **Honest fallback preserved:** calling `compareSignalDNA(a, b)` with no
  `populationStats` (the old call signature, unchanged for backward
  compatibility) now returns `calibration: 'UNCALIBRATED_PROTOTYPE'` with an
  explicit warning in `limitations` that raw units were compared directly
  and the result must not be presented as statistically validated.
- Verified with real data: `computePopulationStats` over 39 real symbols
  gave real n/mean/stdev for price (n=39), volatility (n=39), delivery
  (n=39), SOAI (n=38) — all comfortably above the 15-sample floor — but
  F&O OI only had **n=3** real samples, correctly triggering exclusion of
  that one dimension from the calibrated comparison while the other four
  still calibrate normally. This is the exact real-data-driven behavior the
  fix was designed to produce, confirmed by direct execution, not assumed.
- New tests added: default call is `UNCALIBRATED_PROTOTYPE` and says so;
  real-data-calibrated call is `REAL_DATA_CALIBRATED` with provenance
  (`n`, `asOfDate`); zero shared dimensions → `DATA_INSUFFICIENT`, never a
  fabricated score; exactly one shared dimension → `DATA_INSUFFICIENT`;
  differing Accumulation DNA types are reflected in
  `sameAccumulationDNAType: false`, never fabricated as a match; a
  deliberately different-scale synthetic pair (delivery 10 vs. 80, small
  volatility difference) produces a finite, non-crashing uncalibrated score
  labeled as a prototype; missing F&O/sector dimensions always carry a
  `reason` field.
- Real-data re-run: **2,938/2,950 real symbols** built a Signal DNA record,
  `12 DATA_INSUFFICIENT`, full dataset.

### 5. Signal DNA reproducibility — verified
- Same symbol + same asOfDate + same dataset → identical fingerprint,
  asserted directly in test (`dnaA.fingerprint === dnaB.fingerprint` for two
  independent calls).
- Full edge-case matrix added: missing dimensions, one shared dimension,
  zero shared dimensions, different DNA types, different scales, missing
  F&O data, missing sector data — see §4 above for each outcome.

### 6. Sector lookup — reported, not expanded
- **Mapped:** 5 symbols (verified by count of `sha256`-stable
  `js/companyDatabase.js`: CDSL, NEWGEN, TCS, and 2 others).
  **Unmapped:** 2,945 of the 2,950 real symbols in the actual dataset (i.e.
  99.8% of symbols have no sector dimension available).
- **Source:** `js/companyDatabase.js`, a browser file — accessed via a safe
  text-extraction helper (`sectorLookup.js`), never `require()`/`eval()`'d.
- **Historical/PIT limitation, newly disclosed this session:** that file's
  own header states its price fields were captured as a single dated
  snapshot (17-Jul-2026). Sector classification is far more stable than
  price, so using it for earlier historical dates is a much smaller risk
  than reusing the price data would be — but it is still technically a
  present-day snapshot being applied to any as-of date, and is now stated
  as such rather than left implicit. No sector value was invented for any
  unmapped symbol.

### 7. Real-data validation (full dataset, not a sample)
Run across **all 2,950 real symbols** and the **full 263-date** real
history, as of the latest available date (2026-09-04):

| Engine | Result |
|---|---|
| Accumulation DNA | 2,730 classified / 220 DATA_INSUFFICIENT |
| SOAI | 2,661 calculated / 289 DATA_INSUFFICIENT |
| False Accumulation Detector | 1,388 ACCUMULATION_LIKELY / 1,519 ACCUMULATION_UNCERTAIN / 31 FALSE_ACCUMULATION_RISK / 12 DATA_INSUFFICIENT |
| Signal DNA | 2,938 built / 12 DATA_INSUFFICIENT |

No synthetic data was used to produce these counts — every number above
comes from running the real engines against the real 263-session dataset.

### 8. Checksum safety
SHA-256 of every file in `backtest/lib/` was captured before this QC pass
and compared after:
- **Changed (expected, all documented above):** `soai.js`,
  `accumulationDNA.js`, `signalDNA.js`.
- **Unchanged (verified byte-identical):** every other file in `lib/`,
  including `falseAccumulationDetector.js`, `accumulationIntelligence.js`,
  `symbolSeries.js`, `sectorLookup.js`, `dataContract.js`,
  `staleDuplicateDetector.js`, `manifest.js`, `manifestIntegrity.js`,
  `corporateActions.js`, `validators.js`, `productionGate.js`,
  `hiddenGemsBacktest.js`, `detectionEvents.js`, `httpClient.js`,
  `dateNormalize.js`, `dateUtils.js`, `asm.js`, `engineAdapter.js`,
  `researchIntelligence.js`, `signalEventStore.js`. No unrelated engine was
  touched.

### 9. Test suite results (this session)
23 backtest test files (2 new engine test files carried no changes —
`accumulationIntelligence.test.js` untouched; QC edits landed in
`soai.test.js`, `accumulationDNA.test.js`, `falseAccumulationDetector.test.js`,
`signalDNA.test.js`). Run individually:

- **21 PASS**, including every QC-audited file with its new edge-case tests.
- **`downloaderResume.test.js` — PRE-EXISTING FAILURE** (manifest-isolation
  bug identified session 1, unrelated to this session's changes; confirmed
  again this session after reinstalling `node_modules`, same
  `265 !== 2` assertion failure against the real shared manifest).
- **`liveNetworkProbe.test.js` — NETWORK-DEPENDENT FAILURE** (expected;
  confirms the same `host_not_allowed` block as every prior session).

### Signal DNA calibration status
**Partially calibrated.** `compareSignalDNA()` supports real-data
calibration via `computePopulationStats()`, and 4 of 5 numeric dimensions
(price, volatility, delivery, SOAI) calibrate successfully against the real
dataset (n≥38 each). The 5th (F&O/OI) has genuinely insufficient real
samples (n=3 in the tested population) and is honestly excluded rather than
calibrated on too little evidence. Calling the function without population
stats remains supported and is explicitly labeled
`UNCALIBRATED_PROTOTYPE`. No weights were invented at any point.

### Historical Analogue Engine status
**NOT STARTED this session**, per the explicit QC-first instruction. The
Signal DNA foundation is now verified and audited; Historical Analogue
Engine (#6) is the next task and can proceed directly on top of
`compareSignalDNA`/`computePopulationStats` as they now stand.

### Remaining data dependencies (unchanged from session 2, restated for completeness)
- No bulk/block-deal disclosure data anywhere in this dataset.
- No promoter/insider disclosure data.
- No FII/DII/client OI-category breakdown (only aggregate OI/change_oi).
- Sector coverage is 5/2,950 symbols.
- No live NSE/niftyindices.com network access from this sandbox (unchanged;
  not re-tested this session since no new fetch was attempted).

## Exact next recommended task (unchanged from before this QC pass)

**Historical Analogue Engine (#6)**, built directly on the now-audited
`buildSignalDNA`/`compareSignalDNA`/`computePopulationStats`, looped across
the real 263 trading dates — no new data sourcing required.


---

# (Session 1 log preserved below, unchanged)

# VIKRAM Data Foundation — Checklist & Session Log

**Session date:** 12 Sep 2026
**Claude ID:** bhaveshthecoder1213@gmail.com
**Environment:** Claude.ai chat sandbox — egress allowlisted to npm/PyPI/GitHub/crates only.
`nseindia.com` and `niftyindices.com` are hard-blocked (`x-deny-reason: host_not_allowed`,
confirmed by direct `curl` test this session). **No new NSE data could be downloaded or
live-verified in this session.** Everything below was built or tested using only data and code
already present in the uploaded ZIP.

## What this session found already genuinely built (prior sessions)

- Real NSE CM+F&O data, **2025-09-02 → 2026-09-04, 263 trading sessions** (not Sep 2021 —
  see "Not done" below). `data/nse-coverage-report.json`.
- Manifest with SHA-256, download/validation status per date (`backtest/lib/manifest.js`).
- Row-level validators: delivery>volume, delivery% out of range, negative OI, missing
  columns, duplicate rows, trade-date mismatch (`backtest/lib/validators.js`).
- Point-in-time index-membership scaffolding that explicitly refuses to backfill from
  today's constituents (`server/src/pointInTimeUniverse.js`).
- Corporate-action heuristic discontinuity flagging, honestly labeled as unverified against
  a live source (`backtest/lib/corporateActions.js`).
- Real backtest (`backtest/REAL_1YEAR_BACKTEST_RESULT.json`), ASM, forward outcomes
  (1D/5D/20D/60D/120D with `INSUFFICIENT_FUTURE_DATA`), research-intelligence aggregation.

## Built and tested this session (new)

- [x] **Stale/duplicate trading-day detector** — `backtest/lib/staleDuplicateDetector.js`
  + `backtest/test/staleDuplicateDetector.test.js`. Cross-date payload hashing (excludes
  `trade_date` itself, order-independent) to catch a downloader re-serving one payload
  across multiple dates. Emits exactly the five required statuses
  (`VALID_TRADING_DAY` / `NOT_A_TRADING_DAY` / `SUSPICIOUS_STALE_DATA` /
  `DATA_INSUFFICIENT` / `VERIFICATION_BLOCKED`). Run against **all 263 real files**:
  **0 stale duplicates found** (genuine result, not asserted in the test as a fixed
  expectation — the test only asserts every file gets a valid status).
- [x] **Backtest Data Contract** — `backtest/lib/dataContract.js` +
  `backtest/test/dataContract.test.js`. Implements the exact 7 functions the assignment
  specifies (`getMarketData`, `getDeliveryData`, `getFuturesData`, `getOIData`,
  `getCorporateActions`, `getHistoricalUniverse`, `getTradingSession`) as a single clean
  layer over existing real data. Every function returns `VALID` / `DATA_N_A` /
  `DATA_INSUFFICIENT` / `VERIFICATION_BLOCKED` — never substitutes a nearby date, never
  fabricates a value. Tested against real repo data plus explicitly-labeled synthetic
  edge cases (unknown symbol, unknown date, weekend, PIT universe with no snapshots yet).
  `getHistoricalUniverse` returns `VERIFICATION_BLOCKED` today because no point-in-time
  index-membership snapshots have actually been persisted yet — this is correct, honest
  behavior, not a bug: fabricating historical membership would violate the no-look-ahead
  rule directly.
- [x] Wired both new test files into `backtest/package.json`'s `test` script.

## Test results (this session, run in this sandbox)

`cd backtest && npm install && npm test` (ran each file individually to get per-file
results, since one script runs them all in sequence):

| File | Result |
|---|---|
| validators.test.js | PASS |
| manifest.test.js | PASS |
| productionGate.test.js | PASS |
| backtestRunner.test.js | PASS |
| asm.test.js | PASS |
| signalEventStore.test.js | PASS |
| hiddenGemsBacktest.test.js | PASS |
| httpClient.test.js | PASS |
| dateNormalize.test.js | PASS |
| manifestIntegrity.test.js | PASS |
| corporateActions.test.js | PASS |
| detectionEvents.test.js | PASS |
| **staleDuplicateDetector.test.js (new)** | **PASS** |
| **dataContract.test.js (new)** | **PASS** |
| downloaderResume.test.js | **FAIL — PRE-EXISTING, newly exposed** (see below) |
| liveNetworkProbe.test.js | FAIL — NETWORK-DEPENDENT (expected; confirms the same `host_not_allowed` block reported above) |

**`downloaderResume.test.js` finding:** this test reads/asserts against the **real, shared**
`backtest/data/manifest.json` (265 real entries) instead of an isolated temp manifest, so its
assertion of "exactly 2 confirmed CM sessions" fails once the real manifest already has
production data in it (`265 !== 2`). This previously failed at `MODULE_NOT_FOUND` (missing
`csv-parse`/`unzipper`) before `npm install` was run this session, which masked this deeper
test-isolation bug. Not caused by anything in this session's changes — flagged for a future
session to fix (give the test its own temp manifest path).

`server/` tests were not touched or re-run this session (no server/ files were modified).

## Explicitly NOT done this session, and why

- **Extending coverage to Sept 2021** — requires downloading years of NSE bhavcopy/delivery/
  F&O archives. Blocked: no network path to NSE from this sandbox. `VERIFICATION BLOCKED`.
- **Live corporate-actions feed** — same network block. Heuristic-only flagging already
  existed and still stands; genuinely enabling this needs live NSE access.
- **Real point-in-time index membership history** — same. `getHistoricalUniverse` is fully
  built and tested but has zero real snapshot rows to serve until a live daily job runs.
- **Official NSE trading-holiday calendar** — deliberately not hand-typed from memory,
  because an unverifiable guessed holiday list is exactly what the assignment prohibits
  ("no guessed holidays"). `staleDuplicateDetector.js` only asserts `NOT_A_TRADING_DAY` for
  the one case that's objectively checkable without an external source: weekends.
- Items 5–33 of the full master feature list (Accumulation DNA, SOAI, False-Accumulation
  Detector, Signal DNA, Historical Analogue Engine, Market Regime, Sector Accumulation,
  Recommendation Engine/Lifecycle, Self-Scorecard, Research Lab, etc.) — **not started this
  session.** They are downstream of this data-foundation layer and are large enough that
  each genuinely warrants its own session rather than a shallow pass.

## Exact next recommended task

Pick up with **Accumulation DNA (#5)** or **Signal DNA (#8)**, both of which can now be built
directly on top of `backtest/lib/dataContract.js` (use its functions rather than reading
`data/market-history/*.json` directly, to inherit the same honesty guarantees) and the real
263-session dataset already available — no network access required for a first real
implementation. Alternatively, fix the `downloaderResume.test.js` isolation bug found above.
