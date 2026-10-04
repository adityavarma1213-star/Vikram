# VIKRAM V15 — Confirmed Stock Catch History (read-only report)

Full row-level data (all 852 catch rows, all 192 stocks, all 263 sessions, 56 weeks, 13 months) is in `VIKRAM_V15_Confirmed_Catch_History_Report.xlsx` and `v15_confirmed_catches_full.csv`. This file holds the summary tables.

## Data quality

| Item | Value |
|---|---|
| Period requested | 2025-09-02 → 2026-09-24 |
| Period with RECORDED V15 verdicts | 2025-09-30 → 2026-09-03 (first catch 2025-10-01, last catch 2026-09-03) |
| Recovered sessions with verdicts | 229 |
| Sessions in period with NO usable verdict | 34 (20 warm-up, 7 zero-filled delivery, 7 no recorded run) |
| Confirmed catch events (engine grouping) | 769 |
| Confirmed catch-days (one row per symbol per confirmed session) | 852 |
| Unique confirmed symbols | 192 |
| Catch-days with verified current price | 848 |
| Catch-days without current price | 4 (all LTIM: 2025-10-10, 2025-11-12, 2025-12-17, 2026-01-16 — no row on the latest session) |
| Previously reported audit | 913 events / 193 symbols |
| Recovered | 852 catch-days (769 events) / 192 symbols |

**Why recovered ≠ 913/193.** The 913/193 figures do not appear anywhere in the uploaded package. The only recorded V15 output (`backtest/REAL_1YEAR_BACKTEST_RESULT.json`) ends at 2026-09-03. The recorded run also saw delivery % zero-filled for every symbol on 2026-09-04, 09-07…09-11 and 09-15, so its silence there is not a verified zero. Raw files exist for 09-16…09-24 but no verdicts were stored. The gaps (913 − 852 = 61 catches, 193 − 192 = 1 symbol) would fit a later or separate run over those sessions using the repaired delivery data now in `data/market-history`, but that is a hypothesis the package cannot confirm, so nothing was forced to match.

**What a "catch" is here.** The engine groups consecutive confirmed sessions into one event (max streak 3). Each streak day is listed as its own row so nothing is merged. The middle day of a 3-day streak is derived from the recorded first/latest dates and is marked DERIVED in the workbook.

**Current price.** Close of 2026-09-28 (latest session in the package; matches `scanner.json` EOD VERIFIED on all 2,676 symbols). Sessions 09-29 onward are not in the package, so this is not a live quote.

**Corporate actions: CORPORATE ACTION STATUS UNKNOWN for every row.** No corporate-action source was ever fetched, so all comparisons use raw unadjusted closes. A heuristic flags 15 catch-days (CAMS, HDFCAMC, KOTAKBANK, LICI, NUVAMA, POLICYBZR, VEDL) that had a ≥20% one-day move after the catch. All 15 show as FALLEN and several look like splits. The heuristic cannot see smaller adjustments.

## Table 7 — Up vs down (catch-day price → 2026-09-28 close)

| Measure | Count | % | Denominator |
|---|---|---|---|
| Total confirmed catches | 852 | | |
| Risen | 291 | 34.32% | 848 catches with valid price |
| Fallen | 557 | 65.68% | 848 |
| Unchanged | 0 | 0.00% | 848 |
| No current data | 4 | 0.47% | all 852 |

Sensitivity: excluding the 15 flagged rows, 291 of 833 priced catches are risen (34.93%) and 542 fallen (65.07%). At event level (769 events, first-detection close): 260 risen, 505 fallen, 4 no data. The engine run's own forward win rates: 1D 49.54%, 5D 46.68%, 20D 48.49%, 60D 48.17%, 120D 41.94%.

## Table 6 — Monthly catch frequency

Confirmation Rate (CONFIRMED / STARTING) is N/A for every month because STARTING counts were not stored. Averages divide by verified sessions only.

| Month | Sessions | Verified | Missing | CONFIRMED | Unique | Repeat | Avg/session | Risen | Fallen | Unchanged | No data |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2025-09 | 21 | 1 | 20 | 0 | 0 | 0 | 0.00 | 0 | 0 | 0 | 0 |
| 2025-10 | 21 | 21 | 0 | 91 | 67 | 24 | 4.33 | 33 | 57 | 0 | 1 |
| 2025-11 | 19 | 19 | 0 | 49 | 39 | 27 | 2.58 | 25 | 23 | 0 | 1 |
| 2025-12 | 22 | 22 | 0 | 50 | 41 | 37 | 2.27 | 22 | 27 | 0 | 1 |
| 2026-01 | 20 | 20 | 0 | 109 | 75 | 73 | 5.45 | 29 | 79 | 0 | 1 |
| 2026-02 | 20 | 20 | 0 | 84 | 61 | 74 | 4.20 | 22 | 62 | 0 | 0 |
| 2026-03 | 19 | 19 | 0 | 40 | 32 | 34 | 2.11 | 16 | 24 | 0 | 0 |
| 2026-04 | 20 | 20 | 0 | 117 | 78 | 102 | 5.85 | 65 | 52 | 0 | 0 |
| 2026-05 | 19 | 19 | 0 | 70 | 53 | 62 | 3.68 | 22 | 48 | 0 | 0 |
| 2026-06 | 21 | 21 | 0 | 66 | 51 | 63 | 3.14 | 24 | 42 | 0 | 0 |
| 2026-07 | 23 | 23 | 0 | 90 | 68 | 84 | 3.91 | 20 | 70 | 0 | 0 |
| 2026-08 | 21 | 21 | 0 | 79 | 59 | 74 | 3.76 | 13 | 66 | 0 | 0 |
| 2026-09 | 17 | 3 | 14 | 7 | 7 | 6 | 2.33 | 0 | 7 | 0 | 0 |

2025-09 has one verified session (09-30, zero catches) because the engine needs 20 prior sessions. 2026-09 has 3 verified sessions (09-01…09-03); 09-04…09-24 are MISSING / UNVERIFIED, not zero. Unique = distinct symbols in the month; Repeat = catch-days of symbols already caught on an earlier date.

## Table 5 — Weekly catch frequency

| Week | Sessions | Verified | CONFIRMED | Unique | Repeat | Risen | Fallen |
|---|---|---|---|---|---|---|---|
| 2025-W36 (2025-09-02) | 4 | 0 | MISSING / UNVERIFIED | — | — | — | — |
| 2025-W37 (2025-09-08) | 5 | 0 | MISSING / UNVERIFIED | — | — | — | — |
| 2025-W38 (2025-09-15) | 5 | 0 | MISSING / UNVERIFIED | — | — | — | — |
| 2025-W39 (2025-09-22) | 5 | 0 | MISSING / UNVERIFIED | — | — | — | — |
| 2025-W40 (2025-09-29) | 4 | 3 | 22 | 20 | 2 | 8 | 14 |
| 2025-W41 (2025-10-06) | 5 | 5 | 24 | 21 | 6 | 8 | 15 |
| 2025-W42 (2025-10-13) | 5 | 5 | 24 | 22 | 10 | 8 | 16 |
| 2025-W43 (2025-10-20) | 4 | 4 | 1 | 1 | 1 | 0 | 1 |
| 2025-W44 (2025-10-27) | 5 | 5 | 20 | 18 | 5 | 9 | 11 |
| 2025-W45 (2025-11-03) | 4 | 4 | 16 | 13 | 10 | 6 | 10 |
| 2025-W46 (2025-11-10) | 5 | 5 | 21 | 17 | 11 | 12 | 8 |
| 2025-W47 (2025-11-17) | 5 | 5 | 3 | 3 | 2 | 1 | 2 |
| 2025-W48 (2025-11-24) | 5 | 5 | 9 | 9 | 4 | 6 | 3 |
| 2025-W49 (2025-12-01) | 5 | 5 | 6 | 6 | 4 | 4 | 2 |
| 2025-W50 (2025-12-08) | 5 | 5 | 19 | 19 | 16 | 9 | 10 |
| 2025-W51 (2025-12-15) | 5 | 5 | 14 | 14 | 14 | 7 | 6 |
| 2025-W52 (2025-12-22) | 4 | 4 | 1 | 1 | 1 | 0 | 1 |
| 2026-W01 (2025-12-29) | 5 | 5 | 20 | 20 | 5 | 5 | 15 |
| 2026-W02 (2026-01-05) | 5 | 5 | 46 | 39 | 30 | 11 | 35 |
| 2026-W03 (2026-01-12) | 4 | 4 | 24 | 22 | 17 | 6 | 17 |
| 2026-W04 (2026-01-19) | 5 | 5 | 2 | 2 | 1 | 1 | 1 |
| 2026-W05 (2026-01-27) | 4 | 4 | 27 | 22 | 22 | 8 | 19 |
| 2026-W06 (2026-02-02) | 5 | 5 | 38 | 31 | 36 | 11 | 27 |
| 2026-W07 (2026-02-09) | 5 | 5 | 22 | 18 | 19 | 5 | 17 |
| 2026-W08 (2026-02-16) | 5 | 5 | 3 | 3 | 3 | 1 | 2 |
| 2026-W09 (2026-02-23) | 5 | 5 | 21 | 19 | 16 | 5 | 16 |
| 2026-W10 (2026-03-02) | 4 | 4 | 5 | 4 | 5 | 2 | 3 |
| 2026-W11 (2026-03-09) | 5 | 5 | 8 | 7 | 8 | 3 | 5 |
| 2026-W12 (2026-03-16) | 5 | 5 | 26 | 24 | 20 | 11 | 15 |
| 2026-W13 (2026-03-23) | 4 | 4 | 1 | 1 | 1 | 0 | 1 |
| 2026-W14 (2026-03-30) | 3 | 3 | 23 | 20 | 15 | 17 | 6 |
| 2026-W15 (2026-04-06) | 5 | 5 | 49 | 40 | 47 | 29 | 20 |
| 2026-W16 (2026-04-13) | 4 | 4 | 37 | 33 | 33 | 12 | 25 |
| 2026-W17 (2026-04-20) | 5 | 5 | 4 | 4 | 3 | 3 | 1 |
| 2026-W18 (2026-04-27) | 4 | 4 | 4 | 4 | 4 | 4 | 0 |
| 2026-W19 (2026-05-04) | 5 | 5 | 26 | 20 | 24 | 7 | 19 |
| 2026-W20 (2026-05-11) | 5 | 5 | 16 | 14 | 16 | 6 | 10 |
| 2026-W21 (2026-05-18) | 5 | 5 | 9 | 7 | 9 | 3 | 6 |
| 2026-W22 (2026-05-25) | 4 | 4 | 19 | 17 | 13 | 6 | 13 |
| 2026-W23 (2026-06-01) | 5 | 5 | 12 | 11 | 11 | 3 | 9 |
| 2026-W24 (2026-06-08) | 5 | 5 | 17 | 17 | 16 | 10 | 7 |
| 2026-W25 (2026-06-15) | 5 | 5 | 30 | 26 | 29 | 10 | 20 |
| 2026-W26 (2026-06-22) | 4 | 4 | 5 | 5 | 5 | 1 | 4 |
| 2026-W27 (2026-06-29) | 5 | 5 | 21 | 18 | 20 | 5 | 16 |
| 2026-W28 (2026-07-06) | 5 | 5 | 24 | 23 | 21 | 5 | 19 |
| 2026-W29 (2026-07-13) | 5 | 5 | 20 | 16 | 20 | 4 | 16 |
| 2026-W30 (2026-07-20) | 5 | 5 | 3 | 3 | 3 | 1 | 2 |
| 2026-W31 (2026-07-27) | 5 | 5 | 24 | 23 | 22 | 5 | 19 |
| 2026-W32 (2026-08-03) | 5 | 5 | 32 | 27 | 31 | 5 | 27 |
| 2026-W33 (2026-08-10) | 5 | 5 | 8 | 6 | 8 | 1 | 7 |
| 2026-W34 (2026-08-17) | 5 | 5 | 4 | 4 | 3 | 0 | 4 |
| 2026-W35 (2026-08-24) | 5 | 5 | 21 | 16 | 19 | 7 | 14 |
| 2026-W36 (2026-08-31) | 5 | 4 | 21 | 19 | 19 | 0 | 21 |
| 2026-W37 (2026-09-07) | 5 | 0 | MISSING / UNVERIFIED | — | — | — | — |
| 2026-W38 (2026-09-15) | 4 | 0 | MISSING / UNVERIFIED | — | — | — | — |
| 2026-W39 (2026-09-21) | 4 | 0 | MISSING / UNVERIFIED | — | — | — | — |

## Table 8 — Most frequently caught stocks (top 25 of 192; full ranking in workbook)

| Rank | Symbol | Company | Catch-days | Events | First | Last | Latest return % (last catch → now) |
|---|---|---|---|---|---|---|---|
| 1 | IOC | Indian Oil Corporation Limited | 18 | 15 | 2025-10-06 | 2026-07-16 | -5.98 |
| 2 | DELHIVERY | Delhivery Limited | 15 | 12 | 2025-10-03 | 2026-07-10 | -21.68 |
| 3 | ALKEM | Alkem Laboratories Limited | 12 | 11 | 2025-11-07 | 2026-08-28 | -3.36 |
| 4 | DIVISLAB | Divi's Laboratories Limited | 12 | 9 | 2025-10-01 | 2026-08-28 | 3.37 |
| 5 | BIOCON | Biocon Limited | 11 | 10 | 2025-10-14 | 2026-07-03 | -12.16 |
| 6 | NTPC | NTPC Limited | 11 | 8 | 2025-10-29 | 2026-08-05 | -8.23 |
| 7 | TECHM | Tech Mahindra Limited | 11 | 10 | 2025-10-06 | 2026-08-28 | -6.01 |
| 8 | 360ONE | 360 ONE WAM LIMITED | 10 | 10 | 2025-10-15 | 2026-08-05 | -12.33 |
| 9 | BRITANNIA | Britannia Industries Limited | 10 | 7 | 2025-11-06 | 2026-07-29 | -10.92 |
| 10 | ICICIPRULI | ICICI Prudential Life Insurance Company Limited | 10 | 10 | 2025-11-12 | 2026-08-31 | -11.29 |
| 11 | PHOENIXLTD | The Phoenix Mills Limited | 10 | 9 | 2025-10-16 | 2026-07-03 | -4.66 |
| 12 | PIDILITIND | Pidilite Industries Limited | 10 | 9 | 2025-10-08 | 2026-07-17 | -4.03 |
| 13 | CHOLAFIN | Cholamandalam Investment and Finance Company Limited | 9 | 8 | 2025-11-04 | 2026-08-06 | -15.76 |
| 14 | GMRAIRPORT | GMR AIRPORTS LIMITED | 9 | 8 | 2025-10-29 | 2026-05-29 | -5.60 |
| 15 | HDFCLIFE | HDFC Life Insurance Company Limited | 9 | 7 | 2025-11-26 | 2026-08-05 | -2.46 |
| 16 | NAM-INDIA | Nippon Life India Asset Management Limited | 9 | 8 | 2026-04-01 | 2026-08-19 | -10.12 |
| 17 | NMDC | NMDC Limited | 9 | 7 | 2025-10-03 | 2026-08-05 | -9.76 |
| 18 | SBIN | State Bank of India | 9 | 7 | 2025-10-31 | 2026-06-03 | -0.87 |
| 19 | TORNTPHARM | Torrent Pharmaceuticals Limited | 9 | 6 | 2025-10-06 | 2026-08-31 | -3.89 |
| 20 | AUROPHARMA | Aurobindo Pharma Limited | 8 | 7 | 2025-11-14 | 2026-08-31 | -1.14 |
| 21 | HINDUNILVR | Hindustan Unilever Limited | 8 | 7 | 2025-10-17 | 2026-07-09 | -11.59 |
| 22 | LAURUSLABS | Laurus Labs Limited | 8 | 6 | 2025-10-14 | 2026-08-27 | 4.21 |
| 23 | LUPIN | Lupin Limited | 8 | 6 | 2025-10-31 | 2026-07-29 | -15.73 |
| 24 | MOTHERSON | Samvardhana Motherson International Limited | 8 | 7 | 2025-11-12 | 2026-07-31 | 7.71 |
| 25 | NYKAA | FSN E-Commerce Ventures Limited | 8 | 6 | 2026-02-10 | 2026-07-30 | -2.47 |

IOC catch dates: 2025-10-06, 10-09, 10-15, 11-11, 12-12, 12-17, 12-31, 2026-01-28, 02-02, 02-03, 02-04, 02-25, 02-27, 06-15, 07-02, 07-07, 07-15, 07-16. Every stock's full date list is in sheet T3_StockFrequency.

## Table 9 — Best and worst catches (raw, unadjusted; ⚠ = corporate-action heuristic flag)

| # | Symbol | Catch date | Catch | Current | Return % | |
|---|---|---|---|---|---|---|
| **TOP 20 RISING** | | | | | | |
| 1 | LAURUSLABS | 2025-10-14 | 877.95 | 2,010.70 | 129.02 |  |
| 2 | LAURUSLABS | 2025-11-26 | 986.60 | 2,010.70 | 103.80 |  |
| 3 | LAURUSLABS | 2026-05-04 | 1,166.40 | 2,010.70 | 72.39 |  |
| 4 | LAURUSLABS | 2026-05-06 | 1,177.60 | 2,010.70 | 70.75 |  |
| 5 | DIVISLAB | 2025-10-01 | 5,710.00 | 9,550.00 | 67.25 |  |
| 6 | LAURUSLABS | 2026-05-07 | 1,206.50 | 2,010.70 | 66.66 |  |
| 7 | SONACOMS | 2025-12-12 | 492.50 | 807.90 | 64.04 |  |
| 8 | DIVISLAB | 2025-10-03 | 5,866.00 | 9,550.00 | 62.80 |  |
| 9 | SONACOMS | 2025-12-19 | 496.80 | 807.90 | 62.62 |  |
| 10 | SONACOMS | 2026-03-17 | 502.10 | 807.90 | 60.90 |  |
| 11 | LODHA | 2026-04-02 | 696.05 | 1,117.10 | 60.49 |  |
| 12 | LODHA | 2026-04-06 | 710.25 | 1,117.10 | 57.28 |  |
| 13 | MOTHERSON | 2025-11-12 | 105.92 | 162.37 | 53.29 |  |
| 14 | FEDERALBNK | 2025-10-13 | 213.02 | 325.00 | 52.57 |  |
| 15 | SONACOMS | 2026-02-03 | 530.20 | 807.90 | 52.38 |  |
| 16 | SONACOMS | 2026-04-08 | 533.70 | 807.90 | 51.38 |  |
| 17 | MOTHERSON | 2026-04-01 | 107.62 | 162.37 | 50.87 |  |
| 18 | FEDERALBNK | 2025-10-14 | 215.44 | 325.00 | 50.85 |  |
| 19 | DIVISLAB | 2025-10-10 | 6,474.50 | 9,550.00 | 47.50 |  |
| 20 | DIVISLAB | 2025-10-13 | 6,556.00 | 9,550.00 | 45.67 |  |
| **BOTTOM 20 FALLING** | | | | | | |
| 1 | CAMS | 2025-10-06 | 3,825.50 | 691.55 | -81.92 | ⚠ |
| 2 | KOTAKBANK | 2025-10-16 | 2,205.40 | 401.55 | -81.79 | ⚠ |
| 3 | NUVAMA | 2025-11-28 | 7,462.50 | 1,640.60 | -78.02 | ⚠ |
| 4 | HDFCAMC | 2025-10-03 | 5,591.00 | 2,302.30 | -58.82 | ⚠ |
| 5 | HDFCAMC | 2025-10-10 | 5,520.00 | 2,302.30 | -58.29 | ⚠ |
| 6 | LICI | 2025-11-03 | 919.90 | 400.65 | -56.45 | ⚠ |
| 7 | LICI | 2025-12-18 | 847.40 | 400.65 | -52.72 | ⚠ |
| 8 | VEDL | 2025-12-12 | 543.60 | 259.00 | -52.35 | ⚠ |
| 9 | VEDL | 2025-10-03 | 470.95 | 259.00 | -45.00 | ⚠ |
| 10 | SYNGENE | 2025-11-12 | 663.85 | 376.00 | -43.36 |  |
| 11 | SYNGENE | 2025-12-12 | 647.00 | 376.00 | -41.89 |  |
| 12 | IRCTC | 2025-10-29 | 730.65 | 453.50 | -37.93 |  |
| 13 | POLICYBZR | 2026-05-20 | 1,830.00 | 1,151.30 | -37.09 | ⚠ |
| 14 | POLICYBZR | 2025-11-17 | 1,815.70 | 1,151.30 | -36.59 | ⚠ |
| 15 | POLICYBZR | 2026-05-19 | 1,804.80 | 1,151.30 | -36.21 | ⚠ |
| 16 | WIPRO | 2025-10-15 | 250.21 | 161.56 | -35.43 |  |
| 17 | PATANJALI | 2025-10-29 | 604.70 | 390.80 | -35.37 |  |
| 18 | ITC | 2025-10-16 | 405.15 | 265.20 | -34.54 |  |
| 19 | POLICYBZR | 2026-05-18 | 1,748.30 | 1,151.30 | -34.15 | ⚠ |
| 20 | IRCTC | 2025-12-22 | 681.65 | 453.50 | -33.47 |  |

## Final summary

1. Total confirmed catches: 852 catch-days (769 events), 2025-10-01 → 2026-09-03.
2. Unique stocks: 192.
3. Most frequently caught: IOC, 18 catch-days in 15 events. DELHIVERY is next with 15.
4. Highest single day: 2026-04-08 with 26 confirmed catches.
5. Lowest among verified sessions: 0 confirmed catches, on 60 of the 229 verified sessions (these are verified zeros).
6. Monthly: Oct-25 91, Nov 49, Dec 50, Jan-26 109, Feb 84, Mar 40, Apr 117, May 70, Jun 66, Jul 90, Aug 79, Sep (1–3 only) 7. Sep-25 had only one verified session, with 0.
7. Weekly: 56 ISO weeks in the period, 49 with at least one verified session. Busiest week 2026-W15 with 49 catches. Quietest verified weeks had 1 (2025-W43, 2025-W52, 2026-W13). Full list in Table 5.
8. Daily: mean 3.72 and median 2 confirmed per verified session. Top days: 04-08 (26), 02-03 (18), 04-15 (17), 01-06 (17), 04-17 (16).
9. Currently risen: 34.32% (291 of 848 priced).
10. Currently fallen: 65.68% (557 of 848).
11. Unchanged: 0.00%.
12. No current data: 0.47% of all catches (4 of 852, all LTIM).
13. Best raw catch: LAURUSLABS 2025-10-14 at 877.95 → 2,010.70 (+129.02%).
14. Worst raw catch: CAMS 2025-10-06 at 3,825.50 → 691.55 (−81.92%), flagged as a suspected corporate-action discontinuity. Worst unflagged: SYNGENE 2025-11-12 at 663.85 → 376.00 (−43.36%).

## Final safety check

NO CODE CHANGED · NO V15 RULE CHANGED · NO DATA MODIFIED · NO REPLAY PERFORMED · NO NEW REPOSITORY CREATED · NO PUSH/COMMIT/PR/MERGE PERFORMED · NO FUTURE DATA USED TO DETERMINE HISTORICAL V15 CONFIRMATIONS · NO MISSING DATA TREATED AS ZERO · NO PRICES INVENTED · NO CATCH EVENTS INVENTED

Work was done on a scratch extraction of the zip; the uploaded file was not altered. Streak middle days are derived from recorded dates, not from price data.