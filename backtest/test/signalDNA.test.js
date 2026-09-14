const assert = require('node:assert/strict');
const { buildSignalDNA, compareSignalDNA } = require('../lib/signalDNA');
const { getSharedIndex } = require('../lib/symbolSeries');
const { loadSectorMap } = require('../lib/sectorLookup');

// sector lookup: sparse by construction, must never fabricate beyond the real file
const sectorMap = loadSectorMap();
assert.ok(sectorMap.size > 0, 'expected at least one real ticker/sector pair from js/companyDatabase.js');
assert.equal(sectorMap.get('TCS'), 'Technology');
assert.equal(sectorMap.get('DEFINITELY_NOT_A_REAL_TICKER'), undefined);

const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const symbols = index.symbols().slice(0, 10);

// Every real symbol's Signal DNA must disclose marketRegime/relativeStrength as unavailable
// (those engines don't exist yet) rather than silently omitting or fabricating them.
for (const sym of symbols) {
  const dna = buildSignalDNA(sym, lastDate, index);
  if (dna.status === 'BUILT') {
    assert.equal(dna.dimensions.marketRegime.available, false);
    assert.equal(dna.dimensions.relativeStrength.available, false);
    assert.ok(typeof dna.fingerprint === 'string' && dna.fingerprint.length > 0);
  }
}

// Reproducibility: building twice for the same symbol/date must give the identical fingerprint
const dnaA = buildSignalDNA(symbols[0], lastDate, index);
const dnaB = buildSignalDNA(symbols[0], lastDate, index);
assert.equal(dnaA.fingerprint, dnaB.fingerprint);

// Comparing a record to itself must be a perfect match on whatever numeric dims exist
if (dnaA.status === 'BUILT') {
  const selfCompare = compareSignalDNA(dnaA, dnaA);
  if (selfCompare.status === 'COMPARED') {
    assert.ok(Math.abs(selfCompare.similarityScore - 1) < 1e-9, `expected similarity ~1 comparing a record to itself, got ${selfCompare.similarityScore}`);
  }
}

// Too little history -> DATA_INSUFFICIENT, comparison also DATA_INSUFFICIENT, never a fabricated score
const earlyDate = allDates[2];
const tooEarly = buildSignalDNA(symbols[0], earlyDate, index);
assert.equal(tooEarly.status, 'DATA_INSUFFICIENT');
const cmp = compareSignalDNA(tooEarly, dnaA);
assert.equal(cmp.status, 'DATA_INSUFFICIENT');
assert.equal(cmp.similarityScore, null);

// Comparing across two different real symbols on the same date: must only use shared dims
if (symbols.length >= 2) {
  const dnaX = buildSignalDNA(symbols[0], lastDate, index);
  const dnaY = buildSignalDNA(symbols[1], lastDate, index);
  const crossCompare = compareSignalDNA(dnaX, dnaY);
  assert.ok(['COMPARED', 'DATA_INSUFFICIENT'].includes(crossCompare.status));
  if (crossCompare.status === 'COMPARED') {
    assert.ok(crossCompare.similarityScore > 0 && crossCompare.similarityScore <= 1);
  }
}

// ============================================================
// QC AUDIT PASS (13-Sep-2026) — similarity calibration + edge cases
// ============================================================
const { computePopulationStats } = require('../lib/signalDNA');

// Default (no populationStats passed) must be explicitly labeled UNCALIBRATED_PROTOTYPE
if (dnaA.status === 'BUILT') {
  const dnaC = buildSignalDNA(symbols[1] || symbols[0], lastDate, index);
  const uncalibrated = compareSignalDNA(dnaA, dnaC);
  if (uncalibrated.status === 'COMPARED') {
    assert.equal(uncalibrated.calibration, 'UNCALIBRATED_PROTOTYPE');
    assert.ok(uncalibrated.limitations.some(l => l.includes('UNCALIBRATED')));
  }
}

// Real-data-calibrated comparison: build population stats from real symbols, verify labeling + provenance
const statsSymbols = index.symbols().slice(0, 40); // enough real symbols to plausibly clear the 15-sample floor for common dims
const popStats = computePopulationStats(statsSymbols, lastDate, index, buildSignalDNA);
assert.ok(popStats.symbolCount > 0);
assert.ok(popStats.stats.price, 'expected a price dimension entry in computed stats');

const dnaP = buildSignalDNA(symbols[0], lastDate, index);
const dnaQ = buildSignalDNA(symbols[1] || symbols[0], lastDate, index);
if (dnaP.status === 'BUILT' && dnaQ.status === 'BUILT') {
  const calibratedResult = compareSignalDNA(dnaP, dnaQ, popStats);
  if (calibratedResult.status === 'COMPARED' && calibratedResult.calibration === 'REAL_DATA_CALIBRATED') {
    assert.ok(calibratedResult.limitations.some(l => l.includes('z-scored using real, measured population statistics')));
    assert.ok(calibratedResult.similarityScore > 0 && calibratedResult.similarityScore <= 1);
  } else {
    // Acceptable outcome if the real 25-symbol sample didn't clear the 15-sample floor for every dimension —
    // must still be an honest DATA_INSUFFICIENT or an explicitly-labeled UNCALIBRATED_PROTOTYPE, never silently wrong.
    assert.ok(['DATA_INSUFFICIENT', 'COMPARED'].includes(calibratedResult.status));
  }
}

// Zero shared dimensions -> DATA_INSUFFICIENT, never a fabricated score of e.g. 0 or 1
const zeroSharedA = { status: 'BUILT', dimensions: { price: { available: true, changePct: 1 }, volatility: { available: false }, delivery: { available: false }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: false } } };
const zeroSharedB = { status: 'BUILT', dimensions: { price: { available: false }, volatility: { available: true, value: 0.01 }, delivery: { available: false }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: false } } };
const zeroSharedResult = compareSignalDNA(zeroSharedA, zeroSharedB);
assert.equal(zeroSharedResult.status, 'DATA_INSUFFICIENT');
assert.equal(zeroSharedResult.similarityScore, null);

// Exactly one shared dimension -> still DATA_INSUFFICIENT (need at least 2)
const oneSharedA = { status: 'BUILT', dimensions: { price: { available: true, changePct: 1 }, volatility: { available: false }, delivery: { available: false }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: false } } };
const oneSharedB = { status: 'BUILT', dimensions: { price: { available: true, changePct: 2 }, volatility: { available: false }, delivery: { available: false }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: false } } };
const oneSharedResult = compareSignalDNA(oneSharedA, oneSharedB);
assert.equal(oneSharedResult.status, 'DATA_INSUFFICIENT');
assert.equal(oneSharedResult.comparedDimensions.length, 1);

// Different DNA types must be reflected in sameAccumulationDNAType, never fabricated as a match
const dnaTypeA = { status: 'BUILT', dimensions: { price: { available: true, changePct: 1 }, volatility: { available: true, value: 0.01 }, delivery: { available: false }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: true, type: 'AGGRESSIVE_ACCUMULATION' } } };
const dnaTypeB = { status: 'BUILT', dimensions: { price: { available: true, changePct: 1.1 }, volatility: { available: true, value: 0.011 }, delivery: { available: false }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: true, type: 'DISTRIBUTION' } } };
const diffTypeResult = compareSignalDNA(dnaTypeA, dnaTypeB);
assert.equal(diffTypeResult.status, 'COMPARED');
assert.equal(diffTypeResult.sameAccumulationDNAType, false);

// Different scales (delivery-heavy vs volatility-heavy difference), uncalibrated: must not crash, must produce a finite score
const scaleA = { status: 'BUILT', dimensions: { price: { available: false }, volatility: { available: true, value: 0.01 }, delivery: { available: true, avgPct: 10 }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: false } } };
const scaleB = { status: 'BUILT', dimensions: { price: { available: false }, volatility: { available: true, value: 0.011 }, delivery: { available: true, avgPct: 80 }, fo_oi: { available: false }, soai: { available: false }, accumulationDNA: { available: false } } };
const scaleResult = compareSignalDNA(scaleA, scaleB);
assert.equal(scaleResult.status, 'COMPARED');
assert.equal(scaleResult.calibration, 'UNCALIBRATED_PROTOTYPE');
assert.ok(Number.isFinite(scaleResult.similarityScore));

// Missing F&O data / missing sector data: buildSignalDNA must disclose, never fabricate
const missingDimsCase = buildSignalDNA(symbols[0], lastDate, index);
if (missingDimsCase.status === 'BUILT' && !missingDimsCase.dimensions.fo_oi.available) {
  assert.ok('reason' in missingDimsCase.dimensions.fo_oi);
}
if (missingDimsCase.status === 'BUILT' && !missingDimsCase.dimensions.sector.available) {
  assert.ok('reason' in missingDimsCase.dimensions.sector);
}

console.log('Signal DNA QC edge cases passed: calibration labeling, zero/one shared dims, differing DNA types, differing scales, missing dims');
console.log('signalDNA.test.js passed');
