# VIKRAM MASTER ADDENDUM — 09 SEP 2026

This addendum is project-wide and supplements the existing Master Blueprint. It records the Claude/Gemini/Copilot work reconciled into the repository without claiming unverified research results.

## 1. Five-Year NSE Historical Data Foundation

VIKRAM requires a reusable minimum five-year verified NSE historical archive, preferably 5–7 years where legally and technically available. The pipeline must be resumable, idempotent, provenance-preserving and continuously extensible.

Required flow:

`authorized NSE/source → immutable raw archive → checksum/provenance → validation → normalization → security identity/corporate-action controls → point-in-time universe → derived metrics → chronological VIKRAM engine → research/backtest → ASM`

Real five-year NSE data is **NOT VERIFIED/NOT COMPLETED** in the current execution environment. No synthetic result may be presented as real performance.

## 2. Actual VIKRAM Engine Integration

The historical pipeline now contains `backtest/nse5y/engine_adapter.js`, which calls the repository's actual `accumulation/engine.js`. It is a bridge, not a replacement strategy.

The existing accumulation mathematics remains protected. Any future historical run must execute this actual engine rather than a simplified placeholder.

## 3. ASM — Accumulation Success Matrix

ASM is a downstream validation/research layer. It is not a signal generator and not a BUY engine.

The repository now contains `backtest/asm.js` with:

- immutable event inputs: symbol + T0 + P0
- +1/+5/+20/+60/+120 trading-session outcomes
- forward return
- benchmark-relative return when benchmark data is supplied
- MFE
- MAE
- maximum drawdown over the observed outcome window
- sample-size and hit-rate summary utilities
- explicit insufficient-history handling

ASM does not invent future prices. Unavailable horizons remain unavailable.

## 4. Hidden Gems

The approved research architecture remains:

`Accumulation → Opportunity → Stealth → Market Recognition → Institutional Recognition → Data Confidence → T0/P0 → HGI → Classification → Lead-Time → ASM`

The current production Hidden Gems UI must not be declared a completed independent early-discovery engine until its conflicting legacy implementations are reconciled and historical validation passes.

All HGI weights, stealth/recognition thresholds, lead-time thresholds, liquidity thresholds and confidence cutoffs remain `REQUIRES BACKTESTING`.

NIFTY membership is context, not a hard exclusion or automatic penalty.

## 5. Allocation

The repository now contains `allocation/engine.js` as a transparent risk-based position-sizing foundation. It calculates share quantity from capital, risk percentage, entry and stop, with an optional caller-supplied maximum allocation cap.

This is deliberately **not** a frozen portfolio-allocation strategy. No unvalidated allocation percentages or portfolio weights are claimed as approved VIKRAM policy.

## 6. Non-Negotiable Research Integrity

- No fake NSE history.
- No fabricated detection dates/prices.
- No fabricated ownership or recognition data.
- No today's index membership substituted for historical membership.
- No synthetic performance presented as real.
- No production threshold freeze before walk-forward/out-of-sample validation.
- ASM remains validation, not signal generation.

## 7. Remaining Gates

`DATA-5Y`, `DATA-PIPE`, `UNIVERSE-PT`, `CORP-ACTION`, `ASM-1`, `ASM-2`, `HG-0..HG-6`, production UI/browser evidence, provider tests, reproducible dependency lock and final no-fabrication audit remain release gates.

This addendum is part of the repository's decision record and must not be deleted merely because an item is not yet production-complete.
