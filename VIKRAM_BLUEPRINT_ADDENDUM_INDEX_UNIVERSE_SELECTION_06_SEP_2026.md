# VIKRAM BLUEPRINT ADDENDUM — INDEX UNIVERSE SELECTION

**Updated: 06 September 2026**

This addendum is part of the VIKRAM Master Blueprint.

## Requirement

Every major VIKRAM scanner must allow the user to choose which validated stock universe is scanned.

### Options

- **ALL STOCKS** — all stocks in VIKRAM's validated supported universe
- **NIFTY 50** — only Nifty 50 constituents
- **NIFTY 200** — only Nifty 200 constituents
- **NIFTY 500** — only Nifty 500 constituents

## User experience

The selector should be simple and clickable:

`ALL STOCKS  |  NIFTY 50  |  NIFTY 200  |  NIFTY 500`

Changing the selection immediately updates the scan. No Apply button is required.

The selector should be visible near the top of:

- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- Option B Rule Builder / Scanner
- future scanner presets

## Results context

Every scan must retain the selected universe in its result context.

Example:

> **NIFTY 200** • EOD VERIFIED • 05 Sep 2026 • 200 constituents checked

This prevents users from confusing a Nifty-only scan with a full-market scan.

## Historical correctness

Index membership is time-dependent. For historical detection, backtesting, streaks, or historical scanner results, VIKRAM must use the constituent list effective on the relevant EOD date. It must not use today's index constituents to manufacture historical results.

Required constituent data should therefore support:

```text
indexName
symbol
effectiveFrom
effectiveTo
source
sourceDate
status
```

If a requested constituent list is unavailable or unverified, VIKRAM must show `DATA N/A` and must not claim that the index was scanned.

## Interaction with detection streaks

Streaks are calculated inside the selected universe context.

For example, a stock can be:

- caught for 8 days in ALL STOCKS
- caught for 5 days in NIFTY 200
- newly qualifying in NIFTY 50

These are separate scan contexts and must not be mixed.

## Interaction with alerts and saved scans

A saved scan must store its universe selection. Alerts must also retain the universe context so a notification can clearly say, for example:

> NIFTY 500 — Hidden Gem — Caught for 7 trading days

Changing the selector must never change the underlying VIKRAM scoring formulas or data; it only changes the population being evaluated.

## Data integrity

Only validated constituent datasets may drive the selector. Never infer Nifty membership from market-cap ranking at runtime and never fabricate membership when official/authorized constituent data is unavailable.
