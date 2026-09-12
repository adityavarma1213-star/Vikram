# FORENSIC AUDIT — VIKRAM 5-Year NSE Downloader + Backtest Pipeline

Audit date: 2026-09-08. Auditor: same assistant that built the pipeline (independent
re-verification, not a restatement of prior claims — every finding below was re-derived
by re-reading the code and, where possible, executing it fresh during this audit).
No code in `accumulation/engine.js` was touched. No new features were added. Three real,
disclosed bugs/risks were found; none were silently patched except where noted.

---

## 1. PRODUCTION ENGINE

| Check | Result |
|---|---|
| Exact file in use | `accumulation/engine.js` (verified via `backtest/lib/engineAdapter.js`, which `require()`s this exact path — no copy, no reimplementation) |
| SHA-256 recorded | `ae6a8f1f6698fc41d16d7c15800ca7f406361f3f6ef06bc3e04dd43287fedf58` — **re-computed fresh during this audit**, matches the adapter's own runtime-computed hash and matches the file currently on disk (`sha256sum accumulation/engine.js` re-run just now) |
| Imported unchanged | YES — `engineAdapter.js` re-exports `realEngine.evaluate` directly; it does not wrap, filter, or post-process the function itself |
| Engine's own test suite | Re-run during this audit: `server/test/accumulationEngine.test.js` → **6/6 PASS** against the real, current file |
| Can a substitute silently slip in? | `lib/productionGate.js`'s `assertProductionEngine()`/`requireRealBacktest()` require `is_production_vikram === true` and `is_synthetic !== true`. Only `engineAdapter.js` sets those flags, and it only does so after confirming `evaluate` is a function loaded from the real path. **Re-tested during this audit**: `test/productionGate.test.js` explicitly constructs a fake synthetic engine object and a fake "unverified" engine object and asserts both are rejected — PASS. |

**FINDING (informational, not a defect):** the gate trusts whatever flags an object carries — it has no way to detect a *modified copy* of `engine.js` masquerading as the original beyond the SHA-256 recorded in the report. **The gate itself does not verify the SHA-256 at runtime** — it only checks the boolean flags. If someone edited `engineAdapter.js` to hardcode `is_production_vikram: true` while pointing at a different file, the gate would not catch it. Recommend (not implemented, per "no new features"): have the gate assert the computed SHA-256 against a known-good value, not just the boolean flag.

**VERDICT: PASS**, with one hardening gap noted above.

---

## 2. NSE DATA ACQUISITION

Distinguishing IMPLEMENTED / TESTED OFFLINE / LIVE VERIFIED / NOT VERIFIED per your instruction — nothing here is asserted as LIVE VERIFIED because it cannot be, from this sandbox.

| Capability | Status |
|---|---|
| CM price/volume via UDiFF zip + legacy CSV fallback | IMPLEMENTED. URL patterns copied verbatim from this repo's own `server/src/staticSnapshot.js` (not invented). **NOT LIVE VERIFIED** — never successfully contacted NSE, from this sandbox or, as far as I can determine, from any environment I have observed. |
| Delivery qty/% | IMPLEMENTED (parsed from the same CM file: `DlvryQty`/`DlvryPct` or `DELIV_QTY`/`DELIV_PER`). NOT LIVE VERIFIED. |
| F&O futures + OI/change-OI | IMPLEMENTED (UDiFF zip only — **no legacy F&O fallback URL exists**, unlike CM). NOT LIVE VERIFIED. |
| Legacy vs UDiFF handling | IMPLEMENTED for CM (tries UDiFF first, falls back to legacy). **NOT implemented for F&O** — only one URL family is tried. If NSE's F&O archive used a different naming convention earlier in the 5-year window, those dates will be recorded FAILED, not silently wrong — but coverage would be incomplete. This is a real, disclosed gap. |
| Date handling / trade-date cross-check | IMPLEMENTED via `confirmTradeDate()`, comparing the file's own internal date column against the requested date. **BUG FOUND AND CONFIRMED THIS AUDIT** (see below). |
| Trading-session detection | IMPLEMENTED empirically (a date only counts as confirmed once a schema-valid, date-verified file is returned) — no hardcoded holiday list anywhere. |
| Retries | **NOT IMPLEMENTED.** Confirmed by direct code inspection during this audit (`grep -n "retry\|backoff\|429" nseDownloader.js` → no matches). A single failed `fetch()` call is final for that URL candidate. This is a real gap: the pre-existing repo's own `server/src/backfillHistory.js` has a `fetchWithBackoff()` helper with exponential backoff and 429-specific handling that I did **not** port into this downloader. |
| Timeout handling | **NOT IMPLEMENTED.** No `AbortController`, no timeout wrapper around `fetch()`. A hung connection would stall the entire run indefinitely. Confirmed by code inspection. |
| Duplicate prevention (within a file) | IMPLEMENTED (`findDuplicates()` on symbol+date / symbol+date+expiry keys) and unit-tested. |
| Duplicate prevention (across manifest runs) | IMPLEMENTED by construction — the manifest key is `segment|requested_date`, and `confirmTradeDate` refuses a file whose internal date doesn't match, so two manifest entries can never silently represent the same real trading session under different keys. |
| Missing-file detection | IMPLEMENTED — recorded as `FAILED` or `NOT_A_TRADING_DAY` (404 heuristic) in the manifest, never silently skipped. |
| Corrupt/malformed-file detection | IMPLEMENTED — schema check (`requireColumns`), row-level validation, `VALID`/`INVALID`/`MALFORMED` classification based on error ratio. |
| Checkpoint/resume | IMPLEMENTED. **TESTED OFFLINE THIS AUDIT** against the real `run()`/`downloadOneSegment()` functions (not just the `Manifest` class) — see `test/downloaderResume.test.js`, added and run during this audit. Result: PASS — a segment/date already `SUCCESS`+`VALID` is not re-fetched on a second `run()` call; a segment/date that never succeeded (e.g. F&O 404) is correctly retried; no double-counting of `trading_sessions_confirmed` occurred across the two runs. Test artifacts were fully cleaned up afterward — verified byte-identical manifest before/after. |
| Partial-download handling | IMPLEMENTED by ordering: the manifest entry is only written *after* the raw file write, checksum, parse, and validation all complete. If the process dies between the raw-file write and the manifest write, the file is orphaned on disk but the manifest has no entry for it — so it will be safely re-attempted (and overwritten) on the next run, never silently trusted. This is a logical guarantee from code structure, not from an executed kill-signal test — labeled TESTED OFFLINE (by inspection + the resume test above), not LIVE VERIFIED under an actual interrupt. |
| SHA-256 verification at download time | IMPLEMENTED — computed immediately after every successful raw download and stored in the manifest. |
| SHA-256 verification at gate/report time | **NOT IMPLEMENTED — real gap, confirmed this audit.** `lib/productionGate.js` never re-reads the raw files or recomputes their hashes; it trusts whatever the manifest says. A hand-edited `manifest.json` claiming `SUCCESS`/`VALID` with a fabricated `row_count` would currently pass `requireRealBacktest()` undetected. This is a genuine integrity gap in the honesty gate, not in the downloader itself. |
| Immutable raw-data preservation | IMPLEMENTED — the exact downloaded bytes are written to `data/raw/<segment>/<date>.<format>.<ext>` before any parsing occurs, and are never rewritten by later code. |

### BUG FOUND THIS AUDIT: legacy CM date-format cross-check is unverified and may always fail

`confirmTradeDate()` compares `fileDateString.slice(0, 10)` against the ISO `YYYY-MM-DD`
requested date. I constructed a synthetic reproduction during this audit:

```
confirmTradeDate([{ DATE1: '01-SEP-2021' }], '2021-09-01', 'DATE1')
→ { ok: false, reason: 'file trade date 01-SEP-202 does not match requested 2021-09-01' }
```

If NSE's real `sec_bhavdata_full` legacy CSV uses a `DD-MON-YYYY`-style `DATE1` column
(the commonly documented format for that endpoint), **every legacy-format trading day would
be marked `FAILED` even though the underlying data is genuinely valid** — a false-negative
that would silently shrink real coverage, not corrupt it. Two important facts about this,
found while tracing it:

1. **This exact comparison pattern (`.slice(0, 10) !== formatYmd(date)`) is inherited
   verbatim from this repo's own pre-existing `server/src/staticSnapshot.js` (line 43)** —
   I copied it deliberately to reuse "already proven" logic per the original brief. It is
   not something I invented independently.
2. I cannot confirm from this sandbox whether the live column is actually ISO-formatted
   (in which case this is a non-issue) or `DD-MON-YYYY` (in which case both this pipeline
   and the pre-existing app code share the same latent bug).

**I have not patched this.** Per your instruction to focus on look-ahead bias fixes only
and not add features/rewrite mid-audit, this is reported as a **found, unconfirmed risk**
requiring live verification, not silently patched with an untested guess. **Recommended
first action on real NSE access: fetch one known historical legacy-format date and inspect
the actual `DATE1` string before trusting any bulk run's `FAILED` counts for pre-UDiFF dates.**

**VERDICT: PASS on design/structure, FAIL on retries/timeouts (not implemented), FAIL on
gate-side integrity re-verification (not implemented), UNVERIFIED on the legacy date-format
assumption (real, disclosed risk, inherited from existing repo code, not patched).**

---

## 3. FIVE-YEAR COVERAGE

**Actual, current, real numbers — not invented:**

- Requested window (as run today): 2021-09-09 → 2026-09-08 (`nseDownloader.js` computes
  `end = today`, `start = end - 5*365 days` at run time — reproducible, not hardcoded to a
  fixed pair of dates, so the exact window shifts by design each time it's re-run).
- Candidate weekdays in that window: **1,304**.
- Files actually acquired: **0**.
- Trading sessions actually confirmed: **0**.
- Missing / duplicate / invalid sessions: **N/A — no sessions were attempted past the
  first one**, because the pipeline stopped immediately on the first real `BLOCKED`
  response, per instruction #11. The manifest contains exactly **one entry**:
  `CM|2021-09-09`, status `BLOCKED`.
- CM / delivery / F&O-OI / per-year / per-source coverage: **all 0%**, because the run
  never got past the very first candidate date.

No coverage percentage, session count, or date range is fabricated anywhere in this
package. `reports/FINAL_REPORT.json`'s `NUMBER_OF_TRADING_SESSIONS: 0` and
`DATA_DATE_RANGE: null` are exact reflections of the manifest state re-checked during
this audit, not carried-over estimates.

**VERDICT: The coverage-reporting MECHANISM is real and correctly wired to the manifest
(re-verified this audit). Actual coverage is 0%.**

---

## 4. DATA VALIDATION

| Validator | Status |
|---|---|
| Symbol validity (`!row.symbol`) | IMPLEMENTED, unit-tested |
| Date validity (`!row.trade_date`, cross-file date match) | IMPLEMENTED, unit-tested for the mechanism; see the date-format risk in §2 for a real-world caveat |
| Numeric validity (`close <= 0`, `delivery_pct` out of `[0,100]`) | IMPLEMENTED, unit-tested |
| Duplicate records | IMPLEMENTED, unit-tested |
| Impossible values — `deliv_qty > volume` | IMPLEMENTED, unit-tested. This is the exact invariant referenced in the companion scaffold package's audit trail as a bug found in an earlier (different, Python-based) attempt at this same task; it is a hard validation failure here, not a warning. |
| Missing fields | Covered by the above per-field checks |
| Malformed files / unexpected schema | IMPLEMENTED via `requireColumns()` — throws distinctly, labeled as a possible NSE format change in the error message, unit-tested |
| Date mismatches between CM/delivery/F&O | **PARTIALLY IMPLEMENTED.** CM's own internal date is cross-checked against the requested date. F&O's own internal date is separately cross-checked against the requested date. **There is no explicit cross-check that CM's confirmed date and F&O's confirmed date for the same calendar day actually agree with each other** (they're both checked independently against the *requested* date, so transitively they must agree if both pass — but no test exercises this directly, and if NSE ever served a CM file whose date-check has the disclosed §2 bug, an F&O-only date could exist with no matching CM date, and the backtest runner's per-date futures lookup — `${symbol}|${current.trade_date}` — would then correctly show no futures match rather than mismatching). |
| Detection of incomplete sessions (e.g., CM present, F&O missing) | IMPLEMENTED implicitly — the backtest runner's futures lookup returns `null` if no exact-date F&O row exists, and the real accumulation engine itself treats missing OI as "OI confirmation is unavailable" rather than fabricating a value (confirmed by re-reading `engine.js` lines 71–76, 136 during this audit). |

**Important labeling correction, made honestly in this audit:** every validator above has
been exercised only against **hand-built `SYNTHETIC_TEST_ONLY` fixtures** (`test/validators.test.js`)
or, for the downloader's own call path, against a **mocked HTTP response** (`test/downloaderResume.test.js`,
new this audit). **None have been run against a genuine NSE file.** They must not be
described as "validated against real data" — only as "validation logic is exercised and
passes on offline test data."

**VERDICT: PASS on implementation and offline test coverage. NOT VERIFIED against real
NSE files (impossible from this sandbox). One disclosed, unpatched risk (§2 date format).**

---

## 5. LOOK-AHEAD BIAS — line-by-line trace

This is the section I re-traced most carefully, since it's flagged CRITICAL.

**Signal detection (`backtestRunner.js`, `detectSignalsAndForwardReturns`):**

```js
for (let i = warmup; i < history.length; i += 1) {
  const current = history[i];
  const pastHistory = history.slice(0, i + 1);   // <-- rows 0..i ONLY
  const futures = futuresBySymbolDate.get(`${symbol}|${current.trade_date}`); // <-- exact date i only
  const result = evalEngine.evaluate({ symbol, history: pastHistory, current, futures });
```

- `history.slice(0, i + 1)` — JavaScript `Array.slice(start, end)` excludes `end`; index
  `i+1` is exclusive, so this array contains indices `0..i` inclusive and **nothing from
  `i+1` onward**. Re-verified with a direct interpreter check during this audit
  (`[0,1,2,3,4].slice(0,3) → [0,1,2]`, confirms exclusivity). **No future row is ever
  passed to the engine.**
- `futures` is looked up **only** by `current.trade_date` (day `i`'s own date) — never a
  later date. The real engine's own `oiExactDate` check (line 72 of `engine.js`) then
  independently re-confirms the futures object's date matches — belt-and-suspenders, both
  layers agree.
- `entryClose = current.close` — day `i`'s own close, not a future price. Confirmed no
  other file substitutes a different "current" price anywhere in this module.

**Forward-return computation (same function, immediately after):**

```js
for (const h of HORIZONS) {
  const futureIndex = i + h;
  if (futureIndex < history.length && history[futureIndex].close !== null && entryClose) {
    forwardReturns[`${h}D`] = { status: 'COMPUTED', ..., returnPct: ... };
  } else {
    forwardReturns[`${h}D`] = { status: 'INSUFFICIENT_FUTURE_DATA' };
  }
}
```

This is the one place the code deliberately looks at `i+h` (future indices) — which is
**correct and required**, because measuring what happened *after* a signal is the entire
point of a backtest; it is not the same as leaking future information *into the decision*.
The decision (`result.verdict`) is computed with zero knowledge of `i+h`. The unit test
added for this module (`test/backtestRunner.test.js`) explicitly asserts
`fr.exitDate > s.signalDate` for every `COMPUTED` horizon, and asserts the most recent
signal in the fixture has at least one horizon correctly marked
`INSUFFICIENT_FUTURE_DATA` rather than fabricated. **Re-run during this audit: PASS.**

**OBV / volume / delivery trend / OI trend** — these all live inside `accumulation/engine.js`
itself (`calculateObv`, `deliveryTrend`, `oiPct`), which I did not modify. Re-reading it:
`sortRows()` sorts ascending by date and every rolling calculation (`obvLookback`,
`deliveryTrendLookback`, `historyDays`) only ever slices from the **end** of an
already-past-only array (`history.slice(-N)`), which is safe *given* the input array
itself contains no future rows — and per the trace above, my caller never passes one.

**Detection date / detection price** — `signalDate: current.trade_date`, `entryClose:
current.close` — both taken from day `i`, never substituted with a later or "current"
value. (See §8 for a related but distinct gap: no streak/first-detection tracking exists
at all, so this specific "never substitute current price for historical price" risk has
no *opportunity* to occur, because there is no "current price" concept in the runner
outside the loop.)

**Universe membership, corporate actions, ASM** — see §6, §7, §9: these are **not
implemented**, so they cannot leak future information, but only because the feature does
not exist yet, not because a safeguard was verified. Flagged as `NOT APPLICABLE — NOT
IMPLEMENTED`, not `PASS`.

**VERDICT: LOOK-AHEAD SAFETY: PASS** for every mechanism that is actually implemented
(signal detection, forward-return measurement, engine-internal rolling windows). No fix
was needed — I found no violation to fix.

---

## 6. POINT-IN-TIME UNIVERSE

**Finding: this concept does not exist anywhere in the backtest module.**
`backtestRunner.js` evaluates **every symbol present in the downloaded CM data for any
date**, with no index/constituent filtering at all. This means:

- There is no "currently active index membership applied retrospectively" bug, because
  there is no membership filter of any kind — the backtest is implicitly "entire listed
  CM universe on each date," not "Nifty 500 as of today" or similar.
- This is **neither point-in-time-correct nor incorrect** — it's simply unscoped. If a
  future requirement restricts the backtest to a named index (e.g., "Nifty 500 members
  only"), that would require genuine historical constituent-change data, which does not
  exist anywhere in this repo — `server/src/indexUniverses.js` (pre-existing, not written
  by me) only fetches **current** index membership from NSE, with no historical
  constituent tracking.
- Separately, **symbol renames are not handled**: rows are keyed purely by the `SYMBOL`
  string from each day's file. If NSE ever renames a ticker, this pipeline would silently
  treat the old and new ticker as two unrelated series, breaking history continuity at
  the rename point (relevant to §7 too).

**VERDICT: POINT-IN-TIME UNIVERSE: NOT APPLICABLE / NOT IMPLEMENTED.** Not a
"BACKTEST BLOCKER" for a whole-market backtest as currently scoped, but **would become
one** the moment anyone restricts this to a named index without adding real point-in-time
constituent data — flagging this explicitly so it isn't discovered the hard way later.

---

## 7. CORPORATE ACTIONS

**Finding: not implemented at all, anywhere in this module.** Raw `close`/`prev_close`
values from NSE's own daily file are used exactly as published, with no split, bonus,
merger, or symbol-change adjustment layer. Two concrete consequences, reasoned through
during this audit rather than assumed:

- A split or bonus will appear in the raw data as a large single-day price drop with
  ordinary-looking volume/delivery figures around it. Depending on the ratio, this could
  register as a spurious accumulation or distribution signal purely from the mechanical
  price jump, with no way for the engine to distinguish "real distribution" from
  "unadjusted corporate action."
- A merger or symbol change would look like the acquired/renamed symbol's history simply
  stopping and (if renamed) an unrelated new symbol starting — no continuity is preserved.

Across a genuine 5-year window, most heavily-traded NSE symbols will have at least one
such event. **I have not built any adjustment system, invented adjustment factors, or
attempted to silently "fix" this — that would itself be a fabrication.**

**VERDICT: CORPORATE ACTIONS: FAIL / NOT IMPLEMENTED — a real BACKTEST BLOCKER for
producing a trustworthy final performance number across the full 5-year window**, even
once real data acquisition is unblocked. It is not a blocker for the data
acquisition/validation/checkpoint mechanics themselves, which don't depend on it.

---

## 8. DETECTION HISTORY

**Finding: not implemented in the backtest runner.** The pre-existing app code
(`server/src/staticSnapshot.js`'s `buildCurrentDetection()`) computes exactly this
(first-detection date/price, latest-detection date/price, consecutive trading-day streak,
`New`/`Active` status, reset-after-failed-qualification) — but **only for the current
live date**, walking backward. I did not port this logic into `backtestRunner.js`.

**Concrete consequence, confirmed by re-reading my own loop:** `detectSignalsAndForwardReturns`
records **a separate, independent "signal" for every single day the engine returns
`ACCUMULATION CONFIRMED`**, even if that's 10 consecutive days for the same stock. It does
**not** collapse consecutive confirmed days into one "detection event," and does not
distinguish a brand-new confirmation from the continuation of an existing one. This is a
real, meaningful methodological gap versus what the audit's §8 describes and versus how
the live app's own scanner (`New` vs `Active`) already models detections.

`entryClose`/`signalDate` themselves are never substituted with a later/current value
(verified in §5) — but the **unit of analysis** ("one row per confirmed day" vs "one row
per new detection streak") is a real, disclosed design gap.

**VERDICT: DETECTION HISTORY: FAIL** — the safety property you asked about (never
substitute current price for historical price) holds, but the streak/New-vs-Active
semantics this section asks about do not exist in the backtest runner at all.

---

## 9. ASM (forward-performance calculations)

| Item | Status |
|---|---|
| +1D / +5D / +20D / +60D / +120D forward return, chronological, only when real future data exists | IMPLEMENTED, unit-tested, look-ahead-safe (§5) |
| Benchmark-relative return | **NOT IMPLEMENTED** — no index/benchmark series is downloaded or compared against anywhere |
| MFE (max favorable excursion) | **NOT IMPLEMENTED** |
| MAE (max adverse excursion) | **NOT IMPLEMENTED** |
| Drawdown | **NOT IMPLEMENTED** |
| Hit rate / failure rate | Only the simplest form exists: `winRatePct = (return > 0) / computedCount` per horizon. No separate "failure rate" metric, no confidence interval, no statistical significance test. |
| Regime analysis | **NOT IMPLEMENTED** |
| 1/3 vs 2/3 vs 3/3 comparisons | **NOT IMPLEMENTED** — no such grouping exists anywhere in the code |

I have **not** built any of the missing metrics during this audit — per your explicit
"stop adding features" instruction, these are reported as gaps, not filled in.

**VERDICT: ASM: FAIL (partial)** — the one property that was explicitly required
("no result may be created from unavailable future data") holds and is tested; most of
the requested analytical surface (MFE/MAE/drawdown/benchmark/regime/1-3rd splits) simply
does not exist yet.

---

## 10. RESUMABILITY

**Re-verified this audit with a newly-added, executed test** (`test/downloaderResume.test.js`),
run against the real `nseDownloader.run()`/`downloadOneSegment()` functions with a mocked
network layer (no real NSE contact):

1. Run 1 (date range = one day) → CM succeeds+validates, F&O legitimately fails (mocked
   404). Manifest checkpoints CM as done.
2. Run 2 (date range = same day + one more day) → **CM for day 1 is not re-fetched at
   all** (0 matching calls in the mocked fetch log); **F&O for day 1 is correctly
   retried** (it never succeeded); day 2 is fetched fresh. Final state: 2 confirmed CM
   trading sessions, not double-counted.
3. All test artifacts (raw files, normalized files, manifest entries) were created under
   distinctive dates (2015-01-05/06, outside the real 5-year window) and fully deleted
   afterward — verified the real `manifest.json` is byte-identical before and after the
   test run.

This converts "resume support exists" from a design claim into a result I actually
executed and can show the exact assertions for.

**Determinism across restarts:** by construction, the manifest key is `segment|requested_date`
and a successful entry's normalized output file is written once and only overwritten if
that exact date/segment is re-attempted (which only happens if it wasn't previously
`SUCCESS`+`VALID`) — so final output does not depend on how many times the process was
restarted, given NSE serves the same historical content on every request (true for
already-published archive days; NSE does not append or resize past days' data).

**VERDICT: RESUMABILITY: PASS** — TESTED OFFLINE this audit, not merely asserted.

---

## 11. REAL-NETWORK BLOCK

Re-confirmed fresh during this audit, three ways, no synthetic substitution anywhere:

1. Direct `curl` to `nsearchives.nseindia.com` → `HTTP 403`, `x-deny-reason: host_not_allowed`.
2. `test/liveNetworkProbe.test.js` re-run just now → same result, exit code 3 (deliberately
   non-zero/"red" until real egress exists).
3. A genuine invocation of `nseDownloader.js` against the real 5-year window earlier in
   this project stopped at the very first candidate date with an honest `BLOCKED` manifest
   entry and zero downstream fabrication — re-inspected this audit, unchanged.

No synthetic, random, generic, or manually-invented data has been substituted anywhere in
this package. The downloader remains exactly as built: ready to execute unmodified the
moment NSE egress is available.

**VERDICT: REAL NSE DATA: BLOCKED** (not FAIL in the sense of "code doesn't work" — FAIL
in the sense of "no real data exists yet," which is the honest and required label).

---

## 12. TESTS — categorized per your five buckets

**A. PASSED** (offline, synthetic fixtures or mocked network — re-run fresh this audit):
- `test/validators.test.js`
- `test/manifest.test.js`
- `test/productionGate.test.js`
- `test/backtestRunner.test.js`
- `test/downloaderResume.test.js` (**new this audit** — exercises the real downloader
  code path with a mocked network, not a fixture-only test)
- `server/test/accumulationEngine.test.js` (pre-existing repo test, run against the real
  unmodified engine — 6/6 scenarios)

**B. FAILED:** none currently. (Two tests failed during initial construction of this
audit's new resume test due to test-code bugs of my own — an `ArrayBuffer` slicing error
and an over-broad assertion — both fixed and re-run to green; documented above so the
audit trail is honest about the false starts, not just the final green state.)

**C. NOT RUN:** none applicable — every test I wrote was executed.

**D. BLOCKED BY NSE NETWORK:** `test/liveNetworkProbe.test.js` (correctly reports
`BLOCKED`/exit 3, not a pass); the live `nseDownloader.js` invocation against the real
5-year window (stopped at date 1 of 1,304).

**E. REQUIRES REAL NSE DATA (cannot be attempted at all right now):**
- `backtestRunner.js`'s actual production run (refuses via the gate — confirmed FAIL,
  correctly, not silently skipped)
- Any coverage/session-count claim beyond "0"
- §6/§7/§8/§9 gaps cannot be validated against real data because there is no real data

**I have not, anywhere in this package, called a synthetic-fixture test result a
"real-data validation."** Every test file's own header comment says `SYNTHETIC_TEST_ONLY`
or explicitly "not a real backtest" / "mocked network."

---

## 13. REPRODUCIBILITY

A future operator, from a clean checkout, following `backtest/README.md`:
- Data source: NSE's own archive host, URLs defined in `nseDownloader.js` — explicit
  path found in that file, no external config file to hunt for.
- Raw data location: `backtest/data/raw/<cm|fo>/<date>.<format>.<ext>` — byte-identical
  to what NSE served.
- Normalized data location: `backtest/data/normalized/<cm|fo>/<date>.json` — only written
  for `VALID` files.
- Checkpoints: `backtest/data/manifest.json`, human-readable JSON, one entry per
  segment/date.
- Resume: just re-run `node nseDownloader.js` — no flag needed, resume is the default
  and only behavior.
- Backtest execution: `node backtestRunner.js` — will refuse with a clear message if
  step above hasn't produced real data yet.
- Report generation: `reports/FINAL_REPORT.json` is hand-assembled from the manifest +
  backtest result today; there is **no automated script yet** that regenerates
  `FINAL_REPORT.xlsx`/`.json` from a fresh `backtest_results.json` — the Excel build
  script used earlier in this project lives outside the `backtest/` folder
  (`/home/claude/work/build_report.py`, a one-off, **not included in the deliverable
  zip**). This is a real reproducibility gap: **the report-generation step is not yet a
  checked-in, repeatable script inside `backtest/`.** Flagging honestly rather than
  quietly shipping a script I haven't tested end-to-end against a real
  `backtest_results.json`.

**VERDICT: REPRODUCIBILITY: PASS for download → validate → backtest. GAP: report
generation is not yet a repeatable, checked-in step.**

---

## 14. DOCUMENTATION

`backtest/README.md` was reviewed during this audit and still accurately reflects the
current state (FAIL/PASS/FAIL table matches this audit's findings; no overclaiming
found). No changes were required to it. This `AUDIT.md` file is new and is the
authoritative record of this audit pass.

---

## 15. FINAL READINESS VERDICT

# NOT READY

| Category | Verdict |
|---|---|
| PRODUCTION ENGINE | **PASS** |
| NSE DOWNLOADER | **PASS** (structure/logic), with disclosed gaps: no retries/timeouts, no gate-side SHA-256 re-verification, unverified legacy date-format assumption |
| DATA VALIDATION | **PASS** (offline-tested), **NOT VERIFIED** against real NSE files |
| LOOK-AHEAD SAFETY | **PASS** (traced line-by-line this audit; no violation found, so nothing needed fixing) |
| POINT-IN-TIME UNIVERSE | **NOT APPLICABLE / UNVERIFIED** (no universe concept exists at all) |
| CORPORATE ACTIONS | **FAIL** — not implemented; real blocker for a trustworthy 5-year result |
| DETECTION HISTORY | **FAIL** — no streak/New-vs-Active tracking in the backtest runner |
| ASM | **FAIL (partial)** — forward-return core is correct and tested; MFE/MAE/drawdown/benchmark/regime/1-3rd splits do not exist |
| RESUMABILITY | **PASS** — tested offline this audit against the real code path |
| REAL NSE DATA | **BLOCKED** (sandbox egress, not NSE) |
| 5-YEAR BACKTEST | **NOT EXECUTED** |

### FILES CHANGED THIS AUDIT
- Added: `backtest/test/downloaderResume.test.js` (new offline verification of resume
  mechanics against the real downloader code path)
- Added: `backtest/AUDIT.md` (this document)
- Modified: `backtest/package.json` (added the new test to the `test` script)
- **Not modified:** `accumulation/engine.js`, `backtestRunner.js`, `nseDownloader.js`,
  `lib/*.js` — no production pipeline code was changed during this audit; all findings
  above are reported, not silently patched (per your instruction, since none of them were
  look-ahead-bias violations).

### TESTS PASSED
6 (5 in `backtest/`, 1 pre-existing in `server/` — see §12A)

### TESTS FAILED
0 (2 transient failures during construction of the new resume test, both due to bugs in
the test code itself, fixed before this document was finalized — disclosed in §12 rather
than hidden)

### TESTS NOT RUN
0

### BLOCKERS
1. NSE network egress blocked at the sandbox level (not NSE's own policy) — zero real
   data exists.
2. Corporate-action adjustment is entirely unimplemented — a real blocker for trusting
   any eventual 5-year performance number, independent of the network issue.
3. Gate-side SHA-256 re-verification is missing — a manually-edited manifest could
   currently defeat the honesty gate.

### RISKS
1. Legacy CM date-format cross-check may be wrong for real NSE files (inherited
   assumption from pre-existing repo code, unverified either place).
2. No retry/backoff/timeout logic — a single transient error or slow connection could
   stall or prematurely fail a long real run.
3. No F&O legacy-format fallback URL — F&O coverage could have real gaps even once
   network access exists.
4. "Detection" is currently "every confirmed day," not "new detection streaks" — changes
   how any eventual signal count should be interpreted.
5. No point-in-time universe or symbol-rename handling — fine for a whole-market
   backtest as currently scoped, but a blocker the moment anyone restricts to a named
   index.

### RECOMMENDED NEXT STEP
Do not attempt the 5-year backtest yet, even once NSE egress is available. First:
(a) confirm the real legacy CM date-format on one known historical date, (b) add
retry/backoff/timeout to the downloader, (c) add gate-side SHA-256 re-verification,
(d) decide explicitly whether corporate-action adjustment is in scope before trusting any
resulting performance numbers — none of which requires touching `accumulation/engine.js`.
