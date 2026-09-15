const assert = require('node:assert/strict');
const { buildAccumulationChain } = require('../lib/accumulationChain');
const { loadIndustryMap } = require('../lib/industryLookup');
const { loadSectorMap } = require('../lib/sectorLookup');
const { getSharedIndex } = require('../lib/symbolSeries');

const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const symbols = index.symbols();

// ============================================================
// industryLookup — mirrors sectorLookup.js's own test conventions
// ============================================================
const industryMap = loadIndustryMap();
assert.ok(industryMap.size > 0, 'expected at least one real ticker/industry pair from js/companyDatabase.js');
assert.equal(industryMap.get('TCS'), 'IT Services & Consulting');
assert.equal(industryMap.get('DEFINITELY_NOT_A_REAL_TICKER'), undefined);
// same 5 real tickers as sectorLookup — industry coverage is exactly as sparse, never expanded
assert.deepEqual([...industryMap.keys()].sort(), [...loadSectorMap().keys()].sort());

// ============================================================
// REAL-DATA TESTS
// ============================================================
const LAYER_NAMES = ['MARKET', 'SECTOR', 'INDUSTRY', 'VALUE_CHAIN', 'STOCK', 'DELIVERY', 'F&O', 'PRICE'];

// --- a real, sector/industry-mapped symbol (TCS): every layer present, VALUE_CHAIN always blocked ---
const tcsChain = buildAccumulationChain('TCS', lastDate, index);
assert.equal(tcsChain.status, 'BUILT');
assert.deepEqual(tcsChain.chain.map(l => l.name), LAYER_NAMES);
const valueChainLayer = tcsChain.chain.find(l => l.name === 'VALUE_CHAIN');
assert.equal(valueChainLayer.status, 'VERIFICATION_BLOCKED');
assert.ok(valueChainLayer.detail.reason.includes('no verified value-chain'));
// MARKET/STOCK/DELIVERY/PRICE must be real for a real, well-covered symbol on a real date
for (const name of ['MARKET', 'STOCK', 'DELIVERY', 'PRICE']) {
  const layer = tcsChain.chain.find(l => l.name === name);
  assert.equal(layer.status, 'REAL', `expected ${name} to be REAL for TCS@${lastDate}, got ${layer.status}`);
}
// TCS has a real sector+industry mapping — both should be REAL, never fabricated for an unmapped symbol
assert.equal(tcsChain.chain.find(l => l.name === 'SECTOR').status, 'REAL');
assert.equal(tcsChain.chain.find(l => l.name === 'INDUSTRY').status, 'REAL');
assert.equal(tcsChain.chain.find(l => l.name === 'INDUSTRY').detail.industryName, 'IT Services & Consulting');

// --- evidenceSummary must never fabricate a composite score, only list real statuses ---
assert.ok(tcsChain.evidenceSummary.layersBlockedOrInsufficient.some(l => l.name === 'VALUE_CHAIN'));
assert.ok(!('chainStrengthScore' in tcsChain.evidenceSummary));
assert.ok(!('overallScore' in tcsChain));

// --- an unmapped real symbol: SECTOR/INDUSTRY honestly DATA_INSUFFICIENT, never fabricated ---
const unmappedSymbol = symbols.find(s => !loadSectorMap().has(s));
assert.ok(unmappedSymbol);
const unmappedChain = buildAccumulationChain(unmappedSymbol, lastDate, index);
if (unmappedChain.status === 'BUILT') {
  assert.equal(unmappedChain.chain.find(l => l.name === 'SECTOR').status, 'DATA_INSUFFICIENT');
  assert.equal(unmappedChain.chain.find(l => l.name === 'INDUSTRY').status, 'DATA_INSUFFICIENT');
  assert.equal(unmappedChain.chain.find(l => l.name === 'VALUE_CHAIN').status, 'VERIFICATION_BLOCKED'); // still blocked, same as every symbol
}

// --- reproducibility ---
const tcsChainB = buildAccumulationChain('TCS', lastDate, index);
assert.deepEqual(tcsChain, tcsChainB);

// --- no-look-ahead: the underlying series for this symbol/date must never exceed asOfDate ---
const midDate = allDates[150];
const midChain = buildAccumulationChain('TCS', midDate, index);
const midSeries = index.cmSeriesAsOf('TCS', midDate);
assert.ok(midSeries.every(r => r.trade_date <= midDate));
assert.equal(midChain.asOfDate, midDate);

// --- unknown date -> DATA_N_A, never fabricated ---
const naChain = buildAccumulationChain('TCS', '1999-01-01', index);
assert.equal(naChain.status, 'DATA_N_A');
assert.equal(naChain.chain, null);

// --- VALUE_CHAIN must be VERIFICATION_BLOCKED for EVERY real symbol tested, with no exception ---
for (const sym of symbols.slice(0, 10)) {
  const c = buildAccumulationChain(sym, lastDate, index);
  if (c.status === 'BUILT') {
    assert.equal(c.chain.find(l => l.name === 'VALUE_CHAIN').status, 'VERIFICATION_BLOCKED', `VALUE_CHAIN must always be blocked — no exception for ${sym}`);
  }
}

console.log(`REAL DATA: accumulation chain for TCS@${lastDate}: ${JSON.stringify(tcsChain.evidenceSummary.layersWithRealEvidence)} real, ${JSON.stringify(tcsChain.evidenceSummary.layersBlockedOrInsufficient)}`);
console.log('accumulationChain.test.js passed');
