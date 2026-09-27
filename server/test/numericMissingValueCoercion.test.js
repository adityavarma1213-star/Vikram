'use strict';

const assert = require('node:assert/strict');
const { num } = require('../src/staticSnapshot');

assert.equal(num(''), null);
assert.equal(num('   '), null);
assert.equal(num(undefined), null);
assert.equal(num(null), null);
assert.equal(num('0'), 0);
assert.equal(num(0), 0);
assert.equal(num('51.23'), 51.23);
assert.equal(num('1,234.56'), 1234.56);

console.log('numericMissingValueCoercion tests passed');
