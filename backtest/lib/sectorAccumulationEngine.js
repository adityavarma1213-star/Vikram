'use strict';
// Sector Accumulation Intelligence / Capital Rotation (#8/#14).
//
// OWNERSHIP NOTE: sector/industry classification is Nirmala Data Trust
// Foundation territory in principle, but no such feed exists in this
// repository — the ONLY real sector data anywhere is the 5-ticker mapping
// in `js/companyDatabase.js`, consumed via the existing canonical
// `sectorLookup.js` (built session 2, unchanged). This module does not
// invent a broader sector mapping, does not scrape/guess sectors for the
// other 2,945 real symbols, and does not create a parallel data pipeline.
// It composes already-canonical engines (`marketRegimeEngine.js`'s
// `computeMarketSnapshot`, `accumulationDNA.js`, `soai.js`) scoped to
// whichever symbols a given sector's real mapping actually contains.
//
// CONFLICT AGAINST: nirmalavarma1213@gmail.com — Nirmala
// CURRENT WORK: Sector Accumulation / Capital Rotation (#8/#14)
// CONFLICT: genuine, comprehensive sector/industry classification across
//   the real ~2,950-symbol universe is a Data Trust Foundation dependency
//   that does not currently exist. Only 5 of 2,950 real symbols (0.17%)
//   have a real, sourced sector label.
// IMPACT: "Sector Accumulation Intelligence" and "Capital Rotation" as
//   originally scoped (breadth/rotation across the full universe's sectors)
//   cannot be genuinely computed at real breadth with current evidence.
// ACTION: built the full canonical engine and applied it honestly to the
//   real (if sparse) sector data that does exist, rather than waiting or
//   fabricating a broader mapping. Every result explicitly discloses
//   coverage and returns DATA_INSUFFICIENT/VERIFICATION_BLOCKED wherever
//   a sector has too few real, mapped symbols to compute a meaningful
//   aggregate (a floor of 2 is enforced — see MIN_SECTOR_SYMBOLS).
//
// NO-LOOK-AHEAD / LIFECYCLE: entirely inherited from `computeMarketSnapshot`
// and `classifyAccumulationDNA`/`computeSOAI`, which already enforce
// `trade_date <= asOfDate` and the exact-date lifecycle-eligibility check —
// this module adds no date-filtering logic of its own to get wrong.

const { loadSectorMap } = require('./sectorLookup');
const { computeMarketSnapshot } = require('./marketRegimeEngine');
const { classifyAccumulationDNA } = require('./accumulationDNA');
const { computeSOAI } = require('./soai');

const MIN_SECTOR_SYMBOLS = 2; // cannot compute a meaningful breadth/dispersion aggregate from a single stock

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

// Returns { sectorName -> [symbols with real data on file] } from the real (sparse) sector map,
// restricted to symbols that actually exist in the real dataset (index.symbols()).
function realSectorMembership(index) {
  const sectorMap = loadSectorMap();
  const realSymbols = new Set(index.symbols());
  const bySector = {};
  for (const [symbol, sector] of sectorMap.entries()) {
    if (!realSymbols.has(symbol)) continue; // sector file lists a ticker with no real CM data in this dataset — never included
    if (!bySector[sector]) bySector[sector] = [];
    bySector[sector].push(symbol);
  }
  return bySector;
}

function computeSectorAccumulation(sectorName, asOfDate, index) {
  const bySector = realSectorMembership(index);
  const symbols = bySector[sectorName] || [];
  const coverage = { sectorName, mappedSymbols: symbols.length, source: 'js/companyDatabase.js via sectorLookup.js (5 real tickers total across the whole dataset)' };

  if (symbols.length < MIN_SECTOR_SYMBOLS) {
    return {
      sectorName, asOfDate, status: 'DATA_INSUFFICIENT',
      reason: `only ${symbols.length} real, mapped symbol(s) in this sector (need >= ${MIN_SECTOR_SYMBOLS} to compute a meaningful breadth/dispersion aggregate) — sector coverage is a genuine data gap, not a calculation failure`,
      coverage, symbolsUsed: symbols, evidence: null
    };
  }

  const snapshot = computeMarketSnapshot(asOfDate, index, { candidateSymbols: symbols }); // reuses canonical aggregate calc, scoped to this sector
  if (snapshot.breadth.totalObserved === 0) {
    return { sectorName, asOfDate, status: 'DATA_INSUFFICIENT', reason: 'none of the sector\'s mapped symbols had a real row on this exact date (lifecycle/coverage gap)', coverage, symbolsUsed: symbols, evidence: null };
  }

  // Supporting evidence: per-symbol Accumulation DNA / SOAI within the sector (reused, not recomputed).
  const dnaCounts = {};
  const soaiZs = [];
  for (const sym of symbols) {
    const series = index.cmSeriesAsOf(sym, asOfDate);
    const dna = classifyAccumulationDNA(series);
    const key = dna.status === 'CLASSIFIED' ? dna.dnaType : 'DATA_INSUFFICIENT';
    dnaCounts[key] = (dnaCounts[key] || 0) + 1;
    const soai = computeSOAI(series);
    if (soai.status === 'CALCULATED' && soai.soaiZ != null) soaiZs.push(soai.soaiZ);
  }
  const accumulatingCount = Object.entries(dnaCounts).filter(([k]) => k.includes('ACCUMULATION')).reduce((a, [, v]) => a + v, 0);
  const distributingCount = dnaCounts.DISTRIBUTION || 0;

  return {
    sectorName, asOfDate,
    status: 'CALCULATED',
    coverage,
    symbolsUsed: symbols,
    evidence: {
      breadthRatio: snapshot.breadth.breadthRatio,
      participationRate: snapshot.breadth.participationRate,
      aggregateTrendPct: snapshot.aggregateTrendPct,
      crossSectionalVolatility: snapshot.crossSectionalVolatility,
      accumulationDNACounts: dnaCounts,
      accumulatingCount, distributingCount,
      accumulatingSharePct: symbols.length > 0 ? Math.round((accumulatingCount / symbols.length) * 1000) / 10 : null,
      avgSOAIZ: soaiZs.length > 0 ? mean(soaiZs) : null,
      soaiSampleSize: soaiZs.length
    },
    confidence: symbols.length >= 5 ? 'LOW-MODERATE' : 'LOW', // never higher — 5 real sector tickers total is a thin evidentiary base by construction
    dataQualityStatus: 'REAL',
    lookAheadStatus: 'NO_LOOK_AHEAD_VERIFIED', // inherited from computeMarketSnapshot/classifyAccumulationDNA/computeSOAI
    limitations: [
      `this sector's real, mapped-symbol coverage is ${symbols.length} out of the sector's true real-world constituent count, which is unknown here (no comprehensive sector classification exists in this dataset)`,
      'evidence at this sample size is directional at best, not a validated sector-wide signal'
    ]
  };
}

// Capital rotation: compares sector-level accumulation strength across whatever real
// sectors have enough mapped symbols to be individually computable, at two points in
// time (a "recent" date and an earlier "baseline" date, both real, both <= asOfDate
// constraints inherited from the per-sector calls above) to describe whether strength
// appears to be moving toward or away from a sector. Never claims actual capital
// movement — uses "activity rotation" language throughout, consistent with the
// evidence-based terminology used by SOAI/Accumulation DNA.
function computeCapitalRotation(asOfDate, baselineDate, index) {
  const bySector = realSectorMembership(index);
  const sectorNames = Object.keys(bySector);
  const eligibleSectors = sectorNames.filter(s => bySector[s].length >= MIN_SECTOR_SYMBOLS);

  if (eligibleSectors.length < 2) {
    return {
      asOfDate, baselineDate, status: 'DATA_INSUFFICIENT',
      reason: `only ${eligibleSectors.length} of ${sectorNames.length} real, mapped sector(s) have >= ${MIN_SECTOR_SYMBOLS} symbols; rotation requires comparing at least 2 sectors, so genuine cross-sector rotation cannot be described from current evidence`,
      sectorsConsidered: sectorNames, eligibleSectors, rotation: null,
      dataQualityStatus: 'REAL',
      lookAheadStatus: baselineDate < asOfDate ? 'NO_LOOK_AHEAD_VERIFIED' : 'REQUIRES_BASELINE_BEFORE_ASOF',
      limitations: [
        `only ${eligibleSectors.length} of ${sectorNames.length} real sectors had enough mapped symbols to compare — this is a severe, disclosed coverage gap (5 real sector-mapped tickers total in this dataset), not a calculation limitation`
      ]
    };
  }

  const recentBySector = {};
  const baselineBySector = {};
  for (const sector of eligibleSectors) {
    recentBySector[sector] = computeSectorAccumulation(sector, asOfDate, index);
    baselineBySector[sector] = computeSectorAccumulation(sector, baselineDate, index);
  }

  const rotation = eligibleSectors
    .filter(s => recentBySector[s].status === 'CALCULATED' && baselineBySector[s].status === 'CALCULATED')
    .map(s => {
      const recentShare = recentBySector[s].evidence.accumulatingSharePct;
      const baselineShare = baselineBySector[s].evidence.accumulatingSharePct;
      const delta = recentShare != null && baselineShare != null ? Math.round((recentShare - baselineShare) * 10) / 10 : null;
      return { sector: s, recentAccumulatingSharePct: recentShare, baselineAccumulatingSharePct: baselineShare, deltaPct: delta };
    })
    .sort((a, b) => (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity));

  return {
    asOfDate, baselineDate,
    status: rotation.length >= 2 ? 'CALCULATED' : 'DATA_INSUFFICIENT',
    reason: rotation.length >= 2 ? null : 'fewer than 2 sectors produced comparable results at both dates',
    sectorsConsidered: sectorNames, eligibleSectors,
    rotation,
    dataQualityStatus: 'REAL',
    lookAheadStatus: baselineDate < asOfDate ? 'NO_LOOK_AHEAD_VERIFIED' : 'REQUIRES_BASELINE_BEFORE_ASOF',
    limitations: [
      'this describes ACTIVITY ROTATION observed in the available per-symbol data (which sectors\' mapped stocks show more/less accumulation-type activity), not actual verified capital flows — see accumulationDNA.js/soai.js for the same evidence-based language convention',
      `only ${eligibleSectors.length} of ${sectorNames.length} real sectors had enough mapped symbols to compare — this is a severe, disclosed coverage gap (5 real sector-mapped tickers total in this dataset), not a calculation limitation`
    ]
  };
}

module.exports = { computeSectorAccumulation, computeCapitalRotation, realSectorMembership, MIN_SECTOR_SYMBOLS };
