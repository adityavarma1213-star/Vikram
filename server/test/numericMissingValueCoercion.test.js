'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/staticSnapshot.js'),
  'utf8'
);

const match = source.match(
  /function num\(v\) \{.*?\n\}/s
);
assert.ok(match, 'num() implementation must be present');

const num = Function(`return (${match[0].replace(/^function num/, 'function num')});`)();

assert.equal(num(''), null);
assert.equal(num('   '), null);
assert.equal(num(undefined), null);
assert.equal(num(null), null);
assert.equal(num('0'), 0);
assert.equal(num(0), 0);
assert.equal(num('51.23'), 51.23);
assert.equal(num('1,234.56'), 1234.56);

console.log('numericMissingValueCoercion tests passed');
