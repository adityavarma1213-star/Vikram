# Accumulation Scanner — Phase 0/1 Status

## Implemented on `feature/accumulation-scanner-phase0`

- Dedicated `accumulation.html` browser dashboard.
- One-click scan for selected symbols and an ALL STOCKS route.
- Default watchlist: ONGC, VBL, BSE, NMDC.
- Transparent accumulation score and WHY output.
- Price change %, volume ratio, delivery %, delivery quantity, OBV, futures OI and Change OI fields.
- Missing data remains N/A; no synthetic market values are generated.
- Futures confirmation requires the exact CM trading date and does not backstep to an older date.
- PostgreSQL schema for CM EOD, futures EOD and ingestion audit records.
- Node/Express API endpoints for health, watchlist, selected scan, all-stock scan and stock detail.
- Scheduled NSE CM/F&O ingestion worker with retry across recent dates.
- Service worker updated so `/api/` responses are never served from stale cache.
- Render deployment blueprint for a hosted web service, PostgreSQL database and weekday ingestion job.

## Validation performed

- JavaScript syntax checks passed for the scanner and backend modules.
- Accumulation scoring engine was exercised with a controlled synthetic test dataset only to verify code behavior; those values are not shipped as market data.
- Live NSE archive download could not be executed from the development environment because outbound DNS/network access was unavailable. No live market values were fabricated as a substitute.

## Important production gate

Before enabling automated NSE ingestion for a deployed service, confirm the applicable NSE data-sharing/usage terms and the permitted use of automated retrieval. The implementation does not bypass CAPTCHA, WAF, rate limits or other access controls.
