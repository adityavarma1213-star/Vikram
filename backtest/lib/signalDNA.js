'use strict';
// Signal DNA.
//
// Represents a symbol's state as-of a date as a fixed set of measurable
// dimensions, each sourced from an existing engine (no new calculation is
// invented here — this is a pure composition/fingerprint layer, same
// anti-duplication principle as accumulationIntelligence.js). Two Signal DNA
// records can be compared (see compareSignalDNA) to answer "have we seen a
// similar setup before" — the foundation for the Historical Analogue Engine
// (#6), not built yet.
//
// Every dimension that cannot be computed from real data is explicitly
// marked unavailable (never zero-filled, never imputed) and excluded from
// any similarity comparison rather than silently treated as "no signal."
//
// KNOWN, DISCLOSED GAPS (verified this session, not assumed):
//   - sector: only available for symbols present in js/companyDatabase.js
//     (5 tickers total, verified by count) — sparse by construction.
//   - marketRegime: the Market Regime Engine (#9) has not been built yet in
//     this codebase, so this dimension is always UNAVAILABLE for now. This
//     module does not fabricate a regime label to fill the slot.
//   - relativeStrength (vs. an index): no index-level price series is
//     computed anywhere in this codebase yet, so this dimension is always
//     UNAVAILABLE until that exists.

const { classifyAccumulationDNA } = require('./accumulationDNA');
const { computeSOAI } = require('./soai');
const { detectFalseAccumulation } = require('./falseAccumulationDetector');
const { loadSectorMap } = require('./sectorLookup');
const { windowStats } = require('./accumulationDNA');

let _sectorMap = null;
function sectorFor(symbol) {
  if (!_sectorMap) _sectorMap = loadSectorMap();
  return _sectorMap.get(String(symbol).toUpperCase()) || null;
}

function buildSignalDNA(symbol, asOfDate, index, opts = {}) {
  const cmSeries = index.cmSeriesAsOf(symbol, asOfDate);
  const foSeries = index.foSeriesAsOf(symbol, asOfDate);

  if (cmSeries.length < 5) {
    return { symbol: String(symbol).toUpperCase(), asOfDate, status: 'DATA_INSUFFICIENT', reason: 'fewer than 5 trading days of history as of this date', dimensions: null, fingerprint: null };
  }

  const dna = classifyAccumulationDNA(cmSeries, { ...opts.dna, foSeries });
  const soai = computeSOAI(cmSeries, opts.soai);
  const falseAcc = detectFalseAccumulation(cmSeries, foSeries, asOfDate, opts.falseAccumulation);
  const recentStats = windowStats(cmSeries.slice(-10));
  const sector = sectorFor(symbol);

  const dimensions = {
    price: recentStats ? { changePct: recentStats.priceChangePct, available: true } : { available: false },
    volatility: recentStats && recentStats.volatility != null ? { value: recentStats.volatility, available: true } : { available: false },
    delivery: recentStats && recentStats.avgDeliveryPct != null ? { avgPct: recentStats.avgDeliveryPct, available: true } : { available: false },
    volume: recentStats && recentStats.avgVolume != null ? { avg: recentStats.avgVolume, available: true } : { available: false },
    fo_oi: dna.evidence && dna.evidence.oiRatio != null ? { ratio: dna.evidence.oiRatio, available: true } : { available: false, reason: 'insufficient F&O/OI history over this window' },
    accumulationDNA: dna.status === 'CLASSIFIED' ? { type: dna.dnaType, available: true } : { available: false, reason: dna.reason },
    soai: soai.status === 'CALCULATED' ? { z: soai.soaiZ, label: soai.label, available: true } : { available: false, reason: soai.reason },
    risk: { falseAccumulationVerdict: falseAcc.verdict, available: true },
    sector: sector ? { value: sector, available: true } : { available: false, reason: 'symbol not present in the sparse (5-ticker) sector reference; not computed elsewhere in this codebase' },
    marketRegime: { available: false, reason: 'Market Regime Engine (#9) not implemented yet in this codebase' },
    relativeStrength: { available: false, reason: 'no index-level price series computed anywhere in this codebase yet' }
  };

  // Reproducible fingerprint: rounded numeric dimensions only, stable key order.
  // Two runs over the same real data always produce the same fingerprint.
  const numericParts = [];
  if (dimensions.price.available) numericParts.push(`price:${dimensions.price.changePct.toFixed(2)}`);
  if (dimensions.volatility.available) numericParts.push(`vol:${dimensions.volatility.value.toFixed(4)}`);
  if (dimensions.delivery.available) numericParts.push(`deliv:${dimensions.delivery.avgPct.toFixed(2)}`);
  if (dimensions.fo_oi.available) numericParts.push(`oi:${dimensions.fo_oi.ratio.toFixed(2)}`);
  if (dimensions.soai.available) numericParts.push(`soai:${dimensions.soai.z.toFixed(2)}`);
  numericParts.push(`dna:${dimensions.accumulationDNA.available ? dimensions.accumulationDNA.type : 'NA'}`);
  numericParts.push(`risk:${dimensions.risk.falseAccumulationVerdict}`);
  const fingerprint = numericParts.join('|');

  const availableCount = Object.values(dimensions).filter(d => d.available).length;

  return {
    symbol: String(symbol).toUpperCase(),
    asOfDate,
    status: availableCount >= 4 ? 'BUILT' : 'DATA_INSUFFICIENT',
    dimensions,
    fingerprint,
    availableDimensionCount: availableCount,
    totalDimensionCount: Object.keys(dimensions).length
  };
}

// Euclidean-style distance over ONLY the numeric dimensions available in BOTH
// records. Returns null (not a fabricated score) if fewer than 2 numeric
// dimensions overlap — comparing on 0 or 1 shared numbers is not a
// meaningful similarity claim.
// ============================================================
// QC AUDIT PASS (13-Sep-2026) — similarity normalization
// ============================================================
// FINDING: the original compareSignalDNA computed raw Euclidean distance
// directly over price (a percentage, roughly -20..+20), volatility (a
// decimal stdev of daily returns, roughly 0.005..0.05), delivery (a
// percentage, 0..100), fo_oi (a ratio centered near 1.0), and soai (already
// a z-score, roughly -3..+3). These are not comparable units — delivery's
//0..100 range would numerically dominate a raw Euclidean sum next to
// volatility's 0.005..0.05 range, regardless of which difference is
// actually more meaningful. This is a genuine bug, not a style choice.
//
// FIX: rather than inventing arbitrary weights (explicitly disallowed),
// this module can now optionally z-score each dimension using REAL,
// COMPUTED statistics drawn from the actual dataset itself
// (computePopulationStats, below) — mean/stdev per dimension across a real
// sample of symbol/date observations. That is calibration from real data,
// not a fabricated parameter. When such stats are supplied and have enough
// samples, the result is labeled `calibration: 'REAL_DATA_CALIBRATED'` with
// full provenance (n, symbols, dates). When they are NOT supplied (the
// default, to keep this a non-breaking addition), the result is labeled
// `calibration: 'UNCALIBRATED_PROTOTYPE'` and says so explicitly — it must
// never be presented as a statistically validated similarity score.

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

const NUMERIC_DIMS = [
  ['price', d => d.price.available ? d.price.changePct : null],
  ['volatility', d => d.volatility.available ? d.volatility.value : null],
  ['delivery', d => d.delivery.available ? d.delivery.avgPct : null],
  ['fo_oi', d => d.fo_oi.available ? d.fo_oi.ratio : null],
  ['soai', d => d.soai.available ? d.soai.z : null]
];

const MIN_SAMPLES_FOR_CALIBRATION = 15; // small, disclosed floor — not tuned to any particular outcome

// Builds real-data-derived mean/stdev per dimension by scanning actual
// Signal DNA records (never synthetic values) for the given symbols as of
// the given date. Every value that feeds this comes from buildSignalDNA
// running against real repository data — this is measurement, not invention.
function computePopulationStats(symbols, asOfDate, index, buildFn) {
  const valuesByDim = Object.fromEntries(NUMERIC_DIMS.map(([name]) => [name, []]));
  const usedSymbols = [];
  for (const sym of symbols) {
    const record = buildFn(sym, asOfDate, index);
    if (!record || record.status !== 'BUILT') continue;
    usedSymbols.push(sym);
    for (const [name, extractor] of NUMERIC_DIMS) {
      const v = extractor(record.dimensions);
      if (v != null) valuesByDim[name].push(v);
    }
  }
  const stats = {};
  for (const [name] of NUMERIC_DIMS) {
    const vals = valuesByDim[name];
    stats[name] = { mean: mean(vals), stdev: stdev(vals), n: vals.length };
  }
  return { stats, asOfDate, symbolCount: usedSymbols.length, symbols: usedSymbols };
}

function compareSignalDNA(a, b, populationStats = null) {
  if (!a || !b || a.status === 'DATA_INSUFFICIENT' || b.status === 'DATA_INSUFFICIENT') {
    return { similarityScore: null, comparedDimensions: [], status: 'DATA_INSUFFICIENT', reason: 'one or both Signal DNA records could not be built' };
  }

  // Per-dimension calibration decision (QC refinement): rather than an
  // all-or-nothing gate across every dimension, each dimension is normalized
  // independently if and only if its OWN population stats clear the sample
  // floor. A thinly-sampled dimension (e.g. F&O/OI, which this dataset has
  // real coverage gaps in) is simply excluded from THIS comparison rather
  // than dragging every other, well-sampled dimension back to raw units.
  const compared = [];
  const calibratedDims = [];
  const uncalibratedDims = [];
  let sumSq = 0;
  for (const [name, extractor] of NUMERIC_DIMS) {
    let av = extractor(a.dimensions);
    let bv = extractor(b.dimensions);
    if (av == null || bv == null) continue;

    const dimStats = populationStats && populationStats.stats ? populationStats.stats[name] : null;
    const dimCanCalibrate = dimStats && dimStats.n >= MIN_SAMPLES_FOR_CALIBRATION && dimStats.stdev != null && dimStats.stdev > 0;
    if (populationStats) {
      // Once a real populationStats object is supplied, we commit to calibrated mode:
      // a dimension without enough real samples to normalize honestly is excluded
      // entirely rather than mixed in raw (which would silently reintroduce the
      // scale-dominance bug this fix exists to remove).
      if (!dimCanCalibrate) continue;
      av = (av - dimStats.mean) / dimStats.stdev;
      bv = (bv - dimStats.mean) / dimStats.stdev;
      calibratedDims.push(name);
    } else {
      uncalibratedDims.push(name);
    }
    compared.push(name);
    sumSq += (av - bv) ** 2;
  }

  if (compared.length < 2) {
    return { similarityScore: null, comparedDimensions: compared, status: 'DATA_INSUFFICIENT', reason: `only ${compared.length} numeric dimension(s) available${populationStats ? ' with sufficient population stats to calibrate' : ''}; need at least 2 for a meaningful similarity claim` };
  }

  const distance = Math.sqrt(sumSq);
  const similarityScore = 1 / (1 + distance); // in (0,1], 1 = identical on compared dimensions only
  const sameDNAType = a.dimensions.accumulationDNA.available && b.dimensions.accumulationDNA.available && a.dimensions.accumulationDNA.type === b.dimensions.accumulationDNA.type;

  const calibration = populationStats ? 'REAL_DATA_CALIBRATED' : 'UNCALIBRATED_PROTOTYPE';
  const limitations = [`similarity computed only over dimensions present in both records (${compared.join(', ')}) — absent dimensions are excluded, never imputed`];
  if (calibration === 'REAL_DATA_CALIBRATED') {
    limitations.push(`dimensions ${calibratedDims.join(', ')} were z-scored using real, measured population statistics (n=${populationStats.symbolCount} symbols as of ${populationStats.asOfDate}) — not invented weights`);
    const excludedForSampleSize = NUMERIC_DIMS.map(([n]) => n).filter(n => !calibratedDims.includes(n) && (extractDim(a, n) != null && extractDim(b, n) != null));
    if (excludedForSampleSize.length) limitations.push(`dimensions ${excludedForSampleSize.join(', ')} were available in both records but excluded from this comparison for lack of sufficient real population samples (need >= ${MIN_SAMPLES_FOR_CALIBRATION})`);
  } else {
    limitations.push('UNCALIBRATED: raw values were compared directly without normalizing for each dimension\'s different scale/units (percentage vs. decimal vs. ratio vs. z-score). A large difference in one dimension (e.g. delivery %, roughly 0-100) can numerically dominate a small but meaningful difference in another (e.g. volatility, roughly 0.005-0.05). This similarity score is a prototype only and must not be presented as statistically validated. Pass a populationStats object (see computePopulationStats) built from at least 15 real symbol observations to get a REAL_DATA_CALIBRATED comparison.');
  }

  return {
    similarityScore,
    comparedDimensions: compared,
    sameAccumulationDNAType: sameDNAType,
    status: 'COMPARED',
    calibration,
    limitations
  };
}

function extractDim(record, name) {
  const entry = NUMERIC_DIMS.find(([n]) => n === name);
  return entry ? entry[1](record.dimensions) : null;
}

module.exports = { buildSignalDNA, compareSignalDNA, computePopulationStats };

