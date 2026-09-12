# QUARANTINED — alternate accumulation engine candidate, NOT active

SHA-256: 9ee6f818... (differs from canonical ae6a8f1f6698fc41d16d7c15800ca7f406361f3f6ef06bc3e04dd43287fedf58)

Found in: vikram-implemented_3_.zip, vikram-implemented_4_.zip, vikram-post-accumulation-implemented*.zip,
vikram-5year-data-handoff-spec.zip, vikram-5year-backtest-pipeline.zip (all forensically audited this pass).

## What's different from canonical
Adds genuine four-quadrant OI logic (LONG_BUILDUP/SHORT_BUILDUP/SHORT_COVERING/LONG_UNWINDING)
replacing canonical's simpler binary positive/negative OI scoring, plus a secondary (non-scored)
A/D confirmation line requiring real High/Low, plus a corporate-action discontinuity guard that
routes implausible price jumps to DATA N/A instead of scoring them.

## Why this is NOT active
These additions align with Blueprint §8's stated requirements (four-quadrant OI, A/D as secondary
signal, High/Low survival) — but they are also a genuine, substantive change to the scoring
methodology, not a pure bug fix. Per the standing project rule ("do not modify the canonical
engine merely to obtain better results" / "preserve the verified canonical engine unless there is
hard forensic evidence that another version IS the actual canonical engine"), evidence that a
version better matches blueprint prose is not the same as evidence of authorization/provenance.
This is a human decision, not one to make unilaterally inside a merge task.

## Recommendation
If you confirm this version should become canonical, promote it explicitly and re-run the full
backtest under the new engine — do not silently blend results from both engines.
