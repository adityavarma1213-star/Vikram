# Hidden Gems — STATUS: NOT IMPLEMENTED

This directory contains design/specification documents only. As of this merge
(Sep 2026), there is **no Hidden Gems engine anywhere in the VIKRAM codebase**
— confirmed by direct search across every artifact reconciled into this
repository (main app, backtest package, both Python backtest-pipeline
uploads). No stealth detection, market-recognition, institutional-recognition,
T0/P0 lead-time tracking, HGI scoring, or classification logic exists as code.

## What's here
- `HIDDEN_GEMS_ALGORITHM_SPEC.md` — the design specification.
- `HIDDEN_GEMS_OPEN_DECISIONS.md` — an explicit list of unresolved product
  decisions and missing data sources that must be resolved *before* any
  implementation can safely begin (NIFTY-tier treatment, institutional-data
  source, numeric thresholds — every single threshold in the spec is marked
  "REQUIRES BACKTESTING", not a ready-to-use number).
- `VIKRAM_HIDDEN_GEMS_ASM_IMPLEMENTATION_BLUEPRINT.md` — architecture
  reference for how Hidden Gems is meant to connect to ASM once both exist.

## Why nothing was built here during this merge
The open-decisions document is explicit that several product decisions need
a human call (not just data) and that every numeric threshold requires a
real walk-forward backtest to set responsibly. Inventing thresholds, weights,
or classification cutoffs to make this "look done" would violate the
project's own no-fabrication rule. Per this merge's instructions: if an open
decision prevents safe production implementation, it stays explicitly OPEN
rather than being silently guessed.

## What's required before implementation can start
1. Resolve the product decisions in §1 of `HIDDEN_GEMS_OPEN_DECISIONS.md`.
2. Acquire the missing data sources in §2 (point-in-time index membership,
   real institutional holding time series, a real news/attention feed,
   benchmark price series, corporate-action data, survivorship-complete
   universe).
3. Run the walk-forward process described in the algorithm spec to set every
   threshold currently marked "REQUIRES BACKTESTING" — this requires real,
   multi-year NSE data, which this environment could not acquire (see
   `backtest/AUDIT.md` and `backtest/reports/live_network_probe_result.txt`).
