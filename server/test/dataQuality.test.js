'use strict';
// Missing != Zero. Every ingestion path must keep blank / placeholder cells as null, an explicit 0 as 0,
// and refuse a whole day whose delivery column is all zero or all missing.
const assert = require('node:assert/strict');
const dq = require('../src/dataQuality');
let staticNum = null;
try { ({ num: staticNum } = require('../src/staticSnapshot')); } catch (e) {
  // staticSnapshot needs csv-parse (installed in CI via npm install). Reported, never silently skipped.
  if (e.code !== 'MODULE_NOT_FOUND') throw e;
  console.log('NOTE: staticSnapshot.num not exercised here (dependency not installed): ' + e.message.split('\n')[0]);
}
const { num: validatorNum } = require('../../backtest/lib/validators');

for (const [name, num] of [['dataQuality.toNumberOrNull', dq.toNumberOrNull], ['staticSnapshot.num', staticNum], ['validators.num', validatorNum]].filter(([, fn]) => fn)) {
  for (const blank of ['', '   ', null, undefined, '-', 'NA', 'N/A', 'NaN']) assert.equal(num(blank), null, `${name}(${JSON.stringify(blank)}) must be null, not 0`);
  assert.equal(num('0'), 0, `${name}("0") stays 0`);
  assert.equal(num(0), 0, `${name}(0) stays 0`);
  assert.equal(num('0.00'), 0);
  assert.equal(num('51.23'), 51.23);
  assert.equal(num('1,234.5'), 1234.5);
  assert.equal(num('abc'), null, `${name}("abc") must not become 0`);
}

assert.equal(dq.parseNumeric('').state, dq.STATES.MISSING);
assert.equal(dq.parseNumeric('-').state, dq.STATES.MISSING);
assert.equal(dq.parseNumeric('0').state, dq.STATES.ZERO);
assert.equal(dq.parseNumeric('x1').state, dq.STATES.INVALID);
assert.equal(dq.parseNumeric('12').state, dq.STATES.VALUE);

const row = d => ({ deliv_per: d });
const good = [row(40), row(55), row(0), row(null)];
assert.equal(dq.assessDeliveryDay(good).status, 'OK');
assert.equal(dq.assessDeliveryDay([]).status, 'NO_ROWS');
assert.equal(dq.assessDeliveryDay([row(0), row(0), row(0)]).status, 'ALL_DELIVERY_ZERO');
assert.equal(dq.assessDeliveryDay([row(null), row('')]).status, 'ALL_DELIVERY_MISSING');
assert.equal(dq.assessDeliveryDay([row(0), row(null)]).status, 'ALL_DELIVERY_ZERO_OR_MISSING');
assert.equal(dq.isValidDeliveryDay([row(0), row(0)]), false);
assert.throws(() => dq.requireValidDeliveryDay([row(0), row(0)], 'CM test'), err => err.name === 'DataQualityError');
assert.doesNotThrow(() => dq.requireValidDeliveryDay(good, 'CM test'));

console.log('dataQuality tests passed');
