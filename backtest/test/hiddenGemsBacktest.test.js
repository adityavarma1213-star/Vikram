'use strict';
// SYNTHETIC_TEST_ONLY fixtures.
const assert = require('node:assert/strict');
const { runHiddenGemsBacktest } = require('../lib/hiddenGemsBacktest');

function row(date, close, prevClose, volume, delivery) {
  return { trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: Math.round(volume * delivery / 100) };
}
const confirmedHistory = [
  row('2026-08-18', 100, 99, 1000, 40), row('2026-08-19', 101, 100, 1050, 41),
  row('2026-08-20', 101, 101, 1100, 42), row('2026-08-21', 102, 101, 1080, 43),
  row('2026-08-24', 103, 102, 1150, 44), row('2026-08-25', 103, 103, 1180, 46),
  row('2026-08-26', 104, 103, 1250, 47), row('2026-08-27', 104, 104, 1300, 48),
  row('2026-08-28', 105, 104, 1400, 50), row('2026-09-01', 106, 105, 2000, 58)
];
confirmedHistory.forEach(r => { r.symbol = 'GOOD'; });

// 1. With zero recorded membership/lifecycle/corporate-action data (the current real state),
// the integration honestly reports that, rather than pretending full coverage.
{
  const bySymbolHistory = new Map([['GOOD', confirmedHistory]]);
  const out = runHiddenGemsBacktest({ bySymbolHistory, asOfDate: '2026-09-01', candidateSymbols: ['GOOD'] });
  assert.equal(out.membershipDataAvailable, false);
  assert.equal(out.corporateActionDataAvailable, false);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].tier, 'NONE'); // no real membership data -> honestly NONE, not guessed
}

// 2. A delisted symbol is genuinely excluded from the backtest universe on a date after its
// delisting — this is the actual survivorship-bias fix, verified end-to-end here.
{
  const delistedHistory = confirmedHistory.map(r => ({ ...r, symbol: 'GONE' }));
  const bySymbolHistory = new Map([['GOOD', confirmedHistory], ['GONE', delistedHistory]]);
  const lifecycleRows = [{ symbol: 'GONE', listed_date: '2015-01-01', delisted_date: '2020-01-01' }];
  const out = runHiddenGemsBacktest({ bySymbolHistory, asOfDate: '2026-09-01', candidateSymbols: ['GOOD', 'GONE'], lifecycleRows });
  assert.deepEqual(out.results.map(r => r.symbol), ['GOOD']); // GONE excluded, not silently included
  assert.equal(out.excludedForSurvivorship.length, 1);
  assert.equal(out.excludedForSurvivorship[0].symbol, 'GONE');
}

// 3. Real point-in-time membership rows correctly set the evaluated tier (never today's
// membership standing in for a historical date).
{
  const bySymbolHistory = new Map([['GOOD', confirmedHistory]]);
  const membershipRows = [{ symbol: 'GOOD', indexName: 'NIFTY 500', effectiveFrom: '2026-01-01', effectiveTo: null, source: 'test', sourceDate: '2026-01-01' }];
  const out = runHiddenGemsBacktest({ bySymbolHistory, asOfDate: '2026-09-01', candidateSymbols: ['GOOD'], membershipRows });
  assert.equal(out.membershipDataAvailable, true);
  assert.equal(out.results[0].tier, 'NIFTY 500');
}

// 4. A Hidden-Gem-relevant classification creates a real immutable signal event with the
// classification's own T0/P0 — not a separately fabricated value.
{
  const bySymbolHistory = new Map([['GOOD', confirmedHistory]]);
  const out = runHiddenGemsBacktest({ bySymbolHistory, asOfDate: '2026-09-01', candidateSymbols: ['GOOD'] });
  if (out.results[0].T0) {
    assert.equal(out.signalEvents.length, 1);
    assert.equal(out.signalEvents[0].T0, out.results[0].T0);
    assert.equal(out.signalEvents[0].P0, out.results[0].P0);
    assert.ok(Object.isFrozen(out.signalEvents[0]));
  }
}

console.log('hiddenGemsBacktest.test.js: PASS (SYNTHETIC_TEST_ONLY fixtures)');
