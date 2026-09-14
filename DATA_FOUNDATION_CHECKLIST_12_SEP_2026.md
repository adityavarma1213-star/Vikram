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
