# Dhan Historical Data downloader

Admin-only screen (`dhan-historical.html`) and API (`/api/dhan/historical/*`) that fetch Dhan daily or
5-minute candles through YOUR server and let you save them as a CSV with the browser's normal download.
It is isolated in `server/src/dhanHistorical/`. It does not import or change any scoring, scanner,
or V15 file, and it never starts a scan.

## Status of real access: NOT VERIFIED
No real Dhan call was made while building this. Dhan's Data API is a paid subscription
(see "Verified Dhan facts"), so live use is blocked until YOU subscribe and supply a token.
All tests use mocked responses and synthetic data.

## Verified Dhan facts (read from official pages on 30 Oct 2026)
| Item | Finding | Source |
|---|---|---|
| Endpoints | `POST https://api.dhan.co/v2/charts/historical` (daily), `POST https://api.dhan.co/v2/charts/intraday` (minute) | https://dhanhq.co/docs/v2/historical-data/ |
| Auth | `access-token` header (JWT). Token from web.dhan.co lasts 24 hours; `RenewToken` extends active tokens; TOTP/API-key flows exist | https://dhanhq.co/docs/v2/authentication/ |
| Request fields | `securityId`, `exchangeSegment` (e.g. `NSE_EQ`), `instrument` (`EQUITY`), `fromDate`, `toDate`, optional `oi`; intraday adds `interval` (1, 5, 15, 25, 60) | historical-data page |
| Daily dates | `YYYY-MM-DD`, `toDate` is non-inclusive; data back to the scrip's inception | historical-data page |
| Intraday dates | `YYYY-MM-DD HH:MM:SS`; docs say last 5 years; **only 90 days per request** | historical-data page |
| Daily per-request limit | NOT documented. We use 365-day chunks (unverified, conservative) | historical-data page |
| Response | parallel arrays `open, high, low, close, volume, timestamp, open_interest`; timestamp = epoch seconds | historical-data page |
| Rate limit | Data APIs: 5 per second, 100,000 per day (we use ~4 per second) | https://dhanhq.co/docs/v2/ |
| Errors | DH-901 auth, DH-902 not subscribed, DH-904 rate limit, DH-905 bad input, DH-907 data error, DH-908/909/910 server/network; data codes 805-814 | https://dhanhq.co/docs/v2/annexure/ |
| Instruments | Official CSV: https://images.dhan.co/api-data/api-scrip-master.csv | https://dhanhq.co/docs/v2/instruments/ |
| Cost | Trading APIs free. Data API (includes historical) **Rs 499 + taxes per month**. Dhan's support page says the "free after enough trades" offer was discontinued; one third-party blog still claims otherwise, so treat that as unconfirmed | https://dhan.co/support/platforms/dhanhq-api/is-the-dhanhq-data-api-subscription-free-if-i-execute-a-minimum-number-of-trades-every-month/ |

Not verified: storage/redistribution terms for downloaded data (read Dhan's terms before using data beyond
personal backtesting); whether every NSE symbol really has 5 years of 5-minute data (the code reports
coverage, it does not assume); exact scrip-master column names (the parser accepts the documented names
`SEM_SMST_SECURITY_ID`, `SEM_TRADING_SYMBOL`, `SEM_EXM_EXCH_ID`, `SEM_SEGMENT`, `SEM_INSTRUMENT_NAME`, `SEM_SERIES`;
if your file differs the status card tells you the file has no usable rows).

## Zero-cost policy
Live downloads need the paid Data API, so **zero-cost compliance is BLOCKED for live use**. Nothing was
purchased or activated. The code costs nothing to run locally.

## Setup (local backend, recommended)
1. `cd server && npm install`
2. Download the official instrument CSV yourself and save it as `server/data-local/api-scrip-master.csv`
   (this folder is git-ignored). Re-download about monthly; the screen warns when the file is older than 30 days.
3. Copy `server/.env.dhan.example` values into your environment. Set `DHAN_ACCESS_TOKEN` (renew every 24 hours),
   `DHAN_CLIENT_ID`, `ADMIN_EMAILS` (your VIKRAM login email), plus the usual `DATABASE_URL` and `AUTH_SECRET`.
4. `npm start` (from `server/`), open `http://localhost:3000/dhan-historical.html`, sign in with your VIKRAM account.

## Download a CSV to your laptop
1. Open the screen, check the status card shows "Configured" and the instrument count.
2. Type a symbol, pick Daily or 5-minute, pick dates, click **Request data**.
3. Wait for the status. Read requested range, candle count, actual range and warnings.
4. Click **Download CSV**. Your browser saves it to its normal Downloads folder (a website cannot choose a folder silently).
5. If the status is PARTIAL you must tick the confirmation box; the file name ends `_PARTIAL`. Prefer re-requesting.
Files expire from server memory after 10 minutes. Nothing is written to disk or the database.

## What works where
- **Local backend:** everything above.
- **Hosted Render service:** the code runs, but you must put the 24-hour token in the Render environment every day, and it spends your Dhan quota from a shared host. Not recommended; not tested.
- **GitHub Pages copy:** shows a notice only. It is static and cannot hold a token.

## CSV format
Columns: `symbol, security_id, exchange_segment, interval, timestamp_ist, date_ist, open, high, low, close, volume`.
Times are IST. Daily candles are stamped 00:00:00 IST. Prices are exactly as Dhan returned them (no adjustment is claimed; Dhan's page on corporate-action adjustment was not verified).

## Security review
- Token only in server environment; never in browser code, URLs, request bodies, logs (redaction helper + tests), or Git. `.gitignore` covers `server/data-local/`, `server/.env.dhan`, `dhan_*.csv`.
- Routes sit behind VIKRAM login AND the `ADMIN_EMAILS` allowlist. Input is whitelisted and validated; the Dhan host is one fixed constant (no user-controlled URL; redirects refused).
- Limits: one running job per user, 4 starts per minute, 3 stored files, 30 requests and 600,000 rows per job, 2 KB request body.
- Files held in memory per user, expire in 10 minutes, served with `no-store` and `nosniff`. CSV text cells are guarded against spreadsheet formula injection.
- No fabricated candles, no substitute provider. Bad rows are dropped and counted, never repaired.
- Caveat: the per-minute and one-job limits are in-memory, per server process.

## Changes to existing files (all small)
- `server/src/index.js`: 3 lines mounting the new router.
- `server/package.json`: adds the new test to `npm test`.
- `.gitignore`: local-only paths.
- `server/test/noDirectNseAcquisition.test.js`: added `server/src/dhanHistorical/config.js` to its allowlist of files that may contain a URL literal (it holds the fixed `api.dhan.co` host). No other guard rule was loosened.

## Tests
- `node server/test/dhanHistorical.test.js` (offline, 32 tests).
- `python3 server/test/browser/dhan_download_screen.py` (real Chromium, mocked Dhan, 15 checks).
- Known pre-existing failure on unchanged `main`: `server/test/researchStatic.test.js`.

## Later additions
Another interval (for example 15 minutes): add one entry to `INTERVALS` in `config.js`, plus an `<option>` in the page.
Saving data permanently on your laptop needs a separate local app; a hosted website cannot write to your disk.
