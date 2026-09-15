const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeDataContract } = require('../lib/dataContract');

const historyDir = path.join(__dirname, '..', '..', 'data', 'market-history');
const contract = makeDataContract({ historyDir });

// --- REAL DATA: pick an actual date + symbol genuinely present in the repo ---
const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort();
const sampleDate = files[0].replace('.json', '');
const sampleFile = JSON.parse(fs.readFileSync(path.join(historyDir, files[0]), 'utf8'));
const sampleSymbol = sampleFile.cm[0].symbol;
const sampleFutSymbol = sampleFile.futures[0] ? sampleFile.futures[0].symbol : null;

const md = contract.getMarketData(sampleSymbol, sampleDate);
assert.equal(md.status, 'VALID');
assert.equal(md.data.symbol, sampleSymbol);

const dd = contract.getDeliveryData(sampleSymbol, sampleDate);
assert.equal(dd.status, 'VALID');
assert.ok('deliv_qty' in dd.data);

if (sampleFutSymbol) {
  const fd = contract.getFuturesData(sampleFutSymbol, sampleDate);
  assert.equal(fd.status, 'VALID');
  const oi = contract.getOIData(sampleFutSymbol, sampleDate);
  assert.ok(['VALID', 'DATA_INSUFFICIENT'].includes(oi.status));
}

const ts = contract.getTradingSession(sampleDate);
assert.equal(ts.status, 'VALID');
assert.equal(ts.data.status, 'VALID_TRADING_DAY');

// --- unknown symbol / unknown date: must be DATA_N_A, never fabricated ---
assert.equal(contract.getMarketData('NOTAREALSYMBOL_XYZ', sampleDate).status, 'DATA_N_A');
assert.equal(contract.getMarketData(sampleSymbol, '1999-01-01').status, 'DATA_N_A');

// --- weekend date with no file: verifiable NOT_A_TRADING_DAY, not a guess ---
const weekendSession = contract.getTradingSession('2026-09-12'); // Saturday
assert.equal(weekendSession.status, 'VALID');
assert.equal(weekendSession.data.status, 'NOT_A_TRADING_DAY');

// --- weekday with no file: honestly DATA_INSUFFICIENT, never assumed a holiday ---
const midweekGap = contract.getTradingSession('2019-06-12'); // Wednesday, far outside repo coverage
assert.equal(midweekGap.status, 'DATA_INSUFFICIENT');

// --- historical universe: must refuse to fabricate when no PIT snapshots exist ---
const noSnapshots = makeDataContract({ historyDir, membershipRows: [] });
assert.equal(noSnapshots.getHistoricalUniverse('2023-03-15').status, 'VERIFICATION_BLOCKED');

// --- historical universe: honors real recorded snapshots when present (SYNTHETIC_TEST_ONLY rows) ---
const withSnapshots = makeDataContract({
  historyDir,
  membershipRows: [
    { symbol: 'ABC', indexName: 'NIFTY 500', effectiveFrom: '2024-01-01', effectiveTo: null, source: 'test', sourceDate: '2024-01-01' }
  ]
});
const withRes = withSnapshots.getHistoricalUniverse('2024-06-01', 'NIFTY 500');
assert.equal(withRes.status, 'VALID');
assert.deepEqual(withRes.data.symbols, ['ABC']);
// a date before the recorded snapshot's effectiveFrom must not claim membership
const beforeRes = withSnapshots.getHistoricalUniverse('2023-01-01', 'NIFTY 500');
assert.equal(beforeRes.status, 'DATA_INSUFFICIENT');

// --- corporate actions: coverage is honestly DATA_INSUFFICIENT (no live NSE source reachable) ---
const caRes = contract.getCorporateActions(sampleSymbol, [
  { trade_date: '2026-01-01', close: 100 },
  { trade_date: '2026-01-02', close: 130 } // synthetic 30% jump to exercise the heuristic
]);
assert.equal(caRes.status, 'DATA_INSUFFICIENT');
assert.equal(caRes.data.heuristicFlags.length, 1);

console.log('dataContract.test.js passed');
