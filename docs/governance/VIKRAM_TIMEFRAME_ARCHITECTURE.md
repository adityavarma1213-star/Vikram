# VIKRAM TIMEFRAME ARCHITECTURE — canonical semantics

## Finding (this audit)
`server/src/index.js`'s `PERIOD_ROWS` (`{'1D':1,'1W':5,'1M':22,'3M':66,'6M':132,'1Y':252}`) and
`liveScan()`/`scan()` use these labels to mean **"evaluate the CURRENT/latest available trading
date using this many trailing trading sessions of context."** They do **not** mean "show me what
the situation was N calendar periods ago" — there is no code path today that evaluates a verdict
AS OF a historical date using that date's own trailing window. Confirmed by reading the query:
`liveScan()` always orders by `trade_date DESC` and takes the most recent `rowsNeeded` rows, then
evaluates the LAST (i.e. latest) row as `current`.

No live frontend control currently exposes these period labels to a user (no `<select>` for
period found in `index.html`), so there is currently no user-facing mislabeling risk. This is a
**latent** risk should a period selector be added later without carrying this distinction forward
— documented here so that doesn't happen silently.

## Canonical definitions (do not silently redefine)
- **Current verdict, N-session lookback** (what `PERIOD_ROWS` actually computes): the verdict for
  the most recent trading date, computed using the trailing N trading sessions of history as
  input to the accumulation engine. Labels like `1Y` here mean "used ~252 trailing sessions of
  context," not "as of one year ago."
- **Historical snapshot, as of date T**: a verdict that WOULD have been produced using only data
  available up to and including trading date T (look-ahead-safe). This is what
  `backtest/backtestRunner.js`'s event detection and `server/src/detectionHistory.js`'s backward
  walk actually do — each historical day is evaluated using only that day's own trailing window,
  never today's window. `server/src/historicalVerdictStore.js` (new this pass) is the correct
  place to persist these, keyed by `(symbol, tradeDate, engineVersion, configVersion)`.
- **Detection streak / "Caught for X trading days"**: neither of the above — it's a COUNT of
  consecutive trading sessions for which the historical-snapshot verdict was
  `ACCUMULATION CONFIRMED`, walking backward from the latest date until the first non-confirming
  session. See `server/src/detectionHistory.js`.

## Guardrail
If a period selector is ever exposed in the UI, its label copy MUST say "using trailing N
sessions," never "N ago" or "historical N snapshot" — the latter would misrepresent a current
lookback-window verdict as a historical point-in-time one. `server/src/timeframeLabels.js` (new
this pass) centralizes the only approved label text so this can't drift page-by-page.
