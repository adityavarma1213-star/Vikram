'use strict';
// SYNTHETIC_TEST_ONLY fixtures.
const assert = require('assert');
const { detectStaleDuplicateDate, scanForStaleDuplicates } = require('../lib/staleDuplicateDetector');

function row(symbol, close, volume) {
  return { symbol, trade_date: 'PLACEHOLDER', close, volume, deliv_qty: volume / 2, deliv_per: 50 };
}

function makeDay(n, variant) {
  // n symbols; `variant` shifts the numbers slightly so different days are genuinely different.
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push(row(`SYM${i}`, 100 + i + variant, 1000 + i * 10 + variant));
  return rows;
}

// 1. Two genuinely different trading days are NOT flagged.
{
  const today = makeDay(30, 0);
  const yesterday = makeDay(30, 5); // every symbol's numbers differ
  const result = detectStaleDuplicateDate(today, yesterday);
  assert.ok(result);
  assert.equal(result.isStaleDuplicate, false);
  assert.equal(result.matchRatio, 0);
}
console.log('genuinely different days: not flagged — PASS');

// 2. An exact carried-forward duplicate IS flagged.
{
  const yesterday = makeDay(30, 0);
  const today = yesterday.map(r => ({ ...r })); // byte-identical payload, only trade_date would differ in real data
  const result = detectStaleDuplicateDate(today, yesterday);
  assert.ok(result);
  assert.equal(result.isStaleDuplicate, true);
  assert.equal(result.matchRatio, 1);
  assert.equal(result.commonSymbols, 30);
}
console.log('exact carried-forward duplicate: flagged — PASS');

// 3. Threshold boundary: proves the threshold is meaningful, not a rubber stamp — a duplicate
// just above threshold is flagged, one just below is not.
{
  const yesterday = makeDay(100, 0);
  const above = yesterday.map((r, i) => (i < 1 ? { ...r, close: r.close + 1 } : { ...r })); // 99% identical -> above 0.98 threshold
  const below = yesterday.map((r, i) => (i < 5 ? { ...r, close: r.close + 1 } : { ...r })); // 95% identical -> below 0.98 threshold
  assert.equal(detectStaleDuplicateDate(above, yesterday).isStaleDuplicate, true);
  assert.equal(detectStaleDuplicateDate(below, yesterday).isStaleDuplicate, false);
}
console.log('threshold boundary behaves correctly — PASS');

// 4. Too little symbol overlap -> returns null (never guesses from insufficient data).
{
  const yesterday = makeDay(5, 0);
  const today = makeDay(5, 0);
  assert.equal(detectStaleDuplicateDate(today, yesterday, { minCommonSymbols: 20 }), null);
}
console.log('insufficient overlap -> null, never guessed — PASS');

// 5. scanForStaleDuplicates walks a full { date: rows } map in chronological order and only
// reports dates with enough data to judge.
{
  const rowsByDate = {
    '2026-01-01': makeDay(30, 0),
    '2026-01-02': makeDay(30, 1), // genuinely different
    '2026-01-03': makeDay(30, 1).map(r => ({ ...r })) // stale duplicate of 01-02
  };
  const findings = scanForStaleDuplicates(rowsByDate);
  assert.equal(findings.length, 2); // 01-02 vs 01-01 (checked, not flagged), 01-03 vs 01-02 (flagged)
  const flagged = findings.filter(f => f.result.isStaleDuplicate);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].date, '2026-01-03');
  assert.equal(flagged[0].previousDate, '2026-01-02');
}
console.log('scanForStaleDuplicates chronological walk — PASS');

console.log('staleDuplicateDetector.test.js: PASS (SYNTHETIC_TEST_ONLY fixtures)');
