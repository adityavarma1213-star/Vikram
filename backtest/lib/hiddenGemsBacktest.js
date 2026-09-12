'use strict';
// Connects the components required for a genuine Hidden Gems backtest, without touching the
// existing accumulation-only runBacktest() in backtestRunner.js (kept separate to avoid
// regressing the already-tested accumulation path).
//
// Flow: Point-in-Time Universe -> Survivorship -> Corporate-Action Adjustment -> Accumulation
// (inside hiddenGems.evaluate) -> Opportunity -> Stealth -> Recognition -> Hidden Gems
// classification -> Immutable Signal Event -> (ASM is applied separately, see backtest/lib/asm.js
// which already consumes signals in this same shape).
//
// This module contains ZERO real market data and fabricates NOTHING: with the current empty
// index_universe_memberships/security_lifecycle/corporate_actions tables (see schema.sql), point-
// in-time membership and survivorship checks correctly return UNKNOWN/no-adjustment, which this
// module surfaces honestly in its output rather than hiding.

const { membershipAsOf } = require('../../server/src/pointInTimeUniverse');
const { filterTradableAsOf } = require('../../server/src/survivorship');
const { adjustSeries } = require('../../server/src/corporateActions');
const hiddenGems = require('../../hiddenGems/engine');
const { SignalEventStore } = require('./signalEventStore');

// bySymbolHistory: Map<symbol, rows[]> (same shape backtestRunner.js already uses).
// membershipRows / lifecycleRows / corporateActionRows: real recorded rows, or [] if none exist
// yet — this function never fabricates any of the three.
function runHiddenGemsBacktest({
  bySymbolHistory,
  asOfDate,
  candidateSymbols,
  membershipRows = [],
  lifecycleRows = [],
  corporateActionRows = [],
  institutionalDataBySymbol = new Map(),
  newsDataBySymbol = new Map(),
  config
}) {
  const store = new SignalEventStore();
  const survivorship = filterTradableAsOf(candidateSymbols, asOfDate, lifecycleRows);

  const results = [];
  for (const symbol of survivorship.tradable) {
    const rawHistory = bySymbolHistory.get(symbol);
    if (!rawHistory || !rawHistory.length) continue;
    const history = adjustSeries(rawHistory, corporateActionRows);
    const current = history[history.length - 1];
    const universeMembership = membershipAsOf(symbol, asOfDate, membershipRows);

    const evaluation = hiddenGems.evaluate({
      symbol, history, current, futures: { available: false, derivativesSupported: false, trade_date: current.trade_date },
      universeMembership,
      institutionalData: institutionalDataBySymbol.get ? institutionalDataBySymbol.get(symbol) : institutionalDataBySymbol[symbol],
      newsData: newsDataBySymbol.get ? newsDataBySymbol.get(symbol) : newsDataBySymbol[symbol],
      config
    });

    if (evaluation.T0 && evaluation.P0 != null) {
      store.append({
        symbol, T0: evaluation.T0, P0: evaluation.P0, verdict: evaluation.classification,
        detection: { accumulationVerdict: evaluation.accumulationVerdict, tier: evaluation.tier },
        universeContext: universeMembership, recognitionState: evaluation.recognitionState
      });
    }
    results.push(evaluation);
  }

  return {
    asOfDate,
    survivorshipCoverage: survivorship.survivorshipCoverage,
    excludedForSurvivorship: survivorship.excluded,
    unverifiedForSurvivorship: survivorship.unverifiedSymbols,
    membershipDataAvailable: membershipRows.length > 0,
    corporateActionDataAvailable: corporateActionRows.length > 0,
    results,
    signalEvents: store.all()
  };
}

module.exports = { runHiddenGemsBacktest };
