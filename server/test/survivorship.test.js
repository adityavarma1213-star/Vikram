'use strict';
const assert = require('node:assert/strict');
const { tradabilityOn, filterTradableAsOf } = require('../src/survivorship');

// 1. No lifecycle record at all -> UNKNOWN, never silently assumed TRADABLE.
assert.equal(tradabilityOn('NOREC', '2024-01-01', []).status, 'UNKNOWN');

// 2. Delisted before the query date -> correctly excluded (this is the actual survivorship-bias
// case: a naive "today's list" backtest would never see this exclusion).
{
  const lifecycle = [{ symbol: 'GONECO', listed_date: '2015-01-01', delisted_date: '2020-06-30', delisting_reason: 'merger' }];
  assert.equal(tradabilityOn('GONECO', '2019-01-01', lifecycle).status, 'TRADABLE'); // was alive then
  assert.equal(tradabilityOn('GONECO', '2021-01-01', lifecycle).status, 'DELISTED'); // not alive now
}

// 3. Not yet listed before its IPO date -> excluded (no look-ahead into a company's future IPO).
{
  const lifecycle = [{ symbol: 'NEWIPO', listed_date: '2023-01-01', delisted_date: null }];
  assert.equal(tradabilityOn('NEWIPO', '2020-01-01', lifecycle).status, 'NOT_YET_LISTED');
  assert.equal(tradabilityOn('NEWIPO', '2024-01-01', lifecycle).status, 'TRADABLE');
}

// 4. filterTradableAsOf reports honest coverage — excludes real delistings, but flags unverified
// (no-record) symbols as included-but-unverified rather than silently trusting them.
{
  const lifecycle = [{ symbol: 'GONECO', listed_date: '2015-01-01', delisted_date: '2020-06-30' }];
  const result = filterTradableAsOf(['GONECO', 'UNKNOWNCO'], '2021-01-01', lifecycle);
  assert.deepEqual(result.tradable, ['UNKNOWNCO']);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].symbol, 'GONECO');
  assert.deepEqual(result.unverifiedSymbols, ['UNKNOWNCO']);
  assert.equal(result.survivorshipCoverage, 50); // 1 of 2 symbols actually verified
}

console.log('survivorship.test.js: PASS');
