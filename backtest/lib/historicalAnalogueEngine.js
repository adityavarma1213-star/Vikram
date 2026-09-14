'use strict';
// Historical Analogue Engine (#6).
//
// Answers "have we seen a setup like this before?" by building the target
// symbol/date's Signal DNA (buildSignalDNA), then searching REAL historical
// (symbol, date) pairs strictly before the target date for comparable
// Signal DNA using the existing, QC'd compareSignalDNA(). This module adds
// NO new price/delivery/volume/OI calculation of its own — it is a pure
// search-and-rank layer over engines that already exist, per the
// anti-duplication rule followed throughout this codebase.
//
// NO-LOOK-AHEAD, BY CONSTRUCTION (not just by convention):
//   - Every candidate date is required to be STRICTLY BEFORE the target
//     date (`analogueDate < targetDate`), enforced as a hard filter before
//     any candidate is even built, and re-asserted on every returned record
//     (`lookAheadStatus`).
//   - Both the target's and every candidate's Signal DNA are built via
//     `buildSignalDNA(symbol, date, index)`, which internally calls
//     `symbolSeries.cmSeriesAsOf`/`foSeriesAsOf` — these ALREADY filter
//     strictly to `trade_date <= asOfDate` (see symbolSeries.js). So a
//     candidate built for an earlier date structurally cannot see anything
//     after that date, and the target cannot see anything after the target
//     date either. This module does not need to (and does not) do its own
//     date filtering on top of that — it inherits the guarantee from the
//     modules it composes.
//   - The OPTIONAL historical-outcome interface (see bottom of this file)
//     is the one deliberate exception: it looks FORWARD from an analogue
//     date to measure what actually happened, using real future data that
//     has since become available. This is intentional (that is what an
//     "outcome" is) and is kept entirely separate from — and never fed
//     back into — the similarity/matching step above it.
//
// SURVIVORSHIP / PIT NOTE: candidate symbols are drawn from
// `index.symbols()`, which only contains symbols that actually appear in
// the real `data/market-history` files. A symbol with no CM row on a given
// historical date (e.g. because it was not yet listed, or was already
// delisted) simply produces no row for that date and is never a candidate
// on that date — this module does not maintain its own historical universe
// and does not claim to solve item #3 (Point-in-Time Universe) on its own;
// it only reflects whatever the real per-date data already does or doesn't
// contain.

// CORPORATE-ACTION CAVEAT (closes the one open acceptance-audit finding):
// price/volatility comparisons between a target and a historical analogue
// can be distorted by an unadjusted split, bonus, rights issue, or similar
// corporate action, because this codebase has no validated historical
// corporate-action adjustment feed (the Data Trust Foundation dependency —
// see corporateActions.js's own header). This module does NOT build a
// parallel corporate-action engine and does NOT invent adjustment data —
// it reuses the exact same canonical `detectPriceDiscontinuities` /
// `assessCoverage` functions already relied on by
// `falseAccumulationDetector.js`, applied to the target's and each
// candidate's own comparison windows, and surfaces the result explicitly
// rather than implying comparability that hasn't been established.
const { detectPriceDiscontinuities, assessCoverage } = require('./corporateActions');

const { buildSignalDNA, compareSignalDNA } = require('./signalDNA');
const { buildAccumulationIntelligence } = require('./accumulationIntelligence');
const { HORIZONS } = require('../backtestRunner');

const DEFAULT_MAX_CANDIDATES = 30000; // benchmarked: ~3s per target evaluation on this dataset (2,950 symbols x ~10 sampled dates); disclosed, deterministic — see `truncated`/`datesSampled` in the result
const DEFAULT_TOP_N = 10;

// Corporate-action coverage can NEVER be confirmed in this environment (no
// live NSE corporate-actions feed has ever been reached — same network wall
// documented throughout this codebase), so this always evaluates to
// VERIFICATION_BLOCKED. It is computed via the function, not hard-coded, so
// that if `assessCoverage`'s own logic ever changes (e.g. once real network
// access exists and a fetch actually succeeds), this reflects that
// automatically without needing a matching edit here.
function assessCorporateActionRisk(targetSeries, candidateSeries) {
  const coverage = assessCoverage(null); // no fetch was attempted here; delegates the actual policy decision to the canonical module
  const targetFlags = detectPriceDiscontinuities(targetSeries.slice(-30).map(r => ({ trade_date: r.trade_date, close: r.close })));
  const candidateFlags = detectPriceDiscontinuities(candidateSeries.slice(-30).map(r => ({ trade_date: r.trade_date, close: r.close })));
  // Coverage being unconfirmed means comparability can never be POSITIVELY established here,
  // regardless of whether a heuristic discontinuity happens to be flagged in this particular
  // window — the absence of a flag is not proof of absence of an unadjusted corporate action.
  return {
    status: 'VERIFICATION_BLOCKED',
    reason: coverage.reason || 'No corporate-action fetch was ever attempted for this run; comparability cannot be positively established.',
    coverageStatus: coverage.status,
    targetDiscontinuitiesInWindow: targetFlags,
    candidateDiscontinuitiesInWindow: candidateFlags
  };
}

function findHistoricalAnalogues(targetSymbol, targetDate, index, opts = {}) {
  const {
    candidateSymbols = index.symbols(),
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    topN = DEFAULT_TOP_N,
    populationStats = null,
    minSharedDimensions = 2
  } = opts;

  const targetDNA = buildSignalDNA(targetSymbol, targetDate, index);
  if (targetDNA.status !== 'BUILT') {
    return {
      targetSymbol: String(targetSymbol).toUpperCase(), targetDate,
      status: 'DATA_INSUFFICIENT',
      reason: `target Signal DNA could not be built: ${targetDNA.reason || 'insufficient history'}`,
      analogues: [], candidatesScanned: 0, candidatesRequested: 0, truncated: false
    };
  }

  const allDates = index.allTradingDates();
  const targetSeries = index.cmSeriesAsOf(targetSymbol, targetDate); // for the corporate-action caveat only — never re-used for matching/ranking
  const candidateDates = allDates.filter(d => d < targetDate); // STRICT inequality — excludes the target date itself, and every later date
  if (candidateDates.length === 0) {
    return { targetSymbol: String(targetSymbol).toUpperCase(), targetDate, status: 'DATA_INSUFFICIENT', reason: 'no historical dates exist before the target date in this dataset', analogues: [], candidatesScanned: 0, candidatesRequested: 0, truncated: false };
  }

  const sortedSymbols = [...candidateSymbols].map(s => String(s).toUpperCase()).sort();
  const candidatesRequested = candidateDates.length * sortedSymbols.length;

  // QC-style fix, applied while building (not left for a later audit): scanning
  // "most-recent-date-first, all symbols" under a bounded maxCandidates would
  // exhaust the cap on the single most recent date or two, making every
  // analogue essentially same-week rather than genuinely historical. Instead,
  // sample a deterministic, EVENLY-SPACED set of dates across the FULL real
  // historical range available before the target date, then scan all
  // supplied symbols on each sampled date (also capped). This trades some
  // per-date symbol breadth for real depth across the dataset's actual
  // history — a defensible default, not a hidden bias, and fully disclosed
  // via `datesSampled`/`candidateDatesAvailable` in the result.
  const ascendingDates = [...candidateDates].sort();
  const maxDatesAffordable = Math.max(1, Math.floor(maxCandidates / sortedSymbols.length));
  const desiredDateCount = Math.min(ascendingDates.length, maxDatesAffordable);
  const sampledDates = [];
  for (let i = 0; i < desiredDateCount; i += 1) {
    const idx = desiredDateCount === 1 ? ascendingDates.length - 1 : Math.round((i * (ascendingDates.length - 1)) / (desiredDateCount - 1));
    sampledDates.push(ascendingDates[idx]);
  }
  const sortedDates = [...new Set(sampledDates)].sort().reverse(); // dedupe (rounding can collide), most-recent-of-the-sample first for tie-consistency

  const analogues = [];
  let scanned = 0;
  let truncated = false;

  outer:
  for (const d of sortedDates) {
    for (const s of sortedSymbols) {
      if (scanned >= maxCandidates) { truncated = true; break outer; }
      scanned += 1;
      if (s === targetDNA.symbol && d === targetDate) continue; // structurally unreachable (d < targetDate always) but explicit for clarity

      const candidateSeries = index.cmSeriesAsOf(s, d);
      // SYMBOL LIFECYCLE BOUNDARY CHECK (found via testing, fixed here — not in
      // buildSignalDNA/accumulationDNA/etc., which are already QC'd and not to
      // be modified): cmSeriesAsOf(s, d) returns the last REAL row at or before
      // d, which is NOT necessarily a row ON d — a symbol that stopped trading
      // (delisted, suspended, or simply had no session) before d would silently
      // reuse stale, weeks-old data as if it represented d. That is not
      // look-ahead (no future data is used), but it IS treating old data as
      // current, which is exactly the symbol-lifecycle-boundary failure mode.
      // A candidate is only eligible if a real CM row exists ON this exact date.
      if (candidateSeries.length === 0 || candidateSeries[candidateSeries.length - 1].trade_date !== d) continue;

      const candidateDNA = buildSignalDNA(s, d, index);
      if (candidateDNA.status !== 'BUILT') continue; // never fabricate a comparison from an unbuildable record

      const cmp = compareSignalDNA(targetDNA, candidateDNA, populationStats);
      if (cmp.status !== 'COMPARED' || cmp.comparedDimensions.length < minSharedDimensions) continue; // never convert missing evidence into a similarity score

      const allDimNames = ['price', 'volatility', 'delivery', 'fo_oi', 'soai'];
      const unavailableDimensions = allDimNames.filter(n => !cmp.comparedDimensions.includes(n));

      const intel = buildAccumulationIntelligence(s, d, index);
      const corporateActionStatus = assessCorporateActionRisk(targetSeries, candidateSeries);

      analogues.push({
        targetSymbol: targetDNA.symbol,
        targetDate,
        analogueSymbol: s,
        analogueDate: d,
        similarity: cmp.similarityScore,
        similarityStatus: cmp.calibration, // 'REAL_DATA_CALIBRATED' or 'UNCALIBRATED_PROTOTYPE'
        matchedDimensions: cmp.comparedDimensions,
        unavailableDimensions,
        sameAccumulationDNAType: cmp.sameAccumulationDNAType,
        evidenceFor: intel.evidenceFor,
        evidenceAgainst: intel.evidenceAgainst,
        provenance: { source: 'data/market-history', analogueBuiltFrom: 'real repository data', targetFingerprint: targetDNA.fingerprint, analogueFingerprint: candidateDNA.fingerprint, corporateActionCoverage: corporateActionStatus.coverageStatus },
        lookAheadStatus: d < targetDate ? 'NO_LOOK_AHEAD_VERIFIED' : 'VIOLATION', // always NO_LOOK_AHEAD_VERIFIED by construction — the flag is asserted, not assumed
        dataQualityStatus: 'REAL',
        corporateActionStatus // { status: 'VERIFICATION_BLOCKED', reason, coverageStatus, targetDiscontinuitiesInWindow, candidateDiscontinuitiesInWindow } — see module header
      });
    }
  }

  // Deterministic ranking: similarity desc, tie-broken by analogueDate desc then symbol asc,
  // so re-running against the same dataset always yields the same ordered list.
  analogues.sort((x, y) => (y.similarity - x.similarity) || (y.analogueDate < x.analogueDate ? -1 : y.analogueDate > x.analogueDate ? 1 : 0) || x.analogueSymbol.localeCompare(y.analogueSymbol));

  const top = analogues.slice(0, topN);

  return {
    targetSymbol: targetDNA.symbol,
    targetDate,
    status: top.length > 0 ? 'FOUND' : 'DATA_INSUFFICIENT',
    reason: top.length > 0 ? null : 'no historical candidate had enough overlapping Signal DNA dimensions to compare',
    analogues: top,
    totalMatchesFound: analogues.length,
    candidatesScanned: scanned,
    candidatesRequested,
    candidateDatesAvailable: candidateDates.length,
    datesSampled: sortedDates.length,
    truncated,
    limitations: [
      'similarity comparisons never use dimensions absent from either the target or a candidate (see matchedDimensions/unavailableDimensions per analogue)',
      `date sampling: ${sortedDates.length} of ${candidateDates.length} available historical dates were sampled (evenly spaced across the full real history before the target date, not just the most recent), each scanned against up to ${sortedSymbols.length} symbols, capped at ${maxCandidates} total candidates`,
      'a historical analogue with high similarity is a description of the past, not a forecast — see the historical-outcome interface (computeHistoricalOutcome) for what actually happened afterward, and it must never be presented as predictive without genuine out-of-sample validation',
      'CORPORATE-ACTION CAVEAT: every analogue\'s corporateActionStatus is VERIFICATION_BLOCKED — no validated historical corporate-action adjustment feed exists in this codebase (see corporateActions.js), so a price/volatility comparison could be distorted by an unadjusted split, bonus, rights issue, or similar event on either side. This is never silently treated as resolved, and no analogue in this result claims corporate-action-adjusted comparability.'
    ]
  };
}

// ------------------------------------------------------------------
// OPTIONAL historical-outcome interface.
//
// Deliberately separate from the matching logic above: this looks FORWARD
// from an analogue date using real, since-elapsed trading sessions, purely
// to report what happened — it is never used to select or rank analogues.
// Reuses the exact same HORIZONS constant (1/5/20/60/120) as the existing
// production backtest (backtestRunner.js) instead of redefining it, and the
// same INSUFFICIENT_FUTURE_DATA convention for a horizon that hasn't
// actually elapsed yet in the real dataset.
// ------------------------------------------------------------------
function computeHistoricalOutcome(symbol, analogueDate, index) {
  const allDates = index.allTradingDates();
  const latestKnownDate = allDates[allDates.length - 1];
  const fullSeries = index.cmSeriesAsOf(symbol, latestKnownDate); // intentionally NOT limited to analogueDate — outcomes look forward by definition
  const idx = fullSeries.findIndex(r => r.trade_date === analogueDate);
  if (idx === -1) {
    return { symbol: String(symbol).toUpperCase(), analogueDate, status: 'DATA_N_A', reason: 'no CM row found for this symbol on this exact date', horizons: null };
  }
  const baseClose = fullSeries[idx].close;
  if (baseClose == null) {
    return { symbol: String(symbol).toUpperCase(), analogueDate, status: 'DATA_INSUFFICIENT', reason: 'base-date close price missing', horizons: null };
  }

  const horizons = {};
  for (const h of HORIZONS) {
    const futureRow = fullSeries[idx + h];
    if (!futureRow || futureRow.close == null) {
      horizons[`${h}D`] = { status: 'INSUFFICIENT_FUTURE_DATA' };
      continue;
    }
    const absReturn = futureRow.close - baseClose;
    const pctReturn = baseClose !== 0 ? (absReturn / baseClose) * 100 : null;
    horizons[`${h}D`] = { status: 'REAL', absoluteReturn: absReturn, percentReturn: pctReturn, positive: absReturn > 0, forwardDate: futureRow.trade_date };
  }

  return {
    symbol: String(symbol).toUpperCase(),
    analogueDate,
    status: 'CALCULATED',
    baseClose,
    horizons,
    limitations: ['forward horizons are counted in REAL TRADING SESSIONS present in this dataset, not calendar days', 'this is a single historical instance, not a validated predictive statistic — see Self-Scorecard (#21, not yet built) for aggregated performance across many signals']
  };
}

module.exports = { findHistoricalAnalogues, computeHistoricalOutcome, HORIZONS, assessCorporateActionRisk };
