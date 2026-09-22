'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const index = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

assert.equal(/\bsortState\b/.test(index), false);
assert.ok(index.includes('function activateHeaderSort(key)'));
assert.ok(index.includes("const [sortKey, sortDirection] = (sortSelect && sortSelect.value ? sortSelect.value : 'score:desc').split(':');"));
assert.ok(index.includes('const sorted = sortRows ? sortRows(textFiltered, sortKey, sortDirection) : textFiltered;'));
for (const key of ['symbol','close','score','priceChangePct','volumeRatio','deliveryPct']) {
  assert.ok(index.includes(`sortTh('${key}'`), `missing sortable header: ${key}`);
  assert.ok(index.includes(`value="${key}:desc"`) || key === 'symbol', `missing descending option: ${key}`);
}
assert.equal(index.includes('id="universeFilterTrigger"'), false);
assert.equal(index.includes('id="universeFilterMenu"'), false);
assert.ok(index.includes('id="universeFilter"') && index.includes('style="display:none"'));
console.log('headerSort.test.js: all assertions passed');
