# NSE Acquisition Removal — Forensic Report

**Audit date:** 2026-10-24  
**Audited base commit:** `f2a8a4fb67d5a80049c0fe40996a4aa68dc1956f` (`origin/main`)  
**Work branch (local only, not pushed):** `chore/nse-acquisition-final-audit`  
**Auditor access:** read-only clone of the public repository + public GitHub REST API (unauthenticated, rate-limited). No GitHub login, no Render access.

## 1. Verdict

**PARTIALLY COMPLETE**

- **Verified (repository, `main` + this branch):** no executable code that downloads, requests, scrapes or ingests data from NSE was found. No frontend control starts one. No backend route starts one. No workflow, Render cron or package script schedules one.
- **Why not "VERIFIED COMPLETE":**
  1. Live Render, external schedulers and live GitHub settings could not be fully verified (Section 8).
  2. Ten GitHub pull-request refs still contain old acquisition code and `schedule:` workflows (Section 5b).
  3. One branch (`fix/live-data-website-integration`) has a leftover, non-functional `main()` (Section 6).
  4. Four DB-backed tests could not run (Section 7).
  5. The continuation changes (Section 11) are committed locally and exported as patches. They are **not pushed** (no authorized write access in this session).

## 2. Scope and limits
- In scope: executable acquisition code, active acquisition configuration, acquisition UI, operator docs, acquisition-only dependencies.
- Out of scope (retained on purpose): stored datasets in `data/`, provenance and audit reports, the "Download Existing Dataset" feature, read-only ingestion history, frozen V15 files.
- Stored NSE-sourced data under `data/` is still published. That is a separate decision (also noted in `docs/NSE_ACQUISITION_REMOVED.md`).
- No NSE request of any kind was made. All tests are offline.

## 3. What changed

### 3a. Removed in earlier commits (already absent when this audit began)
All dated 2026-10-24 on `main`; see `git log origin/main`. Key evidence:

| Item | Evidence |
|---|---|
| `backtest/nseDownloader.js` deleted | `71dd4bb` |
| `tools/vikram-lite-downloader.js` deleted | `1fa1e9d` |
| `backtest/lib/httpClient.js` deleted | `d451baa` |
| Render cron `vikram-eod-ingestion` removed from `render.yaml` | `6c5dc284d9467cd6c3104e8244de01303a2cc705` (exists, is an ancestor of `origin/main`); `render.yaml` on `main` has one web service and one database, 0 cron entries |
| `static-scanner.yml` scheduled NSE job replaced by static deploy | on `main` no `schedule:` in any of 7 workflows; steps only checkout, configure-pages, upload, deploy |
| `POST /api/admin/ingest/run` and "Acquire" button removed | `server/src/index.js:190-191` (comment + read-only `GET /api/admin/ingestion-runs`); `js/nseData.js:123`; `nse-data.html:83` |
| Acquisition functions removed from mixed files | `server/src/ingest.js:2-5`, `server/src/staticSnapshot.js:1-5`, `server/src/backfillHistory.js:3-8` (comments record the removed names) |
| Offline guard test added | `b34a24b` (`server/test/noDirectNseAcquisition.test.js`), CI step `71bd1ca` |

Full list: `docs/NSE_ACQUISITION_REMOVED.md`.

### 3b. Changed during this continuation (local commit; diff evidence: `git diff origin/main`)
| File | Previous status | Change | Reason | Verification |
|---|---|---|---|---|
| `docs/deployment/ORACLE_ALWAYS_FREE_BACKEND.md` | Told an operator to run `node src/migrate.js && node src/ingest.js`, gave a cron line `30 13 * * 1-5 … ingest.js`, said ingest "writes raw files to `data/raw-archive/`" and "the existing schedule in `render.yaml` is `30 13 * * 1-5`". All false now. | Rewritten (removed those lines; added "do not schedule acquisition"; removed unused `BACKFILL_CALENDAR_DAYS`) | Documentation that still instructs an operator to schedule ingestion | `noAcquisitionPaths.test.js` section 2 (mutation-tested) |
| `server/package.json`, `backtest/package.json`, both `package-lock.json` | `unzipper` declared. It has no use in source. It only unpacks NSE zip files. | Removed `unzipper` and its helper packages | Acquisition-only dependency | `npm ci` succeeds in both; `csv-parse`, `pg`, `express` still resolve; test run in Section 7 |
| `.github/workflows/v15-release-verification.yml` | "Dependencies resolve" step required `unzipper` | Dropped `unzipper` from the two lists (2 lines) | Otherwise CI would fail after the dependency removal | Same commands run locally, exit 0 |
| `server/test/noAcquisitionPaths.test.js` (new) | — | Added offline audit (deps, docs, route table, frontend fetch targets, call graph) | Detect reintroduction | Passes; fails when each of 3 patterns is re-added (mutation test run) |
| `server/package.json` test chain, `.github/workflows/accumulation-scanner.yml` | — | New test added to chain and as a CI step next to the existing guard | Run the new audit in CI | CI not run (not pushed) |

No other file changed. **No frozen V15 file changed.**

### 3c. Still present but non-executable / retained on purpose
| Item | Classification | Why safe |
|---|---|---|
| `server/src/ingest.js` (50 lines) | Mixed file, stub | Exports only `materializeScannerResults`, which reads rows already in the database. No HTTP client. Only tests import it. Not imported by `server/src/index.js` (call graph, Section 6) |
| `server/src/backfillHistory.js` (56 lines) | Offline integrity helper | Only `fs`/`path`. Exports `existingDates, needsRefresh, hasAllNullDelivery`. Only a test imports it |
| `server/src/staticSnapshot.js` (37 lines) | Parser/materializer | Only `fs`, `path`, `csv-parse`. Not reachable from the server entry point |
| `GET /api/admin/ingestion-runs` + history table on `nse-data.html` | Stored data, read-only, admin-gated | Reads a table; starts nothing |
| "Download all as ZIP" (`nse-data.html:107-112`) | Existing-dataset download | Serves files already in `data/market-history/` |
| `backtest/lib/nseHolidayCalendar.js:16` | Comment citing an NSE circular | Not code |
| `ITEM3_FIVE_YEAR_DATA_REPORT.md:135` ("Run `node backtest/nseDownloader.js`") | Historical report | The file was deleted (`71dd4bb`), so the command fails harmlessly. Left unchanged because it is audit evidence |
| `data/`, `VIKRAM DATA/`, provenance and coverage reports | Stored datasets / reports | Retained by policy |
| `CHECKSUMS.json` entries for `ingest.js`, `backfillHistory.js`, deleted downloader files | Stale old manifest | See Section 6 |

## 4. Previously present acquisition code (verified location)
Verified from Git history, not re-run: `backtest/nseDownloader.js`, `backtest/lib/httpClient.js`, `tools/vikram-lite-downloader.js` (deleted in the commits above); `ingestCm / ingestFo / runIncrementalIngest / runRangeBackfill` in `server/src/ingest.js`; `fetchCm / fetchFo / fetchUniverse / ingestLatest / writeHistory` in `server/src/staticSnapshot.js`; `fetchWithBackoff` in `server/src/backfillHistory.js`; `POST /api/admin/ingest/run` in `server/src/index.js`. They remain in Git history and in the pull-request refs in 5b. Nothing was erased from history.

## 5. Branch coverage

### 5a. All 18 remote branches and the tag
Columns: `ingest.js` lines · `backfillHistory.js` lines · network/NSE-like **code** lines in those two files (ingest/backfill) · workflow `schedule:` lines / Render `type: cron` lines.

| Branch | Head SHA | ingest.js | backfill | code hits | sched/cron | Finding |
|---|---|---|---|---|---|---|
| `origin/backend-oracle-forensic` | `df8a97e` | 44  | 56 | 0/0 | 0/0 | none found |
| `origin/backend-oracle-hardening` | `d3bb534` | 44  | 56 | 0/0 | 0/0 | none found |
| `origin/chore/verified-nse-validation` | `9396815` | 24  | 56 | 0/0 | 0/0 | none found |
| `origin/feat/integrate-gemini-backtest-pipeline` | `17722ef` | 38  | 56 | 0/0 | 0/0 | none found |
| `origin/feature/accumulation-scanner-phase0` | `3f45a85` | 24  | 0 | 0/0 | 0/0 | none found |
| `origin/fix/ci-install-server-deps` | `957ac2f` | 50 = main | 56 | 0/0 | 0/0 | ingest.js identical to main (stub) |
| `origin/fix/delivery-staleness-zero-detection` | `8e98168` | 66  | 56 | 0/0 | 0/0 | ingest.js:42-65 comments + unused lock constant/recordSystemRun; only materializeScannerResults exported; no HTTP client |
| `origin/fix/live-data-website-integration` | `5a41bd2` | 47  | 56 | 1/0 | 0/0 | LEFTOVER dead main() at ingest.js:38-45 calls undefined ingestCm/ingestFo (ReferenceError before any I/O); no HTTP client imported |
| `origin/fix/obv-missing-volume` | `517c1c3` | 44  | 56 | 0/0 | 0/0 | none found |
| `origin/main` | `f2a8a4f` | 50 = main | 56 | 0/0 | 0/0 | none found |
| `origin/merge/claude-backtest-2026-09-09` | `658d60b` | 38  | 56 | 0/0 | 0/0 | none found |
| `origin/protected-ui-baseline-2026-09-06` | `336f660` | 33  | 56 | 0/0 | 0/0 | none found |
| `origin/protected/pre-accumulation-ui-formula-change` | `34fb183` | 33  | 56 | 0/0 | 0/0 | none found |
| `origin/reconcile/master-full-2026-09-09` | `41d15e5` | 38  | 56 | 0/0 | 0/0 | none found |
| `origin/recovery/v15-pipeline-2026-10-03` | `6b1fc5a` | 44  | 56 | 0/0 | 0/0 | none found |
| `origin/rsi-multi-timeframe` | `6797c07` | 44  | 56 | 0/0 | 0/0 | none found |
| `origin/ui/accumulation-table-readability-20260906` | `a3784d9` | 33  | 56 | 0/0 | 0/0 | none found |
| `origin/vikram-ui-cleanup` | `494f16f` | 38  | 56 | 0/0 | 0/0 | none found |

- Tag `pre-obv-fix-baseline` → `d10da69`. It is the V15 baseline (Section 7). Not an acquisition concern.
- Remediation on branches other than `main`: **none made** (cannot push; see 5c).
- Tested: only the `main` tree was executed. Other branches were inspected statically.
- Workflows `fix-column-filters.yml` (exists only on `ui/accumulation-table-readability-20260906`; push-on-`main` trigger, patches `js/app.js`, no schedule or network lines) and `apply-accumulation-ui-update.yml` (listed by the GitHub API, **not found in any fetched ref**) are registered in GitHub but absent from `main`. Neither is an NSE acquisition workflow based on available evidence; the second could not be read — **NOT VERIFIED**.

### 5b. Pull-request refs (`refs/pull/N/head`) — fetched and inspected
These are not branches, but they are reachable on GitHub.

| Ref | SHA | ingest.js lines | Finding | Workflows |
|---|---|---|---|---|
| `pr/1` | `5452ced` | 66 | ingest.js small (mixed) | 2 schedule line(s) in workflows |
| `pr/2` | `e856b43` | 69 | ingest.js small (mixed) | 2 schedule line(s) in workflows |
| `pr/3` | `c44a8a8` | 69 | ingest.js small (mixed) | 2 schedule line(s) in workflows |
| `pr/4` | `360bb82` | 69 | ingest.js small (mixed) | 2 schedule line(s) in workflows |
| `pr/5` | `998ceff` | 69 | ingest.js small (mixed) | 2 schedule line(s) in workflows |
| `pr/6` | `2efbaad` | 257 | old full acquisition code present | 2 schedule line(s) in workflows |
| `pr/7` | `e5848c4` | 257 | old full acquisition code present | 2 schedule line(s) in workflows |
| `pr/9` | `b1b02c7` | 259 | old full acquisition code present | 2 schedule line(s) in workflows |
| `pr/10` | `75399ab` | 259 | old full acquisition code present | 2 schedule line(s) in workflows |
| `pr/11` | `81e99be` | 259 | old full acquisition code present | 2 schedule line(s) in workflows |

`pr/6, 7, 9, 10, 11` contain the **old full acquisition code**. All ten refs have `static-scanner.yml` with `schedule: cron '30 13 * * 1-5'`. GitHub only runs scheduled workflows from the default branch, so these cannot run by themselves. PR open/closed state is **NOT VERIFIED** (API rate limit). They are historical and are not changed.

### 5c. Not changed because
No write access/authorization to push. Rewriting history was not allowed.

## 6. The three `ingest.js` reviews and call-path audit

**Full read of all lines (this session):**
- `fix/ci-install-server-deps` @ `957ac2f` — 50 lines, **byte-identical to `main`**. Imports: `pg`, `./istDate`, `./scanMaterializer`, `./detectionHistory`, `../../accumulation/engine`, `./alerts/alertEngine`. Only function: `materializeScannerResults` (SQL SELECT from `cm_eod`/`futures_eod`, INSERT into `scanner_results*`). No HTTP, no spawn. Exports `{materializeScannerResults}`.
- `fix/delivery-staleness-zero-detection` @ `8e98168` — 66 lines. Same imports, same function (+ `detection` column). Lines 42-58: a lock constant and `recordSystemRun` (SQL insert into `ingestion_runs`), never called; lines 60-65 are comments describing removed code. Exports only `materializeScannerResults`. No HTTP. (Note: `formatYmd` is used but not imported here — a pre-existing bug, not an acquisition path.)
- `fix/live-data-website-integration` @ `5a41bd2` — 47 lines. Lines 38-45 contain a leftover `main()` plus `if(require.main===module)main()` that call `toIstCalendarDate`, `addDays`, `ingestCm`, `ingestFo`. **None is defined or imported**, so `node src/ingest.js` on that branch throws `ReferenceError` immediately, before any I/O. No HTTP client exists in the file. Classification: dead code, not executable acquisition. Recommended follow-up on that branch: delete lines 38-45.
- `main` @ `f2a8a4f` — 50 lines, same as the first.

**Call-path evidence on `main`:**
- `server/src/index.js` has 24 routes (static parse). All `GET`/`POST` for health, scanner, hidden gems, auth, saved queries, alerts, push, stock, research, plus one admin route (`GET /api/admin/ingestion-runs`). No ingest/backfill/download/acquire route.
- Walking `require()` from `server/src/index.js` reaches 18 modules; none requires `http`, `https`, `net`, `child_process`, `worker_threads`, and none uses `setInterval`; `ingest.js`, `staticSnapshot.js`, `backfillHistory.js` are **not** reached.
- `materializeScannerResults` has no runtime caller; only `server/test/integration.test.js` imports it.
- Frontend: `js/nseData.js` fetches only `data/…` files, `/api/auth/login|register`, and `/api/admin/ingestion-runs`. The acquisition message at `js/nseData.js:123` is text only.
- No `setInterval`/cron/scheduler/child_process in `server/src`, `accumulation`, `js`. `scripts/` and `tools/` listed and checked: the only `child_process` uses are `scripts/verifyV15SnapshotBehavior.js` and `scripts/reconstructSnapshotsFromGit.js` (local git/tests).
- Package scripts: no `ingest/download/backfill` script in any `package.json`.

**Conflict check (protected V15 vs acquisition):** `CHECKSUMS.json` lists `server/src/ingest.js`, `backfillHistory.js` and the deleted downloaders. That file is an older general manifest. 39 of its entries already differ and 10 are missing because the repo evolved. The authoritative V15 freeze list is `docs/recovery/frozen-hashes.json` (also used by CI). It contains only the four files and one result file in Section 7. **`ingest.js`, `backfillHistory.js` and `staticSnapshot.js` are not on the freeze list and are not V15 scoring files.** `ingest.js` calls `scanMaterializer.js` (frozen) but no change was made to that file. No protected file needed to be touched, so there is no unresolved conflict.

## 7. V15 integrity and tests

**Frozen files** (source: `docs/recovery/frozen-hashes.json`, `_current_authorized_baseline` commit `298539c`, branch `fix/obv-missing-volume`; original baseline tag `pre-obv-fix-baseline` = `d10da69`):

| File | Manifest | vs `origin/main` | vs tag | SHA-256 |
|---|---|---|---|---|
| `accumulation/engine.js` | MATCH | SAME | DIFF (only file expected to differ: authorized OBV missing-volume fix; the tag hash `ae6a8f1f…8f58` equals the manifest's `_previous_authorized_baseline`) | `124e5dd03cd66dd42208d22a41315a9df849edbb55b79fad80ed47617bd11dfb` |
| `accumulation/config.js` | MATCH | SAME | SAME | `55549588df09252f4e19cfb047cfe78f3f62928e9a33787563355d6c092e2f27` |
| `server/src/scannerEngine.js` | MATCH | SAME | SAME | `e01c6d05bfd09f42c724955183f0b531c6c3faebc0879c6ff92bc0c01b82b155` |
| `server/src/scanMaterializer.js` | MATCH | SAME | SAME | `0ca6f695306dd84c992809273b39c985aa7bc4203368309f6542dfc17e79a0f9` |
| `backtest/REAL_1YEAR_BACKTEST_RESULT.json` | MATCH | SAME | SAME | `281ed526c1189f6f703b26377d1832b50d35b17ce97dc7748c82f11f5b9fe1e7` |

Hashes were computed before any change and again after the last change. They did not move. The diff touches none of these files.

**Tests** (Node v22.22.2; run per file with `cd <dir> && timeout 120 node test/<file>`; no `DATABASE_URL`; no NSE access):

| Run | Files | Passed | Failed | Notes |
|---|---|---|---|---|
| `server`, before changes | 44 | 43 | 1 | 4 of the "passed" are NOT RUN (see below) |
| `server`, after final change | 45 | 44 | 1 | includes the new `noAcquisitionPaths.test.js` (exit 0) |
| `backtest`, before and after | 28 | 28 | 0 | |
| `noDirectNseAcquisition.test.js` | 1 | 1 | 0 | exit 0 |
| `noAcquisitionPaths.test.js` (new) | 1 | 1 | 0 | exit 0; mutation test: failed as expected for (a) ingest line in a deploy doc, (b) `unzipper` dependency, (c) `POST /api/admin/ingest/run` route |
| `v15Frozen.test.js` | 1 | 1 | 0 | "v15Frozen tests passed" |

- **FAILED (pre-existing, unrelated):** `server/test/researchStatic.test.js` — `ERR_ASSERTION actual '2026-10-07' expected '2026-10-08'`, a stored-data date check. It failed identically before my changes.
- **NOT RUN (DB required, print SKIP, exit 0):** `auth.test.js`, `fullUniverse.test.js`, `integration.test.js`, `raceCondition.test.js`. These are **not** counted as passing; so truly executed and passing in `server` = 40 of 45.
- Counts are test-file level. The test files do not report per-assertion totals.
- CI (GitHub Actions) was **not run** for these changes because they are not pushed. Existing CI run noted in `docs/NSE_ACQUISITION_REMOVED.md`: 40144337776 (not re-verified).

## 8. External / live deployment

| Check | Result |
|---|---|
| Repository `render.yaml` on `main` | Verified: no cron/worker |
| Live Render dashboard (cron jobs, workers, env vars) | **NOT VERIFIED** — no access. Operator must confirm the service `vikram-eod-ingestion` no longer exists and no other cron/worker is running. Evidence needed: dashboard screenshot or `render services list` output |
| GitHub workflows registered (public API, 2026-10-24) | 9 workflows `active`; `static-scanner.yml` is `disabled_manually` (so the static deploy is currently off). `fix-column-filters.yml` and `apply-accumulation-ui-update.yml` are registered but not on `main` (5a). Reading live schedules for them: **NOT VERIFIED** |
| Recent Actions runs, PR states | **NOT VERIFIED** (API rate limit) |
| Oracle VM, cron/systemd, other schedulers | **NOT VERIFIED** — the deployment doc mentioned a cron template; any real crontab on a VM must be checked by the operator (`crontab -l`, `systemctl list-timers`) |
| Production API (`/api/admin/ingest/run` returns 404?) | **NOT VERIFIED** — not called; would need the live URL |

## 9. Remaining risks and follow-up
1. Push this branch (or open a PR) and let CI run. Needs repo owner approval.
2. Operator checks listed in Section 8.
3. On `fix/live-data-website-integration`, delete the dead `main()` (`ingest.js:38-45`). Optional, no one runs it.
4. Decide whether to delete the 5 PR refs with old acquisition code (needs GitHub; closing a PR does not delete the ref).
5. `data/` still publishes NSE-sourced files (policy decision).
6. Fix or update the failing `researchStatic.test.js` date check separately; set up Postgres to run the 4 DB tests.

## 10. First commit
`c99d10a0b58f2d6f9ddb421c9d58bd389b1b0cb0` "Final NSE acquisition audit: docs, unused dependency, offline audit test, forensic report" — pushed to `main` and confirmed on a fresh clone of GitHub (fast-forward from `f2a8a4f`). The two `static`-only statements in sections 5-6 ("routes parsed", "call graph") were static checks; Section 11 records a startup crash they could not catch.

## 11. Continuation (2026-10-25)

### 11a. NEW FINDING — server crashed on startup (caused by an earlier cleanup commit, not by downloader code)
- `server/src/index.js:191` calls `requireAdmin(pool)` but the import line `const { requireAdmin } = require('./adminAuth');` was deleted by commit `c67321b` "Remove manual NSE ingestion API endpoint" (2026-10-24, before this audit). Result: `ReferenceError: requireAdmin is not defined` on startup. Any deployment of `main` (Render runs `node server/src/migrate.js && node server/src/index.js`) would fail to start.
- Why my first audit missed it: my route-table and call-graph checks were static and I did not boot the server. The existing DB tests `auth` and `fullUniverse` show it (they spawn the server) but were NOT RUN without a database.
- Fix (1 line): restore the import above the route. `adminAuth.js` is not a frozen file; no V15 file touched.
- Broken branches (verified by booting each): `main`, `backend-oracle-forensic`, `backend-oracle-hardening`, `fix/obv-missing-volume`, `recovery/v15-pipeline-2026-10-03`, `rsi-multi-timeframe`. The other 12 branches boot. A one-line patch per branch was made in a temporary worktree and boot-verified; patches only touch `server/src/index.js`.
- New offline test `server/test/serverBoots.test.js`: starts the server entry point with a dummy DB URL on a random local port and fails on any load error. Verified to FAIL on the `origin/main` version (`ReferenceError`) and PASS with the fix. Added to the `npm test` chain and to the `accumulation-scanner.yml` CI.
- Whether the live Render service is currently down: **NOT VERIFIED** (no access). If it was redeployed from `main` after `c67321b`, it would not start.

### 11b. Pull-request refs `pr/6, 7, 9, 10, 11`
| Ref | Head SHA | Result |
|---|---|---|
| `pr/6` | `2efbaad` "feat: add RSI multi-timeframe scanner support" | head commit is in `main` history; also on `rsi-multi-timeframe` and 6 other branches |
| `pr/7` | `e5848c4` "docs: add Oracle Always Free backend deployment requirements" | in `main` history |
| `pr/9` | `b1b02c7` "test(backtest): make downloaderResume session count relative…" | in `main` history |
| `pr/10` | `75399ab` "ci: install server dependencies before data-surface tests" | in `main` history |
| `pr/11` | `81e99be` "chore(v15): record authorized engine hash after OBV fix" | in `main` history |

These commits are historical commits already merged into `main`; `refs/pull/N/head` refs are read-only and cannot be edited. The branches that contain them have already been cleaned (Section 5a). Nothing was changed. Open/closed/merged status via GitHub API: **NOT VERIFIED** (unauthenticated rate limit). Manual step: open `https://github.com/adityavarma1213-star/Vikram/pulls?q=is%3Apr` and confirm none of #6, #7, #9, #10, #11 is open; close any that are. The old downloader code remains in Git history by design.

### 11c. `fix/live-data-website-integration`
- Full-file review and caller search: `ingest.js` is referenced only by `server/test/integration.test.js` (`materializeScannerResults`) and a `node --check` line in a workflow. `main()` (lines 38-45 of base `5a41bd2`) called undefined `ingestCm/ingestFo/toIstCalendarDate/addDays`.
- Removed: `main()` and the `require.main === module` line (9 lines deleted). Local commit `f8e614b516062dd48da07621017fb74db1bfa93f`, patch `fix-live-data-website-integration-dead-main.patch`. **Not pushed.**
- Tests on that branch tree: server 10/10 files pass before and after; `integration.test.js` SKIP (no DB then); `asm.test.js` pass; python `backtest/tests` 3 passed (run from repo root). Boot smoke test passes.
- Left in place on that older branch (inert): `backtest/config/download_manifest.json` (NSE host allowlist; read by no code; removed from `main` earlier in `1325392`), and an unused `unzipper` dependency. No HTTP client, scheduler or acquisition route exists on it.
- Other branches scanned for network/process/scheduler code: no executable acquisition found (only `setInterval` polling of local `data/scanner.json` in `js/app.js` of that older UI lineage).

### 11d. Workflows (all files on all 18 branches, `main`, and PR refs)
- 20 unique workflow versions across 28 refs scanned for `schedule:`/cron, `curl`/`wget`, NSE hosts, and `node …ingest|backfill|download|staticSnapshot` (not `--check`): **none on any of the 18 branches or `main`**. Hits exist only on `pr/1-7, 9-11` (`static-scanner.yml`: cron `30 13 * * 1-5`, runs `staticSnapshot.js`/`backfillHistory.js`). Those are merged historical commits; scheduled workflows run only from the default branch.
- `fix-column-filters.yml`: exists only on `ui/accumulation-table-readability-20260906` (and history); `push` to `main` trigger, edits `js/app.js`; no network/NSE. Not an acquisition workflow. It is absent from `main`, so it cannot trigger.
- `apply-accumulation-ui-update.yml`: **not found in any branch, tag, PR ref or in history** (only mentioned in this report). GitHub's API listed it earlier as registered, so it is a stale registration. Cannot be read: **NOT VERIFIED**. Manual step: GitHub → Actions → select it → check "Disable workflow" or delete; confirm its source file.
- `static-scanner.yml` status `disabled_manually` (API, 2026-10-24) — re-check in the Actions tab; the file on `main` is static deploy only, so enabling it does not acquire data.
- Live enabled/disabled status for all workflows: API rate-limited this session; **NOT VERIFIED**.

### 11e. Live services — NOT VERIFIED (no access; none attempted)
- **Render:** Dashboard → Services: confirm there is no cron job `vikram-eod-ingestion` or background worker; open the web service → Events/Logs and confirm it started after the latest deploy (see 11a). CLI alternative: `render services list`.
- **Oracle VM** (only if used): `crontab -l; sudo crontab -l; systemctl list-timers --all; systemctl list-units --type=service | grep -i vikram; grep -ri "ingest\|backfill" /etc/cron* /etc/systemd 2>/dev/null`.
- **Other schedulers** (cron-job.org, UptimeRobot-type pingers, GitHub scheduled workflows in forks): check each for any URL ending in `/api/admin/ingest/run` or scripts named in Section 4.

### 11f. Tests (Node v22.22.2; each file run as `cd <dir> && timeout 120 node test/<file>`)
| Run | Result |
|---|---|
| `server`, with a local throwaway PostgreSQL 16 (migrated), 46 files | 44 pass, 2 fail, 0 skipped: `researchStatic.test.js`, `integration.test.js` |
| `server`, offline (no DB), 46 files | 45 pass, 1 fail (`researchStatic`); DB tests print SKIP and are not counted as run |
| `backtest`, 28 files | 28 pass |
| `noAcquisitionPaths`, `noDirectNseAcquisition`, `serverBoots` | all pass (exit 0) |
| `auth`, `fullUniverse`, `raceCondition` with DB | all PASS (`auth` and `fullUniverse` failed before the import fix) |

- `researchStatic.test.js` — **diagnosed, data untouched:** `data/nse-coverage-report.json` says last date `2026-10-07`, 284 sessions, generated `2026-10-08T19:20Z`; `data/market-history/2026-10-08.json` was added in commit `66fba4a` at 19:34 the same day (285 files). The generated report is one day older than the data. Fix for the owner (not run, it rewrites a file under `data/`): `node scripts/buildNseCoverageReport.js` and commit the regenerated report.
- `integration.test.js` — fails at `integration.test.js:45` (`bbb.metrics.oiExactDate` is `undefined`, expected `false`). **Identical failure on commit `86ce4a7`, before any NSE cleanup**; it concerns scanner metrics, not downloading. Not changed (the metrics come from frozen `scanMaterializer`).
- CI on GitHub for these changes: not run.

### 11g. V15 and dataset preservation
- Frozen hashes re-checked after all continuation changes: `accumulation/engine.js`, `accumulation/config.js`, `server/src/scannerEngine.js`, `server/src/scanMaterializer.js`, `backtest/REAL_1YEAR_BACKTEST_RESULT.json` — all MATCH `docs/recovery/frozen-hashes.json`.
- `git diff --name-status 86ce4a7 -- data "VIKRAM DATA"` and the same against `c99d10a`: **0 files changed or deleted**. `data/market-history/` has 285 files.
- Read-only history route and existing-dataset downloads: code unchanged; `GET /api/admin/ingestion-runs` now starts again (it was unreachable due to 11a); `auth.test.js` passes with the DB.

### 11h. Verdict after continuation
**PARTIALLY COMPLETE.** In the audited repository code (default branch plus the 18 branches), no executable NSE acquisition path was found, datasets and V15 are intact, and a startup crash introduced by an earlier cleanup was found and fixed locally. It remains partial because: the continuation changes are not pushed; six branches (including `main`) still crash on startup until the one-line patches are applied; PR open/closed state, two workflow registrations, Render, the Oracle VM and external schedulers are NOT VERIFIED; and two server tests fail for pre-existing reasons.
