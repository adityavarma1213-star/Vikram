const assert = require('assert');
const { calculatePositionSize } = require('./engine');

const result = calculatePositionSize({
  capital: 100000,
  riskPct: 1,
  entryPrice: 100,
  stopPrice: 95,
});

assert.equal(result.status, 'CALCULATED');
assert.equal(result.shares, 200);
assert.equal(result.riskValue, 1000);
assert.equal(result.allocationValue, 20000);

const capped = calculatePositionSize({
  capital: 100000,
  riskPct: 1,
  entryPrice: 100,
  stopPrice: 95,
  maxAllocationPct: 10,
});
assert.equal(capped.shares, 100);

const invalid = calculatePositionSize({
  capital: 100000,
  riskPct: 1,
  entryPrice: 100,
  stopPrice: 105,
});
assert.equal(invalid.status, 'INVALID INPUT');

console.log('Allocation tests passed');
