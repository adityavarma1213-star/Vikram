'use strict';
const assert = require('node:assert/strict');
const { filterRows, sortRows, paginate } = require('../../js/tableControls.js');

const rows = [
  { symbol: 'AAA', companyName: 'Alpha Ltd', score: 60, metrics: { close: 100, priceChangePct: 1.5, volumeRatio: 1.2, deliveryPct: 40 } },
  { symbol: 'BBB', companyName: 'Beta Ltd', score: 80, metrics: { close: 50, priceChangePct: -2.0, volumeRatio: 2.5, deliveryPct: 60 } },
  { symbol: 'CCC', companyName: 'Gamma Ltd', score: 40, metrics: { close: 200, priceChangePct: 0.5, volumeRatio: 0.9, deliveryPct: 30 } }
];

// 1. Text filter matches symbol OR company name, case-insensitively; empty query matches all.
assert.deepEqual(filterRows(rows, 'bbb').map(r => r.symbol), ['BBB']);
assert.deepEqual(filterRows(rows, 'gamma').map(r => r.symbol), ['CCC']);
assert.equal(filterRows(rows, '').length, 3);
assert.deepEqual(filterRows(rows, 'zzz'), []);

// 2. Sort by score descending (default) and ascending.
assert.deepEqual(sortRows(rows, 'score', 'desc').map(r => r.symbol), ['BBB', 'AAA', 'CCC']);
assert.deepEqual(sortRows(rows, 'score', 'asc').map(r => r.symbol), ['CCC', 'AAA', 'BBB']);

// 3. Sort by a metrics field.
assert.deepEqual(sortRows(rows, 'close', 'asc').map(r => r.symbol), ['BBB', 'AAA', 'CCC']);

// 4. Unknown sort key returns input order unchanged rather than guessing a field.
assert.deepEqual(sortRows(rows, 'notAField', 'desc').map(r => r.symbol), ['AAA', 'BBB', 'CCC']);

// 5. Pagination: correct slice, correct page-count metadata.
{
  const p1 = paginate(rows, 1, 2);
  assert.equal(p1.pageRows.length, 2);
  assert.equal(p1.totalPages, 2);
  assert.equal(p1.totalRows, 3);
  assert.equal(p1.wasClamped, false);

  const p2 = paginate(rows, 2, 2);
  assert.equal(p2.pageRows.length, 1);
}

// 6. An out-of-range page is clamped, and the clamp is honestly reported (not silently hidden).
{
  const result = paginate(rows, 99, 2);
  assert.equal(result.page, 2); // clamped to the real last page
  assert.equal(result.wasClamped, true);
}

console.log('tableControls.test.js: PASS');
