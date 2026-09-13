# ITEM 1 — 13 Suspicious Date Verification (auto-generated evidence)

Generated: 2026-09-13T13:35:03.292Z
Dataset scanned: backtest/data/normalized/cm/ (263 trading-date files)
Stale-duplicate threshold: >= 98% of common symbols byte-identical to the immediately preceding date (excluding the trade_date field itself).

**13 stale-duplicate date(s) found.**

## 2025-10-22
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Diwali Balipratipada — Business Standard, "Is the stock market open on New Year? Check BSE, NSE 2025 holiday list"
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2025-10-22.json; 2291/2291 symbols (100.00%) are byte-identical to 2025-10-21.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2025-10-22); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2025-10-22 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2025-11-05
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Guru Nanak Jayanti (Gurpurab) — Business Standard / India TV / The Hans India / Samco, all dated 2025-11-05
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2025-11-05.json; 2286/2286 symbols (100.00%) are byte-identical to 2025-11-04.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2025-11-05); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2025-11-05 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2025-12-25
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Christmas — Business Standard 2025 holiday list
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2025-12-25.json; 2375/2375 symbols (100.00%) are byte-identical to 2025-12-24.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2025-12-25); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2025-12-25 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-01-15
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Ad-hoc trading holiday, BMC/Maharashtra Municipal Corporation elections (partial modification to NSE/CMTR/71775, issued 2026-01-12) — Business Today, Upstox, Paytm Money (2026-01-14/15)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-01-15.json; 2390/2390 symbols (100.00%) are byte-identical to 2026-01-14.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-01-15); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-01-15 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-01-26
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Republic Day — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-01-26.json; 2395/2395 symbols (100.00%) are byte-identical to 2026-01-23.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-01-26); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-01-26 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-03-03
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Holi — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-03-03.json; 2423/2423 symbols (100.00%) are byte-identical to 2026-03-02.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-03-03); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-03-03 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-03-26
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Shri Ram Navami — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-03-26.json; 2438/2438 symbols (100.00%) are byte-identical to 2026-03-25.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-03-26); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-03-26 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-03-31
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Shri Mahavir Jayanti — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-03-31.json; 2448/2448 symbols (100.00%) are byte-identical to 2026-03-30.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-03-31); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-03-31 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-04-03
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Good Friday — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-04-03.json; 2451/2451 symbols (100.00%) are byte-identical to 2026-04-02.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-04-03); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-04-03 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-04-14
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Dr. Baba Saheb Ambedkar Jayanti — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-04-14.json; 2456/2456 symbols (100.00%) are byte-identical to 2026-04-13.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-04-14); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-04-14 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-05-01
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Maharashtra Day — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-05-01.json; 2455/2455 symbols (100.00%) are byte-identical to 2026-04-30.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-05-01); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-05-01 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-05-28
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Bakri Id — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-05-28.json; 2463/2463 symbols (100.00%) are byte-identical to 2026-05-27.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-05-28); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-05-28 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## 2026-06-26
- EXPECTED STATUS: NOT_A_TRADING_DAY
- ACTUAL SOURCE EVIDENCE: Muharram — NSE Circular NSE/CMTR/71775 (2025-12-12)
- DATA FILE STATUS: File exists at backtest/data/normalized/cm/2026-06-26.json; 2406/2406 symbols (100.00%) are byte-identical to 2026-06-25.
- ROOT CAUSE: A genuine NSE non-trading day was materialized with the prior session's data instead of being skipped/marked absent. The current fetchCm()/nseDownloader.js code path throws (does not fabricate) on a missing bhavcopy, so this is a pre-existing artifact, not a defect reproducible by the current ingestion code.
- ACTION TAKEN: Excluded from the trading-session calendar used by backtest/backtestRunner.js (loadNormalizedBySymbol() skips rows dated 2026-06-26); the on-disk file itself was left untouched for audit purposes; backtest/data/manifest.json's CM|2026-06-26 entry's validation_status was updated to reflect this.
- CLASSIFICATION: NOT_A_TRADING_DAY

## Summary
- NOT_A_TRADING_DAY: 13
- DATA_INGESTION_ERROR: 0
- Total stale-duplicate dates found by the automated scan: 13
