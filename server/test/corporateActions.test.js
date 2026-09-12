'use strict';
// SYNTHETIC_TEST_ONLY fixtures — validates adjustment arithmetic, not any real corporate action.
const assert = require('node:assert/strict');
const { priceAdjustmentFactorAsOf, adjustRow, adjustSeries } = require('../src/corporateActions');

// 1. No recorded actions -> factor is always exactly 1, honestly reported as unadjusted.
{
  const factor = priceAdjustmentFactorAsOf('AAA', '2024-01-01', []);
  assert.equal(factor, 1);
  const adjusted = adjustRow({ symbol: 'AAA', trade_date: '2024-01-01', close: 100, open: 99, high: 101, low: 98, volume: 1000 }, []);
  assert.equal(adjusted.close, 100);
  assert.equal(adjusted.pricesAdjusted, false);
  assert.equal(adjusted.adjustmentSource, 'NONE_RECORDED');
}

// 2. A 1:5 bonus (1 share -> 5 shares) recorded AFTER a historical row: that row's price must be
// scaled down to 1/5 and volume scaled up 5x to be comparable with post-bonus prices.
{
  const actions = [{ symbol: 'AAA', ex_date: '2024-06-01', action_type: 'BONUS', ratio_from: 1, ratio_to: 5 }];
  const before = adjustRow({ symbol: 'AAA', trade_date: '2024-01-01', close: 500, open: 490, high: 510, low: 480, volume: 1000 }, actions);
  assert.equal(before.close, 100); // 500 * (1/5)
  assert.equal(before.volume, 5000); // 1000 / (1/5)
  assert.equal(before.pricesAdjusted, true);
  assert.equal(before.adjustmentSource, 'RECORDED_CORPORATE_ACTIONS');
  assert.equal(before.rawClose, 500); // raw value preserved alongside the adjusted one

  // A row ON OR AFTER the ex-date is unaffected — the action is already reflected in raw prices.
  const after = adjustRow({ symbol: 'AAA', trade_date: '2024-06-01', close: 100, open: 99, high: 101, low: 98, volume: 5000 }, actions);
  assert.equal(after.close, 100);
  assert.equal(after.adjustmentFactor, 1);
}

// 3. Multiple actions compound correctly, and actions for a different symbol are ignored.
{
  const actions = [
    { symbol: 'AAA', ex_date: '2024-03-01', action_type: 'SPLIT', ratio_from: 1, ratio_to: 2 }, // 1:2 split
    { symbol: 'AAA', ex_date: '2024-06-01', action_type: 'BONUS', ratio_from: 1, ratio_to: 5 },  // 1:5 bonus
    { symbol: 'ZZZ', ex_date: '2024-02-01', action_type: 'SPLIT', ratio_from: 1, ratio_to: 10 }  // different symbol
  ];
  const factor = priceAdjustmentFactorAsOf('AAA', '2024-01-01', actions);
  assert.equal(factor, (1 / 2) * (1 / 5)); // both actions occur after this row's date
}

// 4. adjustSeries maps over a whole series without mutating the originals.
{
  const rows = [{ symbol: 'AAA', trade_date: '2024-01-01', close: 100, open: 100, high: 100, low: 100, volume: 100 }];
  const adjusted = adjustSeries(rows, []);
  assert.equal(rows[0].pricesAdjusted, undefined, 'original row must not be mutated');
  assert.equal(adjusted[0].pricesAdjusted, false);
}

console.log('corporateActions.test.js: PASS (SYNTHETIC_TEST_ONLY fixtures)');
