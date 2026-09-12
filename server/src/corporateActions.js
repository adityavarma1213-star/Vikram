'use strict';
// Corporate-action price adjustment.
//
// A stock split/bonus changes the share count without changing the underlying value, so raw
// historical prices before the ex-date must be scaled down (or volume scaled up) to be
// comparable with prices after it. Without this, a 1:1 bonus looks like a 50% crash to any
// naive backtest.
//
// This module computes adjustment factors ONLY from actions actually present in the
// `corporate_actions` table (see schema.sql) — it never invents a split/bonus/dividend record.
// With zero actions recorded (the current real state — see
// docs/hidden-gems/HIDDEN_GEMS_OPEN_DECISIONS.md §2.5), every adjustment factor is exactly 1.0
// and every row is honestly reported as `pricesAdjusted: false, adjustmentSource: 'NONE_RECORDED'`
// rather than silently assumed to already be pre-adjusted by NSE.

const SUPPORTED_ACTION_TYPES = new Set(['SPLIT', 'BONUS']);

function ratioMultiplier(action) {
  const from = Number(action.ratio_from ?? action.ratioFrom);
  const to = Number(action.ratio_to ?? action.ratioTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return 1;
  // A SPLIT/BONUS of ratio_from -> ratio_to (e.g. 1 share becomes 5 shares: from=1, to=5) means
  // one pre-action share is worth (from/to) of a post-action share, so historical PRICES before
  // the ex-date must be multiplied by (from/to) to be comparable to post-action prices, and
  // historical VOLUME must be multiplied by the inverse (to/from).
  return from / to;
}

// actions: array of {symbol, ex_date, action_type, ratio_from, ratio_to}. Returns the
// cumulative price-adjustment factor applicable to a row dated `rowDate` for `symbol`, given
// only the actions on record whose ex_date is strictly after rowDate (i.e. actions that occur
// between this historical row and "today").
function priceAdjustmentFactorAsOf(symbol, rowDate, actions) {
  const sym = String(symbol || '').trim().toUpperCase();
  let factor = 1;
  for (const action of actions || []) {
    if (String(action.symbol || '').toUpperCase() !== sym) continue;
    if (!SUPPORTED_ACTION_TYPES.has(String(action.action_type || action.actionType || '').toUpperCase())) continue;
    if (String(action.ex_date || action.exDate) <= String(rowDate)) continue; // action already reflected in this row
    factor *= ratioMultiplier(action);
  }
  return factor;
}

// Applies adjustment to one row of {trade_date, close, open, high, low, volume}. Never mutates
// the input; always reports whether an adjustment was actually applied and from what source, so
// a caller can never mistake "no known actions" for "confirmed unadjusted-and-correct."
function adjustRow(row, actions) {
  const factor = priceAdjustmentFactorAsOf(row.symbol, row.trade_date, actions);
  const hasAnyActionsForSymbol = (actions || []).some(a => String(a.symbol || '').toUpperCase() === String(row.symbol || '').toUpperCase());
  return {
    ...row,
    close: row.close == null ? null : row.close * factor,
    open: row.open == null ? null : row.open * factor,
    high: row.high == null ? null : row.high * factor,
    low: row.low == null ? null : row.low * factor,
    volume: row.volume == null ? null : row.volume / factor,
    rawClose: row.close,
    adjustmentFactor: factor,
    pricesAdjusted: factor !== 1,
    adjustmentSource: hasAnyActionsForSymbol ? 'RECORDED_CORPORATE_ACTIONS' : 'NONE_RECORDED'
  };
}

function adjustSeries(rows, actions) {
  return (rows || []).map(row => adjustRow(row, actions));
}

module.exports = { priceAdjustmentFactorAsOf, adjustRow, adjustSeries, SUPPORTED_ACTION_TYPES };
