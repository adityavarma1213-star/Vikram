# ITEM 2 — Raw NSE Provenance: Audit and Classification

## Classification for the EXISTING 1-year historical batch (263 trading-date files, 2025-09-02 to 2026-09-04)

**PROVENANCE INCOMPLETE.**

Evidence:
- No raw NSE-downloaded bytes (bhavcopy CSV/ZIP) exist anywhere in the repository for this batch.
  `find . -iname "*bhavcopy*" -o -iname "*.csv"` (excluding `node_modules`) returns nothing.
  `backtest/data/raw/cm/` exists but is **empty** (0 files) — it is scaffolding for the correct
  pipeline described below, not populated history.
- `backtest/data/manifest.json`'s own `provenance_note` already says so honestly: *"Re-manifested
  by independent forensic audit from pre-existing data/market-history/*.json files, confirmed
  byte-identical to the original day-1 uploaded ZIP. Not downloaded by this session; not
  fabricated."*
- Every entry's `sha256` is a hash of the **normalized** `data/market-history/<date>.json` file
  (e.g. `CM|2025-09-02`'s `file_path` is `../data/market-history/2025-09-02.json`), not of any
  original NSE-source bytes. `verifyManifestIntegrity()` (see `backtest/lib/manifestIntegrity.js`)
  re-checks this hash on every run and it does match — but that only proves the normalized file
  hasn't been tampered with *since being written*; it proves nothing about the file's fidelity to
  whatever NSE originally served. **This report does not treat that self-consistency check as
  raw-source provenance, per the explicit instruction not to.**
- No `source_url` in the manifest points at an actual NSE archive URL for these 263 dates — the
  field instead reads `PRE_EXISTING_REPO_DATA: data/market-history/ (produced by
  server/src/backfillHistory.js in a prior environment...)`, i.e. a description of internal repo
  history, not an NSE endpoint.

**No raw files were fabricated to close this gap** (would violate the explicit "do not fabricate
raw NSE files from the normalized JSON" instruction). The batch is used as-is, honestly labeled.

## Classification for FUTURE downloads: PROVENANCE COMPLETE (code already exists; verified, not yet exercised live in this sandbox)

`backtest/nseDownloader.js` already implements the exact required chain:

```
NSE SOURCE  (nsearchives.nseindia.com bhavcopy URLs)
    |
fetchRaw(url)                              -- downloads the raw response
    |
fs.writeFileSync(rawPath, rawBuf)          -- ORIGINAL bytes preserved, unmodified, before any parsing
    |
sha256(rawBuf)                             -- hash of the RAW bytes, not the parsed output
    |
parseCsvBuffer() / extractCsvFromZip()     -- parser runs only AFTER raw capture + hashing
    |
normalizeCmRows()/normalizeFoRows()        -- normalized data
    |
validateCmRow()/validateFoRow()            -- validation
    |
manifest.record({source_url, sha256, file_path, download_status, validation_status, row_count})
```
(`backtest/nseDownloader.js` lines 122-152 — `fs.writeFileSync(filePath, rawBuf)` happens at line
128, `sha256(rawBuf)` at line 129, **before** `parseCsvBuffer()` is called at line 132.)

This is enforced, not just recorded by convention:
- `backtest/lib/manifestIntegrity.js::verifyManifestIntegrity()` re-hashes the raw file referenced
  by every SUCCESS+VALID manifest entry, on every run, and rejects the entry if: the raw file is
  missing, no sha256 was recorded, the recorded hash doesn't match the file's actual current bytes,
  or the corresponding normalized file is missing.
- `backtest/lib/productionGate.js::requireRealBacktest()` — the single gate `backtestRunner.js`
  calls before treating any data as real — refuses the entire backtest (throws) if any integrity
  violation exists. A future download cannot silently degrade to "trust me" provenance.

## TEST REQUIREMENT

`backtest/test/provenanceRequired.test.js` (new) exercises the real enforcement code
(`verifyManifestIntegrity` + `requireRealBacktest`) with 5 cases, all passing in this sandbox
(no external dependencies required):
1. Missing `sha256` → refused
2. Missing `file_path` → refused
3. `sha256` present but not matching the actual bytes on disk (tampering/corruption) → refused
4. Raw file referenced by the manifest has been deleted → refused
5. A genuinely complete entry (real bytes, matching hash, normalized file present) → accepted

`backtest/test/downloaderResume.test.js` (pre-existing) additionally proves raw-file preservation
through the **real** `nseDownloader.run()`/`downloadOneSegment()` code path end-to-end, with the
network mocked — but is currently **BLOCKED** in this sandbox: `csv-parse` is not installed
(`Cannot find module 'csv-parse/sync'`) and there is no network access here to `npm install` it.
This is an environment limitation, not a code or logic failure — confirmed by checking that the
failure is a `MODULE_NOT_FOUND` at import time, before any test logic runs.

## STATUS

**PARTIALLY FIXED.**
- Historical batch: correctly classified as PROVENANCE INCOMPLETE, honestly documented, not
  fabricated. Nothing to "fix" here beyond correct disclosure — there is no way to recover raw
  bytes that were never preserved.
- Future pipeline: code is provenance-complete and enforced by existing test coverage
  (`manifestIntegrity.test.js`, `productionGate.test.js`) plus the new
  `provenanceRequired.test.js`. **Not verified live end-to-end** in this sandbox (no network to
  actually hit NSE, and `downloaderResume.test.js`'s mocked end-to-end run is blocked by a missing
  npm package) — VERIFICATION BLOCKED for that specific end-to-end confirmation, though the
  underlying logic is directly tested.

## REMAINING LIMITATION

`csv-parse` and `unzipper` (both declared in `backtest/package.json`) are not installed in this
sandbox and cannot be installed here (no network access to the npm registry). Anyone running this
in an environment with `npm install` available should re-run `npm test` in `backtest/` to confirm
`downloaderResume.test.js` also passes — it was not modified and there is no reason to expect it
would fail, but it was not directly observed passing in this session.
