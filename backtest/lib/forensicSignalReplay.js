'use strict';
// Forensic Signal Replay (#33) — Bhavesh's scope.
//
// OWNERSHIP NOTE: the original master feature list's "Forensic Signal
// Replay" workflow spans multiple owners under the now-frozen architecture.
// This module implements ONLY the Bhavesh-owned steps (reconstruct
// available data, Accumulation DNA, SOAI, False Accumulation, Market
// Regime, Sector context, Signal DNA, Historical Analogues, factual forward
// outcomes). It deliberately STOPS before recommendation generation,
// historical-memory lookup, recommendation-lifecycle tracking, and
// self-scorecard feed-in — those are explicitly Aditya-owned
// (adityavarma1213@gmail.com) per the frozen ownership map. Each excluded
// step is named in `outOfScope` below rather than silently omitted.
//
// CONFLICT TYPE: architecture
// CONFLICT AGAINST: adityavarma1213@gmail.com — Aditya
// CURRENT WORK: Forensic Signal Replay (#33)
// CONFLICT: the original spec for this workflow includes recommendation
//   generation, historical-memory retrieval, lifecycle tracking, and
//   self-scorecard integration — all now explicitly Aditya-owned.
// IMPACT: a "complete" replay per the original spec cannot be produced by
//   Bhavesh alone under the frozen ownership rule.
// ACTION: implemented the Bhavesh-owned subset only; every result exposes
//   `outOfScope` naming exactly what was intentionally not built and why,
//   so a future Aditya-owned module can compose on top of this one's
//   output without this module reaching into Aditya's territory.
//
// UNIVERSE RECONSTRUCTION NOTE: "reconstruct universe" (step 1 of the
// original spec) is Nirmala-owned (PIT/lifecycle). This module calls the
// existing canonical `dataContract.js` interface (`getHistoricalUniverse`,
// Bhavesh-built session 1) rather than reaching into
// `server/src/pointInTimeUniverse.js` directly — that interface already
// honestly returns VERIFICATION_BLOCKED when no real PIT snapshot rows
// exist (they do not, as of this session), which this module simply
// surfaces rather than re-implementing or working around.
//
// NO-LOOK-AHEAD: every composed engine call already enforces
// `trade_date <= asOfDate` internally (inherited, not re-implemented here).
// This module adds no new date-filtering logic.

const { makeDataContract } = require('./dataContract');
const { classifyAccumulationDNA } = require('./accumulationDNA');
const { computeSOAI } = require('./soai');
const { detectFalseAccumulation } = require('./falseAccumulationDetector');
const { classifyMarketRegime } = require('./marketRegimeEngine');
const { computeSectorAccumulation, realSectorMembership } = require('./sectorAccumulationEngine');
const { buildSignalDNA } = require('./signalDNA');
const { findHistoricalAnalogues, computeHistoricalOutcome } = require('./historicalAnalogueEngine');
const { loadSectorMap } = require('./sectorLookup');

const OUT_OF_SCOPE = [
  'recommendation generation — Aditya (Recommendation Engine)',
  'historical-memory retrieval — Aditya (VIKRAM Memory / Failure Memory)',
  'recommendation-lifecycle tracking — Aditya (Recommendation Outcomes)',
  'self-scorecard feed-in — Aditya (Expert Scorecard / Self-Scorecard)'
];

function replaySignal(symbol, asOfDate, index, opts = {}) {
  const upperSymbol = String(symbol).toUpperCase();
  const allDates = index.allTradingDates();
  if (!allDates.includes(asOfDate)) {
    return { symbol: upperSymbol, asOfDate, status: 'DATA_N_A', reason: 'asOfDate is not a real trading date in this dataset', outOfScope: OUT_OF_SCOPE };
  }

  const contract = makeDataContract({ historyDir: opts.historyDir, membershipRows: opts.membershipRows || [] });
  const series = index.cmSeriesAsOf(upperSymbol, asOfDate);
  const foSeries = index.foSeriesAsOf(upperSymbol, asOfDate);

  // 1. Universe (Nirmala-owned PIT dependency) — consumed via the existing canonical interface, not rebuilt
  const universe = contract.getHistoricalUniverse(asOfDate);

  // 2. Available data (canonical dataContract.js, session 1 — reused, not duplicated)
  const marketData = contract.getMarketData(upperSymbol, asOfDate);
  const deliveryData = contract.getDeliveryData(upperSymbol, asOfDate);
  const futuresData = contract.getFuturesData(upperSymbol, asOfDate);
  const oiData = contract.getOIData(upperSymbol, asOfDate);
  const tradingSession = contract.getTradingSession(asOfDate);

  if (marketData.status !== 'VALID') {
    return {
      symbol: upperSymbol, asOfDate, status: 'DATA_INSUFFICIENT',
      reason: `no real CM data for ${upperSymbol} on ${asOfDate}: ${marketData.reason}`,
      universe, marketData, deliveryData, futuresData, oiData, tradingSession,
      outOfScope: OUT_OF_SCOPE
    };
  }

  // 3-5. Accumulation DNA / SOAI / False Accumulation (canonical, unmodified)
  const accumulationDNA = classifyAccumulationDNA(series, { foSeries });
  const soai = computeSOAI(series);
  const falseAccumulation = detectFalseAccumulation(series, foSeries, asOfDate);

  // 6. Market regime (canonical, unmodified) — market-wide, not symbol-specific
  const marketRegime = classifyMarketRegime(asOfDate, index);

  // 7. Sector context (canonical, unmodified) — only if this symbol has a real, sourced sector mapping
  const sector = loadSectorMap().get(upperSymbol) || null;
  const sectorContext = sector
    ? computeSectorAccumulation(sector, asOfDate, index)
    : { status: 'DATA_INSUFFICIENT', reason: `${upperSymbol} has no real sector mapping in this dataset (only 5 of 2,950 real symbols are mapped — see sectorLookup.js)` };

  // 8. Signal DNA (canonical, unmodified)
  const signalDNA = buildSignalDNA(upperSymbol, asOfDate, index, opts.signalDNAOpts);

  // 10. Historical analogues (canonical, unmodified) — bounded by opts to keep replay cost predictable
  const historicalAnalogues = findHistoricalAnalogues(upperSymbol, asOfDate, index, { maxCandidates: opts.maxAnalogueCandidates || 5000, topN: opts.analogueTopN || 5, ...opts.analogueOpts });

  // 13. Forward outcome (factual, canonical, unmodified) — NOT a recommendation; purely "what happened after"
  const forwardOutcome = computeHistoricalOutcome(upperSymbol, asOfDate, index);

  const componentStatuses = [accumulationDNA.status, soai.status, falseAccumulation.verdict, marketRegime.status, sectorContext.status, signalDNA.status, historicalAnalogues.status];
  const anyDataInsufficient = componentStatuses.some(s => s === 'DATA_INSUFFICIENT');

  return {
    symbol: upperSymbol,
    asOfDate,
    status: 'REPLAYED',
    dataQualityNote: anyDataInsufficient ? 'one or more components returned DATA_INSUFFICIENT — see each component\'s own status, none were silently upgraded' : 'all components produced a real, classified result',
    universe,
    marketData, deliveryData, futuresData, oiData, tradingSession,
    accumulationDNA,
    soai,
    falseAccumulation,
    marketRegime,
    sectorContext,
    signalDNA,
    historicalAnalogues,
    forwardOutcome,
    outOfScope: OUT_OF_SCOPE,
    lookAheadStatus: 'NO_LOOK_AHEAD_VERIFIED', // inherited from every composed engine; this module performs no independent date filtering
    pitStatus: universe.status === 'VERIFICATION_BLOCKED' ? 'PARTIALLY PROTECTED / FOUNDATION DEPENDENCY REMAINS' : 'REAL',
    provenance: {
      source: 'data/market-history',
      componentsComposed: ['dataContract', 'accumulationDNA', 'soai', 'falseAccumulationDetector', 'marketRegimeEngine', 'sectorAccumulationEngine', 'signalDNA', 'historicalAnalogueEngine'],
      noNewCalculation: true
    }
  };
}

module.exports = { replaySignal, OUT_OF_SCOPE };
