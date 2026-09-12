# VIKRAM 5-Year NSE Backtest Pipeline

## Current status (see `reports/FINAL_REPORT.json` / `.xlsx` for full detail)

| Item | Status |
|---|---|
| REAL NSE DATA | **FAIL** — blocked at network egress, not by NSE |
| VIKRAM ENGINE | **PASS** — real `accumulation/engine.js` integrated, verified |
| BACKTEST | **FAIL** — refused by the production gate (zero real records) |
| Software tests (synthetic fixtures) | **PASS** (mechanics only, not a real backtest) |

**No synthetic performance numbers exist anywhere in this package.** Nothing here should be
quoted as evidence of VIKRAM strategy performance.

## What this is

A downloader + validator + chronological backtest runner for the real VIKRAM accumulation
engine (`accumulation/engine.js`, unmodified), covering:

- CM OHLC/price, volume, delivery quantity/% (`nseDownloader.js`, CM segment)
- F&O futures + open interest / change-in-OI (`nseDownloader.js`, FO segment)
- Real trading-session detection (empirical: a date only counts once NSE's own file
  confirms it, not a hardcoded holiday list)
- Checkpointed, resumable downloads with a per-file manifest recording source URL,
  trading date, download status, SHA-256, and validation status (`lib/manifest.js`)
- Missing/duplicate/malformed/invalid-file detection, including the delivery-qty-vs-volume
  invariant (`lib/validators.js`)
- Handling of NSE's legacy CSV vs UDiFF CSV/ZIP format families across the 5-year window
  (`nseDownloader.js` tries both, oldest-compatible last)
- A production gate (`lib/productionGate.js`) that REFUSES to run a backtest unless real
  NSE data with `REAL_NSE` provenance exists and the engine is the real, non-synthetic one
- A chronological, look-ahead-safe multi-horizon backtest (1D/5D/20D/60D/120D forward
  returns) against the real engine's `ACCUMULATION CONFIRMED` signals (`backtestRunner.js`)

## Why it stopped

This code was built and tested inside a sandboxed execution environment whose outbound
network allowlist does not include any NSE domain. Every attempt to reach
`nsearchives.nseindia.com` / `www.nseindia.com` returns HTTP 403 with
`x-deny-reason: host_not_allowed` **before the request leaves the sandbox** — NSE's own
servers were never contacted. Proof of this is captured in
`reports/live_network_probe_result.txt` and `data/manifest.json` (a real run of
`nseDownloader.js` against a real 5-year date range, stopped at the very first candidate
date per the "never substitute fake data" requirement).

## How to actually run this for real

1. Run this in an environment whose network egress allowlist includes
   `nsearchives.nseindia.com` and `www.nseindia.com` (no code changes should be required).
2. `cd backtest && npm install`
3. `node nseDownloader.js` — downloads and validates 5 years of CM + F&O data, with
   checkpoint/resume (safe to kill and re-run; it picks up where it left off).
4. `node backtestRunner.js` — runs the real chronological backtest. It will refuse to run
   (by design) unless step 3 produced real records.
5. Regenerate `reports/FINAL_REPORT.xlsx` / `.json` from the new `reports/backtest_results.json`.

## Tests

- `npm test` — software tests only, against hand-built fixtures explicitly marked
  `SYNTHETIC_TEST_ONLY` in every file. These test checksum correctness, schema validation,
  checkpoint/resume mechanics, the honesty gate's refusal logic, and look-ahead-safe
  forward-return math. They do **not** prove anything about real NSE data or real VIKRAM
  performance.
- `npm run test:live-network-probe` — attempts one real request to NSE and reports exactly
  what happened. Expected to be RED in this sandbox; should go GREEN once NSE egress is
  available.
