# VIKRAM Lite Data Folder

This folder is the local, offline data store for official exchange files used by VIKRAM Lite.

## Subfolders

- `BhavCopy/` — NSE/BSE end-of-day equity bhavcopy files
- `Delivery/` — security-wise delivery / full bhavcopy delivery data
- `Corporate Actions/` — bonus, split, dividend, rights, merger and related filings
- `Financial Results/` — quarterly results, balance sheet, P&L and cash-flow files
- `Shareholding/` — quarterly shareholding-pattern files
- `MF-FII-DII/` — institutional activity files
- `52 Week High Low/` — daily NSE 52-week high/low reports
- `News/` — manually saved company news/announcements

The downloader creates missing subfolders automatically.

## Official-source rule

VIKRAM Lite is designed to use official exchange/company-published files. It does not silently replace missing official data with third-party market-data feeds.

For NSE daily EOD data, run:

```bash
node tools/vikram-lite-downloader.js
```

Or specify a report date:

```bash
node tools/vikram-lite-downloader.js 2026-09-05
```

NSE's current All Reports page lists the CM-UDiFF Common Bhavcopy Final, Full Bhavcopy and Security Deliverable data, Security-wise Delivery Positions, and 52 Week High Low Report. BSE files that require portal/date selection should be obtained from the official BSE Market Downloads page.
