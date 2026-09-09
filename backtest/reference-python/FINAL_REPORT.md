# VIKRAM Historical Backtest — Cross-Claude Reference Status

## Current truth

- Downloader integrity remediation: implemented and tested in the standalone reference pipeline.
- Real-engine bridge contract: implemented and tested against an explicitly labeled test fixture.
- Real canonical VIKRAM `accumulation/engine.js` execution from the standalone Python package: NOT EXECUTED.
- Real NSE historical data: NOT EXECUTED in that environment.
- Real 5+ year VIKRAM backtest: NOT EXECUTED.
- Statistical validation: NOT COMPLETE.

## Important architecture rule

The Python package is reference/audit infrastructure only. The canonical VIKRAM scoring authority remains the JavaScript `accumulation/engine.js` in the parent repository. The Python `default_adapter` is a placeholder and must never be used for VIKRAM performance claims.

## Evidence boundary

The reference tests prove the bridge mechanism can locate/hash a configured JavaScript engine, invoke Node.js, pass JSON, and reject missing/malformed engine execution. They do not prove the real VIKRAM engine was executed and do not constitute a market backtest.

## Required for the real backtest

1. Genuine multi-year NSE historical data with provenance.
2. Point-in-time universe membership where required.
3. Historical corporate-action controls/data.
4. Execution of the canonical VIKRAM accumulation engine.
5. Immutable T0/P0 events and downstream forward-return/ASM validation.

No synthetic result in this reference package is evidence of real VIKRAM performance.
