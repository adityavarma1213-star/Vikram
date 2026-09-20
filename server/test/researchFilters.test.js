'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../research.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../../js/research.js'), 'utf8');

// Trailing-window filters must expose only verdicts produced by the canonical accumulation engine.
for (const id of ['periodSelect', 'periodUniverse', 'periodVerdict', 'periodSearch']) {
  assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' must exist exactly once');
}
assert.match(html, /<option value="ACCUMULATION CONFIRMED">Confirmed<\/option>/);
assert.match(html, /<option value="ACCUMULATION STARTING">Starting<\/option>/);
assert.match(html, /<option value="ALL">All Verdicts<\/option>/);
assert.doesNotMatch(html, /QUIET ABSORPTION|Quiet Absorption/);
assert.doesNotMatch(js, /QUIET ABSORPTION|Quiet Absorption/);

// Every advertised trailing-window control is wired to state + rerender.
assert.match(js, /on\('periodSelect', 'change'/);
assert.match(js, /on\('periodUniverse', 'change'/);
assert.match(js, /on\('periodVerdict', 'change'/);
assert.match(js, /on\('periodSearch', 'input'/);

// Historical filters remain separately wired and do not accidentally use the trailing-window state.
for (const id of ['signalSymbolSearch', 'signalDateFrom', 'signalDateTo', 'signalResultFilter', 'signalSort']) {
  assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' must exist exactly once');
}
assert.match(js, /on\('signalResultFilter', 'change'/);
assert.match(js, /on\('signalSort', 'change'/);
assert.match(js, /on\('signalDateFrom', 'change'/);
assert.match(js, /on\('signalDateTo', 'change'/);
assert.match(js, /rows = rows\.filter\(s => String\(s\.symbol/);
assert.match(js, /state\.signalFrom/);
assert.match(js, /state\.signalTo/);

console.log('researchFilters.test.js: PASS');
