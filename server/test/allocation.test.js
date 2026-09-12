'use strict';
const assert = require('node:assert/strict');
const { positionSize, applyMaxAllocationCap } = require('../src/allocation');

// 1. Basic real-arithmetic sizing: risk 1% of ₹100,000 with a ₹5 per-share risk gives 200 shares.
{
  const result = positionSize({ capital: 100000, riskPct: 1, entry: 105, stop: 100 });
  assert.equal(result.status, 'COMPUTED');
  assert.equal(result.riskAmount, 1000);
  assert.equal(result.riskPerShare, 5);
  assert.equal(result.shares, 200);
  assert.equal(result.positionValue, 21000);
  assert.equal(result.isMethodologyValidated, false, 'must never claim a validated methodology');
}

// 2. Missing/invalid input refuses to guess a result.
assert.equal(positionSize({ capital: null, riskPct: 1, entry: 100, stop: 95 }).status, 'INSUFFICIENT_INPUT');
assert.equal(positionSize({ capital: 100000, riskPct: 1, entry: 100, stop: 105 }).status, 'INVALID_INPUT'); // stop above entry

// 3. Optional max-allocation cap only applies when the user actually supplies one.
{
  const sizing = positionSize({ capital: 100000, riskPct: 5, entry: 105, stop: 100 }); // large position
  const uncapped = applyMaxAllocationCap(sizing, { capital: 100000, maxAllocationPct: null });
  assert.equal(uncapped.maxAllocationCapApplied, false);

  const capped = applyMaxAllocationCap(sizing, { capital: 100000, maxAllocationPct: 10 });
  assert.equal(capped.maxAllocationCapApplied, true);
  assert.ok(capped.positionValue <= 10000);
}

// 4. A cap that isn't actually exceeded is reported as not applied.
{
  const sizing = positionSize({ capital: 100000, riskPct: 0.5, entry: 105, stop: 100 }); // small position
  const result = applyMaxAllocationCap(sizing, { capital: 100000, maxAllocationPct: 50 });
  assert.equal(result.maxAllocationCapApplied, false);
}

console.log('allocation.test.js: PASS');
