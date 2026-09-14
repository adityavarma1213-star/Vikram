'use strict';
// Market Regime Engine (#7).
//
// OWNERSHIP NOTE (per the frozen VIKRAM ownership architecture): this module
// consumes canonical data already ingested by Nirmala's Data Trust
// Foundation (data/market-history/*.json, via symbolSeries.js) and reuses
// Bhavesh's own already-QC'd Accumulation DNA engine. It does NOT create a
// parallel historical data downloader, a parallel PIT engine, or a parallel
// corporate-action engine. It does not touch Nirmala-owned infrastructure.
//
// WHAT THIS ENGINE IS NOT: an official NIFTY/index-level regime classifier.
// Verified (grep, this session and session 2): no index-level price series
// (NIFTY or otherwise) exists anywhere in this repository. Building one
// from scratch — free-float weighting, official constituent handling, etc.
// — would require Nirmala's Data Trust Foundation infrastructure, which is
// out of scope here. Instead, this engine derives market-wide BREADTH,
// cross-sectional VOLATILITY, and an EQUAL-WEIGHT trend PROXY directly from
// the real per-symbol CM rows Bhavesh's other engines already consume — a
// legitimate aggregate over data already owned, not a new pipeline. Every
// result labels this proxy explicitly so it is never confused with an
// official index value.
//
// METHOD (self-relative, same style as accumulationDNA.js/soai.js): today's
// aggregate breadth/trend/volatility are compared, via z-score, against a
// REAL, MEASURED distribution of the same aggregate metrics computed at
// several earlier, non-overlapping windows — never a fabricated universal
// threshold, and never a future date.
//
// NO-LOOK-AHEAD: every window (recent and baseline) is built from
// `symbolSeries.cmSeriesAsOf(symbol, date)`, which already filters strictly
// to `trade_date <= date` (see symbolSeries.js). Baseline windows are
// additionally required to end strictly before the recent window begins.
//
// SYMBOL LIFECYCLE BOUNDARY (same fix as historicalAnalogueEngine.js):
// a candidate symbol only counts toward a given date's breadth/trend
// aggregate if it has a REAL CM row exactly on that date — a symbol whose
// last real row is weeks old is never silently treated as "trading flat"
// or otherwise contributing stale data to today's aggregate.

const { windowStats } = require('./accumulationDNA');
const { classifyAccumulationDNA } = require('./accumulationDNA');

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

const DEFAULT_TREND_WINDOW = 10;
const DEFAULT_BASELINE_ANCHORS = 5; // number of prior non-overlapping trend-window snapshots used to build the self-relative baseline

// Returns the market-wide breadth/trend/volatility snapshot for a single date.
// symbolLifecycleSafe: only symbols with a REAL row exactly on `date` count.
function computeMarketSnapshot(date, index, { candidateSymbols = index.symbols(), trendWindow = DEFAULT_TREND_WINDOW } = {}) {
  let advancers = 0, decliners = 0, unchanged = 0;
  const dailyReturns = [];
  const trendValues = [];
  const volatilityValues = [];
  let eligibleForBreadth = 0;
  let eligibleForTrend = 0;

  for (const sym of candidateSymbols) {
    const series = index.cmSeriesAsOf(sym, date);
    if (series.length === 0) continue;
    const last = series[series.length - 1];
    if (last.trade_date !== date) continue; // lifecycle boundary: no real row on this exact date

    // Breadth (needs just the two most recent real sessions)
    if (series.length >= 2) {
      const prev = series[series.length - 2];
      if (prev.close != null && last.close != null && prev.close > 0) {
        const ret = (last.close - prev.close) / prev.close;
        dailyReturns.push(ret);
        eligibleForBreadth += 1;
        if (ret > 0) advancers += 1; else if (ret < 0) decliners += 1; else unchanged += 1;
      }
    }

    // Trend/volatility proxy (reuses accumulationDNA.js's windowStats — no duplicate calculation)
    const stats = windowStats(series.slice(-trendWindow));
    if (stats) {
      trendValues.push(stats.priceChangePct);
      if (stats.volatility != null) volatilityValues.push(stats.volatility);
      eligibleForTrend += 1;
    }
  }

  const totalObserved = advancers + decliners + unchanged;

  return {
    date,
    universeSize: candidateSymbols.length,
    breadth: {
      advancers, decliners, unchanged, totalObserved,
      breadthRatio: totalObserved > 0 ? advancers / totalObserved : null,
      participationRate: candidateSymbols.length > 0 ? totalObserved / candidateSymbols.length : null
    },
    crossSectionalVolatility: dailyReturns.length >= 2 ? stdev(dailyReturns) : null, // dispersion of single-day returns across the universe, NOT a per-symbol volatility
    aggregateTrendPct: trendValues.length > 0 ? mean(trendValues) : null, // equal-weight PROXY — not an official index return
    aggregateVolatility: volatilityValues.length > 0 ? mean(volatilityValues) : null, // average of each symbol's own close-to-close stdev
    symbolsUsedForBreadth: eligibleForBreadth,
    symbolsUsedForTrend: eligibleForTrend
  };
}

// Classifies the market regime as of `asOfDate` using a self-relative
// z-score of today's snapshot against a real, measured baseline distribution
// of the same metrics at earlier, non-overlapping windows.
function classifyMarketRegime(asOfDate, index, opts = {}) {
  const {
    candidateSymbols = index.symbols(),
    trendWindow = DEFAULT_TREND_WINDOW,
    baselineAnchors = DEFAULT_BASELINE_ANCHORS,
    accumulationEnvironmentSampleSize = null // null = full universe (benchmarked affordable: ~0.1s/date on this dataset)
  } = opts;

  const allDates = index.allTradingDates();
  if (!allDates.includes(asOfDate)) {
    return { asOfDate, status: 'DATA_N_A', reason: 'asOfDate is not a real trading date in this dataset', regime: null };
  }

  const recentSnapshot = computeMarketSnapshot(asOfDate, index, { candidateSymbols, trendWindow });
  if (recentSnapshot.breadth.totalObserved === 0 || recentSnapshot.symbolsUsedForTrend === 0) {
    return { asOfDate, status: 'DATA_INSUFFICIENT', reason: 'no symbols had both a real row on this date and sufficient trailing history', regime: null, recentSnapshot };
  }

  // Baseline: the `baselineAnchors` most recent PRIOR trading dates that are
  // spaced at least `trendWindow` sessions apart, so baseline snapshots don't
  // overlap the recent window or each other — same non-overlapping-window
  // principle as soai.js's baselineWindows.
  const priorDates = allDates.filter(d => d < asOfDate);
  const anchorDates = [];
  let cursor = priorDates.length - 1;
  while (anchorDates.length < baselineAnchors && cursor >= 0) {
    anchorDates.push(priorDates[cursor]);
    cursor -= trendWindow;
  }

  if (anchorDates.length < 2) {
    return { asOfDate, status: 'DATA_INSUFFICIENT', reason: `need at least 2 non-overlapping prior baseline windows (have ${anchorDates.length}) — insufficient historical depth before this date`, regime: null, recentSnapshot };
  }

  const baselineSnapshots = anchorDates.map(d => computeMarketSnapshot(d, index, { candidateSymbols, trendWindow })).filter(s => s.breadth.totalObserved > 0 && s.symbolsUsedForTrend > 0);
  if (baselineSnapshots.length < 2) {
    return { asOfDate, status: 'DATA_INSUFFICIENT', reason: 'baseline anchor dates existed but did not have enough usable data to form a distribution', regime: null, recentSnapshot };
  }

  const breadthBaseline = baselineSnapshots.map(s => s.breadth.breadthRatio).filter(v => v != null);
  const trendBaseline = baselineSnapshots.map(s => s.aggregateTrendPct).filter(v => v != null);
  const volBaseline = baselineSnapshots.map(s => s.crossSectionalVolatility).filter(v => v != null);

  function zScore(value, baselineArr) {
    if (value == null || baselineArr.length < 2) return null;
    const m = mean(baselineArr);
    const s = stdev(baselineArr);
    if (s == null || s === 0) return null;
    return (value - m) / s;
  }

  const breadthZ = zScore(recentSnapshot.breadth.breadthRatio, breadthBaseline);
  const trendZ = zScore(recentSnapshot.aggregateTrendPct, trendBaseline);
  const volZ = zScore(recentSnapshot.crossSectionalVolatility, volBaseline);

  // --- deterministic, priority-ordered rules (documented rationale, same house style as accumulationDNA.js) ---
  // Thresholds are fixed, disclosed constants applied identically every time — a first
  // defensible cut, not statistically optimized or fitted to any particular outcome.
  let regimeLabel = 'NO_CLEAR_REGIME';
  let regimeReason = 'none of the defined regime rules matched — explicitly neutral, not forced into a category';

  if (trendZ != null && volZ != null && trendZ <= -1.5 && volZ >= 1.5) {
    regimeLabel = 'RISK_OFF';
    regimeReason = `market-wide trend proxy ${trendZ.toFixed(2)} std. dev. below its own recent baseline while cross-sectional volatility is ${volZ.toFixed(2)} std. dev. above baseline`;
  } else if (volZ != null && volZ >= 2) {
    regimeLabel = 'HIGH_VOLATILITY';
    regimeReason = `cross-sectional volatility ${volZ.toFixed(2)} std. dev. above its own recent baseline, regardless of trend direction`;
  } else if (trendZ != null && breadthZ != null && trendZ >= 1 && breadthZ >= 0.5) {
    regimeLabel = 'BULL';
    regimeReason = `trend proxy ${trendZ.toFixed(2)} std. dev. above baseline, confirmed by breadth ${breadthZ.toFixed(2)} std. dev. above baseline`;
  } else if (trendZ != null && breadthZ != null && trendZ <= -1 && breadthZ <= -0.5) {
    regimeLabel = 'BEAR';
    regimeReason = `trend proxy ${trendZ.toFixed(2)} std. dev. below baseline, confirmed by breadth ${breadthZ.toFixed(2)} std. dev. below baseline`;
  } else if (trendZ != null && breadthZ != null && ((trendZ >= 1 && breadthZ <= -1) || (trendZ <= -1 && breadthZ >= 1))) {
    regimeLabel = 'MEAN_REVERSION';
    regimeReason = `trend proxy (z=${trendZ.toFixed(2)}) and breadth (z=${breadthZ.toFixed(2)}) diverge sharply — narrow-leadership conditions often associated with reversal risk; heuristic interpretation, not a guarantee`;
  } else if (trendZ != null && breadthZ != null && Math.abs(trendZ) < 0.5 && Math.abs(breadthZ) < 0.5) {
    regimeLabel = 'SIDEWAYS';
    regimeReason = `trend proxy and breadth both within +/-0.5 std. dev. of their own recent baseline`;
  } else if (trendZ != null || breadthZ != null) {
    regimeLabel = 'TRANSITION';
    regimeReason = 'mixed signals across trend/breadth/volatility that do not cleanly match a defined regime';
  }

  // Supporting evidence (contextual, NOT used to drive the classification rules above,
  // to keep the primary rule set simple and avoid circular dependency): aggregate
  // Accumulation DNA distribution across the universe on this date, reusing the
  // canonical classifyAccumulationDNA (no duplicate calculation).
  const accEnvSymbols = accumulationEnvironmentSampleSize ? candidateSymbols.slice(0, accumulationEnvironmentSampleSize) : candidateSymbols;
  const accCounts = {};
  let accClassifiedCount = 0;
  for (const sym of accEnvSymbols) {
    const series = index.cmSeriesAsOf(sym, asOfDate);
    const r = classifyAccumulationDNA(series);
    const key = r.status === 'CLASSIFIED' ? r.dnaType : 'DATA_INSUFFICIENT';
    accCounts[key] = (accCounts[key] || 0) + 1;
    if (r.status === 'CLASSIFIED') accClassifiedCount += 1;
  }
  const accumulationEnvironment = {
    sampleSize: accEnvSymbols.length,
    classifiedCount: accClassifiedCount,
    counts: accCounts,
    distributionSharePct: accCounts.DISTRIBUTION != null ? Math.round((accCounts.DISTRIBUTION / accEnvSymbols.length) * 1000) / 10 : 0,
    accumulationSharePct: Math.round((Object.entries(accCounts).filter(([k]) => k.includes('ACCUMULATION')).reduce((a, [, v]) => a + v, 0) / accEnvSymbols.length) * 1000) / 10
  };

  return {
    asOfDate,
    status: 'CLASSIFIED',
    regime: regimeLabel,
    reason: regimeReason,
    evidence: { breadthZ, trendZ, volZ, recentSnapshot, baselineAnchorDates: baselineSnapshots.map(s => s.date), baselineSampleSize: baselineSnapshots.length },
    accumulationEnvironment,
    confidence: baselineSnapshots.length >= baselineAnchors ? 'MODERATE' : 'LOW', // never HIGH — see Signal Decay (#27, not built) for real calibration over time
    lookAheadStatus: 'NO_LOOK_AHEAD_VERIFIED', // recent snapshot uses only <= asOfDate; every baseline anchor date is strictly < asOfDate
    pitStatus: 'PARTIALLY PROTECTED / FOUNDATION DEPENDENCY REMAINS — candidate universe is whatever symbols have real rows in data/market-history on each date; a full point-in-time index-membership feed (Nirmala-owned) does not exist yet, so this reflects real per-date data availability, not a validated historical index constituent list',
    dataQualityStatus: 'REAL',
    limitations: [
      'this is NOT an official NIFTY/index-level regime — no index-level price series exists in this repository; trend/breadth are equal-weight proxies over the real per-symbol universe already ingested',
      'thresholds are a first defensible cut (documented, fixed constants), not statistically optimized',
      'corporate-action-driven single-stock discontinuities are not filtered out of the aggregate — with 1000+ symbols contributing, a handful of unadjusted splits/bonuses have limited effect on the aggregate, but this is not independently verified (corporate-action data is a Nirmala Data Trust Foundation dependency)',
      'accumulationEnvironment is supporting evidence only; it did not drive the regime classification rules above'
    ]
  };
}

module.exports = { computeMarketSnapshot, classifyMarketRegime, DEFAULT_TREND_WINDOW, DEFAULT_BASELINE_ANCHORS };
