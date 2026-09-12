'use strict';
const assert = require('node:assert/strict');
const { categoriesFor, matchesCategory, rankScore, buildRadar, buildDisclosure } = require('../../js/opportunityRadar.js');

const rows = [
  { symbol: 'AAA', score: 70, verdict: 'ACCUMULATION CONFIRMED', why: ['Volume above average.', 'Delivery elevated.'], metrics: { volumeRatio: 1.1, deliveryPct: 40, hasDerivatives: false } },
  { symbol: 'BBB', score: 60, verdict: 'ACCUMULATION STARTING', why: ['Early volume expansion.'], metrics: { volumeRatio: 3.2, deliveryPct: 30, hasDerivatives: false } },
  { symbol: 'CCC', score: 50, verdict: 'ACCUMULATION CONFIRMED', why: [], metrics: { volumeRatio: 1.0, deliveryPct: 65, hasDerivatives: true, changeOi: 5000 } },
  { symbol: 'DDD', score: 40, verdict: 'DISTRIBUTION', why: [], metrics: {} }
];

// 1. Categorization uses only real, already-present fields — never invents a category.
assert.deepEqual(categoriesFor(rows[0]), ['CONFIRMED']);
assert.deepEqual(categoriesFor(rows[1]), ['STARTING', 'VOLUME_BREAKOUT']);
assert.deepEqual(categoriesFor(rows[2]), ['CONFIRMED', 'HIGH_DELIVERY', 'OI_BUILD_UP']);
assert.deepEqual(categoriesFor(rows[3]), []);

// 2. matchesCategory: ALL matches everything; a specific category only matches real evidence.
assert.equal(matchesCategory(rows[3], 'ALL'), true);
assert.equal(matchesCategory(rows[3], 'CONFIRMED'), false);
assert.equal(matchesCategory(rows[1], 'VOLUME_BREAKOUT'), true);

// 3. rankScore is derived purely from real fields (never displayed as the engine's own score) and
// correctly favors real corroborating evidence over base score alone.
{
  const scoreAAA = rankScore(rows[0]); // base 70, modest volume/delivery boost
  const scoreCCC = rankScore(rows[2]); // base 50, but real high delivery + real OI build-up
  assert.ok(scoreCCC > 50, 'evidence-based boost must actually raise the rank score above base');
  assert.ok(scoreAAA > 70);
}

// 4. buildRadar filters + ranks without ever mutating the input rows.
{
  const radar = buildRadar(rows, 'CONFIRMED');
  assert.deepEqual(radar.map(r => r.row.symbol), ['CCC', 'AAA'].sort((a, b) => rankScore(rows.find(r2 => r2.symbol === b)) - rankScore(rows.find(r2 => r2.symbol === a))));
  assert.equal(rows[0].rankScore, undefined, 'original row objects must not be mutated');
}

// 5. buildRadar('ALL') includes every row, sorted purely by real rank score.
{
  const radar = buildRadar(rows, 'ALL');
  assert.equal(radar.length, 4);
  for (let i = 1; i < radar.length; i += 1) assert.ok(radar[i - 1].rankScore >= radar[i].rankScore);
}

// 6. Progressive disclosure: Level 2 ("why") is exactly the engine's own real explanation
// strings — never invented, never summarized/altered.
{
  const disclosure = buildDisclosure(rows[0]);
  assert.deepEqual(disclosure.level2.why, ['Volume above average.', 'Delivery elevated.']);
  assert.equal(disclosure.level1.symbol, 'AAA');
  assert.equal(disclosure.level1.verdict, 'ACCUMULATION CONFIRMED');
}

// 7. A row with no real evidence for a field reports null there, never a fabricated value.
{
  const disclosure = buildDisclosure(rows[3]);
  assert.equal(disclosure.level3.volumeRatio, null);
  assert.equal(disclosure.level3.changeOi, null);
}

console.log('opportunityRadar.test.js: PASS');
