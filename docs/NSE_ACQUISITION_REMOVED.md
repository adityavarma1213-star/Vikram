# NSE direct acquisition removed

VIKRAM no longer contains any code path that downloads, requests, scrapes, backfills or ingests data
directly from NSE (automatically or manually). Existing stored data, manifests, logs and provenance
records were **not** deleted. VIKRAM V15 files were not changed.

## Removed
- `backtest/nseDownloader.js`, `backtest/lib/httpClient.js`, `tools/vikram-lite-downloader.js`
- Tests of those: `backtest/test/downloaderResume.test.js`, `httpClient.test.js`, `liveNetworkProbe.test.js`,
  `server/test/ingestRangeBackfill.test.js`, `ingestionLock.test.js`
- `package.json` scripts: `backtest` `download`, `test:live-network-probe`; `server` `ingest`
- Admin route `POST /api/admin/ingest/run` and the "Acquire" button in `js/nseData.js` / `nse-data.html`
- Render cron job `vikram-eod-ingestion` (`render.yaml`)
- Scheduled trigger and NSE steps in `.github/workflows/static-scanner.yml` (now deploy-only)

## Functions removed from mixed files (parsing / scanner code kept)
- `server/src/staticSnapshot.js`: fetchCm, fetchFo, fetchUniverse, ingestLatest, writeHistory, main, raw capture
- `server/src/ingest.js`: ingestCm, ingestFo, runIncrementalIngest, runRangeBackfill, main (kept: materializeScannerResults)
- `server/src/backfillHistory.js`: fetchWithBackoff, main (kept: offline integrity checks)
- `server/src/indexUniverses.js`: index-list URLs, fetchIndexUniverses (kept: parsing, membership)
- `backtest/lib/corporateActions.js`: NSE URL, fetchCorporateActionsRaw (kept: price-jump heuristic)

## Guard
`server/test/noDirectNseAcquisition.test.js` is an offline test that fails if an NSE host name,
a scheduled trigger for downloads, or a removed function returns.

## Not covered by this change
- Previously acquired NSE-sourced data still in `data/` and still published. A separate decision is needed.
## Branch audit and verification (2026-10-24)
- All 18 branches visible through the connected GitHub repository access were reviewed for the known acquisition entry points. The scheduled workflow and Render cron are absent on every branch checked; the identified downloader files and manual ingestion entry points were removed where present.
- The main-branch offline guard `server/test/noDirectNseAcquisition.test.js` passed in GitHub Actions run 40144337776. The complete server test chain still fails earlier in `researchStatic.test.js`: the checked-in coverage report ends at 2026-10-07 while stored market history includes 2026-10-08. That is a stale derived report, not evidence of an NSE request.
- The V15 release verification on `recovery/v15-pipeline-2026-10-03` confirms the frozen SHA-256 manifest, but its separate comparison against current `main` fails because `accumulation/engine.js` differs between those refs. This cleanup did not edit the V15 engine or other frozen V15 files; that pre-existing branch divergence remains unresolved and must not be hidden.
- This is a documented audit of the known paths and files, not proof that no overlooked custom script exists. The live Render dashboard, other external schedulers, deployed copies, GitHub secrets/settings, and personal scripts cannot be verified from repository contents alone.
- A future data provider needs separate authorization; none was added.

## Permanent rule (applies to every future change)

VIKRAM and its associated services must **never** directly download, scrape, fetch or automatically acquire market data or files from NSE-hosted websites or endpoints. This covers frontend and backend code, Python/JavaScript/shell utilities, GitHub Actions and other CI/CD, Render services and cron jobs, Oracle VMs, cloud functions, external schedulers, backfill jobs, and fallback providers or renamed copies of the deleted downloaders. Do not bypass NSE authentication, access restrictions, rate limits or protections.

**Allowed:** files the owner obtained manually and imports by hand; properly licensed third-party data (for example the gated, off-by-default `server/src/liveData/*` provider), subject to the licence; offline analysis of data already stored in `data/`.

**How this is enforced (all offline, no network):**
- `server/test/noDirectNseAcquisition.test.js` - NSE host names, removed file names, old function names, schedules, routes.
- `server/test/noAcquisitionPaths.test.js` - banned dependencies, deploy docs, route table, frontend fetch targets, server call graph.
- `server/test/nseProhibitionDeep.test.js` - deep scan of the real repository using `server/test/lib/nseProhibitionScanner.js` (split host names, every network/process primitive outside a reviewed allow-list, timers/services/crontab/render workers, workflow commands, provider switches).
- `server/test/nseProhibitionFixtures.test.js` - 20 prohibited cases that must be caught, plus a clean baseline and legitimate offline cases that must not be flagged.
- `server/test/serverBoots.test.js` - the server entry point must start.

**Limits (honest):** these are static pattern checks. They cannot see live servers (Render, Oracle VM, external schedulers), and a request hidden by code downloaded at run time would need human review. A new legitimate network user must be added to `ALLOWED_NETWORK` in the scanner on purpose, in a reviewed change. Old downloader code still exists in Git history (for example the tag `pre-obv-fix-baseline`); history was not rewritten.
