const assert = require('node:assert/strict');
const { replaySignal, OUT_OF_SCOPE } = require('../lib/forensicSignalReplay');
const { getSharedIndex } = require('../lib/symbolSeries');
const { loadSectorMap } = require('../lib/sectorLookup');

const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const symbols = index.symbols();

// ============================================================
// REAL-DATA TESTS
// ============================================================

// --- full replay for a real, sector-mapped symbol (TCS) ---
const tcsReplay = replaySignal('TCS', lastDate, index);
assert.equal(tcsReplay.status, 'REPLAYED');
assert.equal(tcsReplay.symbol, 'TCS');
assert.equal(tcsReplay.lookAheadStatus, 'NO_LOOK_AHEAD_VERIFIED');
assert.ok(tcsReplay.provenance.noNewCalculation === true);
assert.deepEqual(tcsReplay.outOfScope, OUT_OF_SCOPE);
assert.equal(tcsReplay.outOfScope.length, 4);
// every named out-of-scope step must reference Aditya explicitly — never silently dropped
for (const step of tcsReplay.outOfScope) assert.ok(step.includes('Aditya'));

// every composed component must be present, using real canonical engine outputs (not stubs)
assert.ok('dnaType' in tcsReplay.accumulationDNA || tcsReplay.accumulationDNA.status === 'DATA_INSUFFICIENT');
assert.ok('soaiZ' in tcsReplay.soai || tcsReplay.soai.status === 'DATA_INSUFFICIENT');
assert.ok('verdict' in tcsReplay.falseAccumulation);
assert.ok('regime' in tcsReplay.marketRegime || tcsReplay.marketRegime.status !== 'CLASSIFIED');
assert.ok('status' in tcsReplay.sectorContext);
assert.ok('fingerprint' in tcsReplay.signalDNA || tcsReplay.signalDNA.status === 'DATA_INSUFFICIENT');
assert.ok('analogues' in tcsReplay.historicalAnalogues);
assert.ok('status' in tcsReplay.forwardOutcome);

// TCS has a real sector mapping (Technology) — sectorContext must actually attempt a real calculation, not skip it
assert.equal(loadSectorMap().get('TCS'), 'Technology');
assert.ok(tcsReplay.sectorContext.status === 'CALCULATED' || tcsReplay.sectorContext.status === 'DATA_INSUFFICIENT');
if (tcsReplay.sectorContext.status === 'DATA_INSUFFICIENT') {
  assert.ok(!tcsReplay.sectorContext.reason.includes('no real sector mapping'), 'TCS IS mapped — must not be treated as unmapped');
}

// --- a real symbol with NO sector mapping must honestly disclose that, not skip silently ---
const unmappedSymbol = symbols.find(s => !loadSectorMap().has(s));
assert.ok(unmappedSymbol, 'expected at least one real symbol without a sector mapping (only 5/2950 are mapped)');
const unmappedReplay = replaySignal(unmappedSymbol, lastDate, index);
if (unmappedReplay.status === 'REPLAYED') {
  assert.equal(unmappedReplay.sectorContext.status, 'DATA_INSUFFICIENT');
  assert.ok(unmappedReplay.sectorContext.reason.includes('no real sector mapping'));
}

// --- reproducibility ---
const tcsReplayB = replaySignal('TCS', lastDate, index);
assert.deepEqual(tcsReplay, tcsReplayB);

// --- no-look-ahead: every underlying series used must never exceed asOfDate ---
const midDate = allDates[150];
const midReplay = replaySignal('TCS', midDate, index);
const midSeries = index.cmSeriesAsOf('TCS', midDate);
assert.ok(midSeries.every(r => r.trade_date <= midDate));
if (midReplay.status === 'REPLAYED' && midReplay.historicalAnalogues.status === 'FOUND') {
  for (const a of midReplay.historicalAnalogues.analogues) {
    assert.ok(a.analogueDate < midDate, 'no-look-ahead violated inside a replayed historical analogue');
  }
}

// --- missing-data behavior: unknown date -> DATA_N_A, never fabricated ---
const naReplay = replaySignal('TCS', '1999-01-01', index);
assert.equal(naReplay.status, 'DATA_N_A');
assert.deepEqual(naReplay.outOfScope, OUT_OF_SCOPE);

// --- missing-data behavior: real date but symbol never traded (no CM row ever) -> DATA_INSUFFICIENT ---
const fakeSymbolReplay = replaySignal('DEFINITELY_NOT_A_REAL_SYMBOL_XYZ', lastDate, index);
assert.equal(fakeSymbolReplay.status, 'DATA_INSUFFICIENT');

// --- universe (PIT) status must be honestly surfaced, never silently claimed available ---
assert.ok(['VERIFICATION_BLOCKED', 'VALID', 'DATA_INSUFFICIENT'].includes(tcsReplay.universe.status));
if (tcsReplay.universe.status === 'VERIFICATION_BLOCKED') {
  assert.equal(tcsReplay.pitStatus, 'PARTIALLY PROTECTED / FOUNDATION DEPENDENCY REMAINS');
}

console.log(`REAL DATA: full replay for TCS@${lastDate}: DNA=${tcsReplay.accumulationDNA.dnaType}, SOAI=${tcsReplay.soai.label}, FalseAcc=${tcsReplay.falseAccumulation.verdict}, Regime=${tcsReplay.marketRegime.regime}, Sector=${tcsReplay.sectorContext.status}, SignalDNA=${tcsReplay.signalDNA.status}, Analogues=${tcsReplay.historicalAnalogues.status}, PIT=${tcsReplay.pitStatus}`);

// --- run replay across a handful of real symbols to confirm general stability (not just TCS) ---
let replayed = 0, insufficient = 0;
for (const sym of symbols.slice(0, 15)) {
  const r = replaySignal(sym, lastDate, index);
  if (r.status === 'REPLAYED') replayed += 1; else insufficient += 1;
}
console.log(`REAL DATA: replayed ${replayed}/15 sampled real symbols as of ${lastDate} (${insufficient} DATA_INSUFFICIENT)`);
assert.ok(replayed > 0);

console.log('forensicSignalReplay.test.js passed');
