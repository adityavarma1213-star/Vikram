const assert = require('node:assert/strict');
const { buildScannerResults, MATERIALIZE_LOOKBACK_DAYS } = require('../src/scanMaterializer');

const rows = [];
for (let i = 0; i < 12; i++) {
  const day = String(17 + i).padStart(2, '0');
  rows.push({ trade_date: `2026-08-${day}`, close: 100 + i, prev_close: 99 + i, volume: 1000 + i * 100, deliv_per: 45 + i, deliv_qty: 500 + i });
}
rows.push({ trade_date: '2026-09-01', close: 115, prev_close: 114, volume: 2500, deliv_per: 60, deliv_qty: 1500 });

const futures = new Map([
  ['AAA|2026-09-01', { trade_date: '2026-09-01', oi: 50000, change_oi: 4000 }]
]);
const history = new Map([['AAA', rows], ['EMPTY', []]]);
const results = buildScannerResults(history, futures);
assert.equal(results.length, 1);
assert.equal(results[0].symbol, 'AAA');
assert.equal(results[0].metrics.oiExactDate, true);
assert.equal(results[0].metrics.futuresOi, 50000);
assert.ok(rows.length > MATERIALIZE_LOOKBACK_DAYS || MATERIALIZE_LOOKBACK_DAYS >= rows.length);

const stale = buildScannerResults(new Map([['BBB', rows]]), new Map([['BBB|2026-08-31', { trade_date: '2026-08-31', oi: 1, change_oi: 1 }]]));
assert.equal(stale[0].metrics.futuresOi, null);
assert.equal(stale[0].metrics.oiExactDate, false);

console.log('materializer tests passed');
