# VIKRAM Backtest Pipeline — Current Status

## Canonical authority
The production VIKRAM scoring authority is the canonical JavaScript accumulation engine:

`accumulation/engine.js`

No Python placeholder or synthetic adapter may be used to claim VIKRAM performance.

## Current status
- Backtest infrastructure: **IMPLEMENTED**
- Canonical VIKRAM engine: **EXISTS IN REPOSITORY**
- Real multi-year NSE dataset: **NOT YET EXECUTED/VERIFIED**
- Real 5+ year VIKRAM backtest: **NOT EXECUTED**
- Statistical validation: **NOT COMPLETE**
- Synthetic fixtures: **TEST ONLY**

## Cross-Claude reference
`backtest/reference-python/` preserves useful engineering patterns from a standalone Claude contribution, including a hard-fail engine bridge and provenance checks. It is explicitly **NON-PRODUCTION** and does not replace the canonical JavaScript engine.

## Honesty gates
A real historical result requires all required evidence to be present. The system must distinguish:

- `CODE_READY`
- `DATA_READY`
- `ENGINE_INTEGRATED`
- `PIT_UNIVERSE_READY`
- `CORPORATE_ACTIONS_READY`
- `BACKTEST_EXECUTED`
- `ASM_READY`
- `STATISTICAL_VALIDATION_COMPLETE`
- `PRODUCTION_VERIFIED`

Code existing does not make a gate PASS. Synthetic results are never market evidence.

## Integrity controls
The canonical downloader work also requires:
- actual HTTP `attempts` and `retry_count` accounting;
- SHA-256 verification before trusting a resumed `SUCCESS + VALID` file;
- corrupted/missing files must not be silently skipped;
- no fabricated NSE data when network access is blocked.

## Real backtest sequence

```text
REAL HISTORICAL NSE DATA
        ↓
VALIDATION / PROVENANCE
        ↓
POINT-IN-TIME UNIVERSE
        ↓
CORPORATE-ACTION CONTROLS
        ↓
accumulation/engine.js
        ↓
IMMUTABLE T0/P0 EVENTS
        ↓
FORWARD RETURNS
        ↓
ASM
        ↓
STATISTICAL VALIDATION
```

Until the real historical dataset has actually been processed through the canonical engine, VIKRAM must not report a five-year performance figure.
