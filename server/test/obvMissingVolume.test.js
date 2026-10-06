// Regression: calculateObv must not turn missing/invalid volume into zero.
const assert = require('node:assert/strict');
const { calculateObv, evaluate } = require('../../accumulation/engine');

const D = (n) => `2026-08-${String(n).padStart(2, '0')}`;
// 4 rising days: close 100->101->102->103->104. Volume of day 3 is the variable under test.
const rows = (v3) => [
  { trade_date: D(3), close: 100, prev_close: 99, volume: 1000 },
  { trade_date: D(4), close: 101, volume: 2000 },
  { trade_date: D(5), close: 102, volume: v3 },
  { trade_date: D(6), close: 103, volume: 4000 }
];
const last = (v3) => { const o = calculateObv(rows(v3)); return o[o.length - 1].obv; };

// valid volumes behave exactly as before
assert.equal(last(3000), 1000 + 2000 + 3000 + 4000, 'positive volume');
assert.equal(last(3000.5), 1000 + 2000 + 3000.5 + 4000, 'normal numeric volume');
assert.equal(last('3000'), 10000, 'numeric string is still a valid number (unchanged behaviour)');
assert.equal(last(0), 1000 + 2000 + 0 + 4000, 'numeric zero is a genuine zero and is preserved');
assert.equal(last(-5), 1000 + 2000 - 5 + 4000, 'negative number unchanged behaviour (not this fix)');

// missing / invalid volume must stay missing: OBV becomes null, never a number that treats it as 0
const zeroResult = last(0);
for (const [label, bad] of [['null', null], ['undefined', undefined], ['empty string', ''], ['whitespace', '   '], ['NaN', NaN], ['malformed text', 'abc'], ['Infinity', Infinity]]) {
  const o = calculateObv(rows(bad));
  assert.equal(o[2].obv, null, `${label}: row with missing volume must have null OBV`);
  assert.equal(o[3].obv, null, `${label}: later cumulative OBV must stay unknown`);
  assert.notEqual(o[3].obv, zeroResult, `${label}: missing must not equal zero-volume result`);
  assert.equal(o[0].obv, 1000, `${label}: rows before the gap are unaffected`);
  assert.equal(o[1].obv, 3000, `${label}: rows before the gap are unaffected`);
}

// missing volume on a day whose OBV contribution is zero anyway does not poison the chain
const flat = calculateObv([
  { trade_date: D(3), close: 100, prev_close: 99, volume: 1000 },
  { trade_date: D(4), close: 100, volume: null },
  { trade_date: D(5), close: 101, volume: 500 }
]);
assert.equal(flat[2].obv, 1500, 'flat day with missing volume contributes nothing either way');
const noPrice = calculateObv([{ trade_date: D(3), close: null, prev_close: null, volume: null }]);
assert.equal(noPrice[0].obv, 0, 'no price comparison possible: unchanged behaviour');

// evaluate(): unknown OBV earns no OBV points and cannot satisfy the rising-OBV gate
const hist = Array.from({ length: 12 }, (_, i) => ({ trade_date: D(i + 1), close: 100 + i, prev_close: 99 + i, volume: 1000 + i, deliv_per: 50, deliv_qty: 500 }));
const ok = evaluate({ symbol: 'T', history: hist, current: hist[hist.length - 1], futures: null });
const missing = evaluate({ symbol: 'T', history: hist.map((r, i) => (i === 9 ? { ...r, volume: '' } : r)), current: hist[hist.length - 1], futures: null });
assert.equal(typeof ok.metrics.obv, 'number');
assert.equal(missing.metrics.obv, null);
assert.equal(missing.metrics.obvTrend, null);
console.log('obvMissingVolume tests passed');
