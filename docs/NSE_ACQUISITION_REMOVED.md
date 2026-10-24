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
- Other git branches still contain the old downloader code until separately handled.
- Anything configured outside this repository (Render dashboard, GitHub settings, personal scripts).
- A future data provider needs separate authorization; none was added.
