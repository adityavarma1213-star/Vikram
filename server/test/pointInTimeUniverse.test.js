'use strict';
const assert = require('node:assert/strict');
const { isMemberOn, membershipAsOf, isMemberOfIndexOn, snapshotToMembershipRows, reconcileSnapshot } = require('../src/pointInTimeUniverse');

// 1. Basic date-boundary correctness.
assert.equal(isMemberOn('2024-06-01', '2024-01-01', null), true);
assert.equal(isMemberOn('2023-12-31', '2024-01-01', null), false); // before effectiveFrom
assert.equal(isMemberOn('2024-06-01', '2024-01-01', '2024-05-31'), false); // after effectiveTo
assert.equal(isMemberOn('2024-05-31', '2024-01-01', '2024-05-31'), true); // exactly on effectiveTo

// 2. A symbol that left the index before date T is correctly NOT a member on T (this is exactly
// the look-ahead / survivorship bug this module exists to prevent).
{
  const rows = [
    { symbol: 'LEFTCO', indexName: 'NIFTY 500', effectiveFrom: '2021-01-01', effectiveTo: '2022-06-30', source: 'test', sourceDate: '2021-01-01' },
    { symbol: 'STAYCO', indexName: 'NIFTY 500', effectiveFrom: '2021-01-01', effectiveTo: null, source: 'test', sourceDate: '2021-01-01' }
  ];
  assert.deepEqual(membershipAsOf('LEFTCO', '2021-06-01', rows), ['NIFTY 500']); // was a member then
  assert.deepEqual(membershipAsOf('LEFTCO', '2023-01-01', rows), []); // NOT a member now — left in 2022
  assert.deepEqual(membershipAsOf('STAYCO', '2023-01-01', rows), ['NIFTY 500']); // still open-ended
  assert.equal(isMemberOfIndexOn('LEFTCO', 'NIFTY 500', '2023-01-01', rows), false);
}

// 3. A symbol added to an index recently must NOT be treated as having always been a member —
// no look-ahead in the other direction either.
{
  const rows = [{ symbol: 'NEWCO', indexName: 'NIFTY 50', effectiveFrom: '2025-03-01', effectiveTo: null, source: 'test', sourceDate: '2025-03-01' }];
  assert.equal(isMemberOfIndexOn('NEWCO', 'NIFTY 50', '2024-01-01', rows), false); // before it ever joined
  assert.equal(isMemberOfIndexOn('NEWCO', 'NIFTY 50', '2025-06-01', rows), true);
}

// 4. snapshotToMembershipRows turns a real current constituent list into honestly-dated,
// open-ended rows — never claims coverage of any earlier date than the snapshot itself.
{
  const rows = snapshotToMembershipRows('NIFTY 50', ['AAA', 'aaa', 'BBB'], '2026-09-01', 'niftyindices.com');
  assert.equal(rows.length, 2); // duplicate (case-insensitive) collapsed
  assert.ok(rows.every(r => r.effectiveFrom === '2026-09-01' && r.effectiveTo === null));
}

// 5. reconcileSnapshot: a symbol present yesterday but absent from today's real list gets closed
// off exactly at today's date (not fabricated as always having been absent).
{
  const previous = [
    { symbol: 'AAA', indexName: 'NIFTY 50', effectiveFrom: '2026-01-01', effectiveTo: null, source: 'x', sourceDate: '2026-01-01' },
    { symbol: 'BBB', indexName: 'NIFTY 50', effectiveFrom: '2026-01-01', effectiveTo: null, source: 'x', sourceDate: '2026-01-01' }
  ];
  const next = reconcileSnapshot(previous, ['AAA', 'CCC'], 'NIFTY 50', '2026-09-01', 'x');
  const bbb = next.find(r => r.symbol === 'BBB');
  assert.equal(bbb.effectiveTo, '2026-09-01'); // closed off exactly today, real transition
  const ccc = next.find(r => r.symbol === 'CCC');
  assert.equal(ccc.effectiveFrom, '2026-09-01'); // opened exactly today, not backdated
  const aaa = next.find(r => r.symbol === 'AAA');
  assert.equal(aaa.effectiveTo, null); // unaffected, still open
}

console.log('pointInTimeUniverse.test.js: PASS');
