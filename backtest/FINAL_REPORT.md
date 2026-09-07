# VIKRAM Backtest Pipeline — Updated Final Report

## Executive status

| Component | Status |
|---|---|
| Pipeline architecture | COMPLETE |
| Synthetic software tests | COMPLETE |
| Real NSE acquisition | NOT EXECUTED |
| Real NSE historical dataset | NOT ACQUIRED |
| Production VIKRAM engine integration | NOT EXECUTED |
| Real VIKRAM backtest | NOT EXECUTED |
| 1D/5D/20D/60D/120D real results | NOT AVAILABLE |
| Point-in-time universe | NOT VERIFIED |
| Corporate-action handling | NOT VERIFIED |
| Official NSE holiday/session dataset | NOT VERIFIED |

## Critical correction

Any synthetic adapter is a test harness only. Its signals, returns, win rates, and detection statistics must never be described as VIKRAM market performance.

The package must refuse to label a run as a real VIKRAM backtest unless:
1. real NSE data is present and provenance is recorded;
2. the production VIKRAM engine is actually injected;
3. chronological processing is executed;
4. required forward horizons are calculated from real future sessions; and
5. the run manifest proves the underlying data.

## Required production inputs

- Equity OHLC, previous close, last price, volume
- Delivery quantity and delivery percentage
- F&O expiry, close, OI, change OI where applicable
- Official NSE trading-session calendar
- Point-in-time historical universe, if available
- Corporate-action information or an explicit documented limitation

## Synthetic mode

Synthetic fixtures are retained solely for testing and must be visibly marked `SYNTHETIC_TEST_ONLY`.
