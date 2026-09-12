'use strict';
const assert = require('node:assert/strict');
const { matchesUniverse, universeStatusLine } = require('../../js/universeMembership.js');

const rows = [
  { symbol: 'AAA', indexMembership: ['NIFTY 50', 'NIFTY 200', 'NIFTY 500'] },
  { symbol: 'BBB', indexMembership: ['NIFTY 200', 'NIFTY 500'] },
  { symbol: 'CCC', indexMembership: ['NIFTY 500'] },
  { symbol: 'DDD', indexMembership: [] } // not in any index (e.g. small-cap, ALL-STOCKS only)
];

// 1. 'ALL' always matches every row, regardless of membership data.
for (const r of rows) assert.equal(matchesUniverse(r, 'ALL'), true);

// 2. NIFTY 50 matches only the one constituent.
assert.deepEqual(rows.filter(r => matchesUniverse(r, 'NIFTY 50')).map(r => r.symbol), ['AAA']);

// 3. NIFTY 200 matches its two constituents.
assert.deepEqual(rows.filter(r => matchesUniverse(r, 'NIFTY 200')).map(r => r.symbol), ['AAA', 'BBB']);

// 4. NIFTY 500 matches its three constituents.
assert.deepEqual(rows.filter(r => matchesUniverse(r, 'NIFTY 500')).map(r => r.symbol), ['AAA', 'BBB', 'CCC']);

// 5. A stock in no index at all never matches a specific universe.
assert.equal(matchesUniverse(rows[3], 'NIFTY 500'), false);

// 6. Status line for ALL reports the full row count and never claims anything but EOD VERIFIED
// (the underlying EOD data verification is a separate, already-enforced upstream check).
assert.equal(universeStatusLine(rows, 'ALL', 'VERIFIED'), '4 stocks \u00b7 EOD VERIFIED');

// 7. Status line for a specific universe reports the real constituent count AND the real
// upstream index-universe status — never fabricates a count when status is DATA N/A.
assert.equal(universeStatusLine(rows, 'NIFTY 200', 'VERIFIED'), '2 constituents \u00b7 VERIFIED');
assert.equal(universeStatusLine(rows, 'NIFTY 200', 'DATA N/A'), '2 constituents \u00b7 DATA N/A');

// 8. Missing/undefined status defaults to the honest DATA N/A, never a fabricated "VERIFIED".
assert.equal(universeStatusLine(rows, 'NIFTY 50', undefined), '1 constituents \u00b7 DATA N/A');

console.log('universeMembership.test.js: PASS');
