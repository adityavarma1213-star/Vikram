'use strict';
/**
 * Regression: Verdict column display mapping.
 * Does not touch scoring, gates, or Missing ≠ Zero.
 */
const assert = require('node:assert/strict');
const { verdictClass, verdictLabel, CANONICAL } = require('../../js/verdictDisplay.js');
const { filterRows } = require('../../js/tableControls.js');
const { matchesCategory, categoriesFor } = require('../../js/opportunityRadar.js');

const STARTING = 'ACCUMULATION STARTING';
const CONFIRMED = 'ACCUMULATION CONFIRMED';
const MIXED = 'UNCONFIRMED / MIXED';
const DISTRIBUTION = 'DISTRIBUTION';

assert.equal(verdictLabel(STARTING), STARTING);
assert.equal(verdictLabel(CONFIRMED), CONFIRMED);
assert.equal(verdictLabel(MIXED), MIXED);
assert.equal(verdictLabel(DISTRIBUTION), DISTRIBUTION);
assert.equal(verdictLabel(null), 'N/A');
assert.equal(verdictLabel(''), 'N/A');

assert.equal(verdictClass(STARTING), 'status-starting');
assert.equal(verdictClass(CONFIRMED), 'status-confirmed');
assert.equal(verdictClass(MIXED), 'status-mixed');
assert.equal(verdictClass(DISTRIBUTION), 'status-distribution');
assert.notEqual(verdictClass(MIXED), 'status-confirmed');
assert.equal(String(MIXED).toLowerCase().includes('confirmed'), true);

assert.equal(verdictClass('  accumulation starting  '), 'status-starting');
assert.equal(verdictClass('accumulation confirmed'), 'status-confirmed');
assert.deepEqual(Object.keys(CANONICAL).sort(), [CONFIRMED, STARTING, DISTRIBUTION, MIXED].sort());

const rows = [
  { symbol: 'AAA', verdict: STARTING, score: 79, companyName: 'Alpha' },
  { symbol: 'BBB', verdict: CONFIRMED, score: 80, companyName: 'Beta' },
  { symbol: 'CCC', verdict: MIXED, score: 40, companyName: 'Gamma' },
  { symbol: 'DDD', verdict: DISTRIBUTION, score: 20, companyName: 'Delta' },
  { symbol: 'EEE', verdict: STARTING, score: 60, companyName: 'Epsilon' }
];
const startingOnly = rows.filter(r => r.verdict === STARTING);
assert.equal(startingOnly.length, 2);
startingOnly.forEach(r => {
  assert.equal(r.verdict, STARTING);
  assert.equal(verdictClass(r.verdict), 'status-starting');
  assert.equal(verdictLabel(r.verdict), STARTING);
});
const textFiltered = filterRows(startingOnly, 'AAA');
assert.equal(textFiltered.length, 1);
assert.equal(textFiltered[0].verdict, STARTING);
assert.ok(categoriesFor({ verdict: STARTING, metrics: {} }).includes('STARTING'));
assert.equal(matchesCategory({ verdict: STARTING, metrics: {} }, 'STARTING'), true);
assert.equal(matchesCategory({ verdict: MIXED, metrics: {} }, 'STARTING'), false);
console.log('verdictDisplay.test.js: all assertions passed');
