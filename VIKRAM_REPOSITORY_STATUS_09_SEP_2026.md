# VIKRAM REPOSITORY STATUS — 09 SEP 2026

## Current baseline

Latest repository update sequence completed directly on `main`.

## Implemented in this update

1. `backtest/asm.js`
   - ASM validation layer
   - immutable T0/P0 event input
   - +1/+5/+20/+60/+120 trading-session outcomes
   - forward return
   - benchmark-relative return when benchmark data exists
   - MFE / MAE / maximum drawdown
   - sample-size / hit-rate summary
   - insufficient-history handling

2. `backtest/asm.test.js`
   - regression coverage for ASM behavior

3. `backtest/nse5y/README.md`
   - five-year pipeline status and integrity contract

4. `backtest/nse5y/engine_adapter.js`
   - canonical bridge to the real repository `accumulation/engine.js`
   - no substitute strategy

5. `allocation/engine.js`
   - transparent risk-based position sizing foundation
   - optional caller-supplied maximum allocation cap
   - no frozen strategy allocation percentages

6. `allocation/engine.test.js`
   - sizing, cap and invalid-input tests

7. `VIKRAM_MASTER_ADDENDUM_09_SEP_2026.md`
   - project-wide master requirements/status

8. `VIKRAM_ROADMAP_ADDENDUM_09_SEP_2026.md`
   - implementation sequence and release gates

## NOT COMPLETE / NOT CLAIMED

- Genuine five-year NSE dataset has not been proven/acquired in this environment.
- A real five-year VIKRAM performance backtest has not been executed.
- Point-in-time NIFTY membership is not yet proven end-to-end.
- Corporate-action adjustment is not yet proven end-to-end.
- Hidden Gems production implementation still requires reconciliation of its legacy paths and historical validation.
- Hidden Gems thresholds/weights remain REQUIRES BACKTESTING.
- ASM historical results are not claimed until genuine historical data and actual VIKRAM engine execution are completed.
- Portfolio allocation policy/weights are not frozen.
- Provider/device/production UI verification remains pending.
- Root package-lock reproducibility remains pending.

## Integrity rule

Synthetic data may be used for software tests only. No synthetic performance figure is a VIKRAM result.

## Verification performed for this update

The ASM implementation was executed against deterministic test bars and passed. The actual VIKRAM accumulation engine was also verified as importable through the new backtest adapter.

The repository remains intentionally honest: **code added does not equal research validation completed**.
