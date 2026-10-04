# Recovered V15 historical report (replay of the FROZEN engine)

Label key: **PROVEN** (reproduced and checked), **RECOVERED** (value rebuilt from stored inputs), **DATA_INSUFFICIENT** (inputs not good enough, nothing invented), **UNKNOWN**, **INFERENCE**.
This is a separate output. `backtest/REAL_1YEAR_BACKTEST_RESULT.json` and the original report are untouched.

## Baseline reconciliation (PROVEN)
- Original report: 852 catch-days, 769 events, 192 symbols.
- Recovered replay: 888 catch-days, 193 symbols.
- All 852 original catch-days reproduce. Only in original: 0. Only in recovered: 36. Unexpected: 0.
- Delivery, OI and change-in-OI agree on every matched row (0 mismatches).
- The 36 extra catch-days all fall on 2026-09-04, 2026-09-07, 2026-09-08, 2026-09-09, 2026-09-10, 2026-09-11, 2026-09-16, 2026-09-17, 2026-09-18, 2026-09-21, 2026-09-22, 2026-09-23, after the original report's last verdict (2026-09-03). The original saw zero-filled delivery or no stored run for those dates. See `RECOVERED_V15_BASELINE_DIFFERENCES.csv`.
- 913 / 193 from the earlier run is NOT reproduced (INFERENCE: it came from a different data state); nothing was adjusted to match.

## Telemetry recovery (RECOVERED)
score, volumeRatio, OBV, OBV trend, delivery %, futures OI and change-in-OI are present on 888/888 catch-days. They are the frozen engine's own decision-time outputs on the stored data. Every confirmed row satisfies score >= 75 and all gates.

## Performance
ORIGINAL REPORT (untouched):

| Horizon | Computed / sample | Win % | Avg % |
|---|---|---|---|
| 1D | 769 / 769 | 49.54 | 0.07 |
| 5D | 769 / 769 | 46.68 | 0.11 |
| 20D | 728 / 769 | 48.49 | 0.59 |
| 60D | 600 / 769 | 48.17 | 0.65 |
| 120D | 360 / 769 | 41.94 | -1.8 |

RECOVERED, same 769 first detections, exits capped at 2026-09-15 (the original run's price-data end) (PROVEN: matches the original on every horizon):

| Horizon | Computed / sample | Win % | Avg % | Median % | Avg MFE % | Avg MAE % |
|---|---|---|---|---|---|---|
| 1D | 769 / 769 | 49.54 | 0.07 | -0.01 | 0.07 | 0.07 |
| 5D | 769 / 769 | 46.68 | 0.11 | -0.23 | 1.99 | -1.86 |
| 20D | 728 / 769 | 48.49 | 0.59 | -0.23 | 5.52 | -4.66 |
| 60D | 600 / 769 | 48.17 | 0.65 | -0.51 | 10.5 | -9.61 |
| 120D | 360 / 769 | 41.94 | -1.8 | -3.46 | 13.29 | -15.94 |

RECOVERED, same detections with all price data now stored (to 2026-09-28). The long horizons differ only because more exits are now computable:

| Horizon | Computed / sample | Win % | Avg % | Median % | Avg MFE % | Avg MAE % |
|---|---|---|---|---|---|---|
| 1D | 769 / 769 | 49.54 | 0.07 | -0.01 | 0.07 | 0.07 |
| 5D | 769 / 769 | 46.68 | 0.11 | -0.23 | 1.99 | -1.86 |
| 20D | 748 / 769 | 48.26 | 0.51 | -0.31 | 5.45 | -4.68 |
| 60D | 624 / 769 | 47.44 | 0.47 | -0.75 | 10.36 | -9.61 |
| 120D | 398 / 769 | 42.96 | -0.77 | -2.91 | 14.45 | -15.04 |

RECOVERED, all 803 signals including those first detected after 2026-09-03:

| Horizon | Computed / sample | Win % | Avg % | Median % | Avg MFE % | Avg MAE % |
|---|---|---|---|---|---|---|
| 1D | 803 / 803 | 49.07 | 0.04 | -0.03 | 0.04 | 0.04 |
| 5D | 801 / 803 | 46.69 | 0.11 | -0.25 | 1.97 | -1.86 |
| 20D | 748 / 803 | 48.26 | 0.51 | -0.31 | 5.45 | -4.68 |
| 60D | 624 / 803 | 47.44 | 0.47 | -0.75 | 10.36 | -9.61 |
| 120D | 398 / 803 | 42.96 | -0.77 | -2.91 | 14.45 | -15.04 |

MFE / MAE are close-to-close (no intraday high/low is stored). Corporate-action status is UNKNOWN (no verified source); prices were not adjusted.

## Session status
- DATA_INSUFFICIENT (20): the first 20 sessions of the replay window (2025-09-02 to 2025-09-29), where no symbol has the 20-day history V15 needs. Same as the original.
- NOT_RUN (13): non-trading days removed by the stale-duplicate detector.
- Other sessions: verified with confirmations or verified with zero confirmations.
- Sep 25 and Sep 28: the replay matches the committed scanner outputs (0 confirmed, same STARTING lists on the common universe). Those two days are real zero-confirmation days, not a data failure.

## Live-snapshot era (2026-09-04 to 2026-09-28), from git history
Snapshots rebuilt from committed scanner.json versions (label RECONSTRUCTED_FROM_GIT): Sep 4 to Sep 15 are DATA_INSUFFICIENT (zero-filled delivery); Sep 25 and Sep 28 are VERIFIED_ZERO_CONFIRMATIONS. Sep 16 to Sep 24 have no stored scan: MISSING_SNAPSHOT, not zero.
