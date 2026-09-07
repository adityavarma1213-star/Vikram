# Reproducibility

## Required evidence
A real run must record:
- code version / commit
- exact configuration
- source URLs
- dataset checksums
- requested and actual date range
- actual trading sessions
- universe method
- validation results
- missing-data policy
- corporate-action policy
- transaction-cost assumptions
- execution environment

## Production gate
A report may say `REAL VIKRAM BACKTEST: COMPLETE` only when the manifest proves real market data was acquired and the production VIKRAM engine was executed.

Otherwise the status must remain `NOT EXECUTED`, `PARTIALLY COMPLETE`, or `NOT VERIFIED`.
