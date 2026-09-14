const assert = require('node:assert/strict');
const { classifyAccumulationDNA } = require('../lib/accumulationDNA');
const { getSharedIndex } = require('../lib/symbolSeries');

// --- SYNTHETIC_TEST_ONLY: hand-built series with known, deterministic outcomes ---
function buildSeries({ n, baseClose, baseDeliv, baseVol, changes = {} }) {
  const rows = [];
  let close = baseClose;
  for (let i = 0; i < n; i += 1) {
    const c = changes[i] || {};
    close = c.close != null ? c.close : close;
    rows.push({ trade_date: `2026-01-${String(i + 1).padStart(2, '0')}`, close, volume: c.volume != null ? c.volume : baseVol, deliv_per: c.deliv_per != null ? c.deliv_per : baseDeliv });
  }
  return rows;
}

// Too little history -> DATA_INSUFFICIENT, never a guessed label
const tiny = buildSeries({ n: 5, baseClose: 100, baseDeliv: 40, baseVol: 1000 });
const tinyResult = classifyAccumulationDNA(tiny, { recentWindow: 10, baselineWindow: 20 });
assert.equal(tinyResult.status, 'DATA_INSUFFICIENT');
assert.equal(tinyResult.dnaType, 'DATA_INSUFFICIENT');

// Flat baseline (delivery 30%, low vol) then recent window: delivery+volume both jump, price rises >=3% -> AGGRESSIVE_ACCUMULATION
const aggressiveChanges = {};
for (let i = 20; i < 30; i += 1) aggressiveChanges[i] = { deliv_per: 45, volume: 2000, close: 100 + (i - 19) * 0.5 };
const aggressive = buildSeries({ n: 30, baseClose: 100, baseDeliv: 30, baseVol: 1000, changes: aggressiveChanges });
const aggressiveResult = classifyAccumulationDNA(aggressive, { recentWindow: 10, baselineWindow: 20 });
assert.equal(aggressiveResult.status, 'CLASSIFIED');
assert.equal(aggressiveResult.dnaType, 'AGGRESSIVE_ACCUMULATION');
assert.ok(aggressiveResult.evidence.deliveryRatio > 1.3);

// High delivery/volume, price essentially flat -> PRICE_SUPPRESSED_ACCUMULATION
const suppressedChanges = {};
for (let i = 20; i < 30; i += 1) suppressedChanges[i] = { deliv_per: 45, volume: 1800, close: 100 + (i % 2 === 0 ? 0.1 : -0.1) };
const suppressed = buildSeries({ n: 30, baseClose: 100, baseDeliv: 30, baseVol: 1000, changes: suppressedChanges });
const suppressedResult = classifyAccumulationDNA(suppressed, { recentWindow: 10, baselineWindow: 20 });
assert.equal(suppressedResult.dnaType, 'PRICE_SUPPRESSED_ACCUMULATION');

// Falling price with elevated volume -> DISTRIBUTION
const distChanges = {};
for (let i = 20; i < 30; i += 1) distChanges[i] = { deliv_per: 30, volume: 1500, close: 100 - (i - 19) * 1.2 };
const dist = buildSeries({ n: 30, baseClose: 100, baseDeliv: 30, baseVol: 1000, changes: distChanges });
const distResult = classifyAccumulationDNA(dist, { recentWindow: 10, baselineWindow: 20 });
assert.equal(distResult.dnaType, 'DISTRIBUTION');

// Nothing unusual at all -> NO_CLEAR_PATTERN (explicitly neutral, not forced)
const flat = buildSeries({ n: 30, baseClose: 100, baseDeliv: 30, baseVol: 1000 });
const flatResult = classifyAccumulationDNA(flat, { recentWindow: 10, baselineWindow: 20 });
assert.equal(flatResult.dnaType, 'NO_CLEAR_PATTERN');

// --- REAL DATA: run against actual repository history for a handful of real symbols ---
const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const symbols = index.symbols().slice(0, 25);
let classifiedCount = 0;
let insufficientCount = 0;
const validTypes = new Set(['DISTRIBUTION', 'AGGRESSIVE_ACCUMULATION', 'PRICE_SUPPRESSED_ACCUMULATION', 'FO_LED_ACCUMULATION', 'DELIVERY_LED_ACCUMULATION', 'BREAKOUT_ACCUMULATION', 'LATE_ACCUMULATION', 'QUIET_ACCUMULATION', 'EARLY_ACCUMULATION', 'NO_CLEAR_PATTERN']);
for (const sym of symbols) {
  const series = index.cmSeriesAsOf(sym, lastDate);
  const foSeries = index.foSeriesAsOf(sym, lastDate);
  const r = classifyAccumulationDNA(series, { foSeries });
  if (r.status === 'CLASSIFIED') { classifiedCount += 1; assert.ok(validTypes.has(r.dnaType), `unexpected dnaType ${r.dnaType} for ${sym}`); }
  else insufficientCount += 1;
}
console.log(`REAL DATA Accumulation DNA scan over ${symbols.length} symbols as of ${lastDate}: ${classifiedCount} classified, ${insufficientCount} DATA_INSUFFICIENT`);
assert.ok(classifiedCount > 0, 'expected at least some real symbols to have enough history to classify');

// ============================================================
// QC AUDIT PASS (13-Sep-2026) — additional edge-case coverage
// ============================================================

// Sparse-close window: fewer than 70% real closes -> DATA_INSUFFICIENT, never computed on a near-empty sample
// (built directly, not via buildSeries helper, since that helper carries forward the last non-null close
// and cannot express an actual missing value)
const sparseClose = Array.from({ length: 30 }, (_, i) => ({
  trade_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  close: i % 3 === 0 ? 100 + i * 0.1 : null,
  volume: 1000,
  deliv_per: 30
}));
const sparseCloseResult = classifyAccumulationDNA(sparseClose, { recentWindow: 10, baselineWindow: 20 });
assert.equal(sparseCloseResult.status, 'DATA_INSUFFICIENT');

// Sparse-delivery window (closes fine, but most delivery values missing in the recent window):
// deliveryRatio must be nulled out (never computed from a mostly-missing mean), so a rule requiring
// deliveryRatio must NOT fire purely from a sparse sample — result should not be a delivery-driven type.
const sparseDeliv = Array.from({ length: 30 }, (_, i) => ({
  trade_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  close: 100,
  volume: 1000,
  deliv_per: i >= 20 ? (i % 4 === 0 ? 90 : null) : 30
}));
const sparseDelivResult = classifyAccumulationDNA(sparseDeliv, { recentWindow: 10, baselineWindow: 20 });
if (sparseDelivResult.status === 'CLASSIFIED') {
  assert.equal(sparseDelivResult.evidence.deliveryRatio, null, 'deliveryRatio should be nulled out when recent-window delivery coverage is below 50%');
  assert.ok(sparseDelivResult.limitations.some(l => l.includes('delivery ratio not computed')));
}

// Reproducibility: identical input -> identical output (deep-equal)
const reproA = buildSeries({ n: 30, baseClose: 100, baseDeliv: 35, baseVol: 1200 });
const reproB = JSON.parse(JSON.stringify(reproA));
const reproResultA = classifyAccumulationDNA(reproA, { recentWindow: 10, baselineWindow: 20 });
const reproResultB = classifyAccumulationDNA(reproB, { recentWindow: 10, baselineWindow: 20 });
assert.deepEqual(reproResultA, reproResultB);

// Confidence is never HIGH (per module's own documented policy — no fabricated confidence)
for (const r of [aggressiveResult, suppressedResult, distResult, flatResult]) {
  assert.notEqual(r.confidence, 'HIGH');
}

console.log('Accumulation DNA QC edge cases passed: sparse-close gate, sparse-delivery ratio nulling, reproducibility, confidence ceiling');
console.log('accumulationDNA.test.js passed');
