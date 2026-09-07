const assert = require('node:assert/strict');
const { buildScannerResults, buildOiTrendBySymbolDate, MATERIALIZE_LOOKBACK_DAYS } = require('../src/scanMaterializer');

const rows = [];
for (let i = 0; i < 12; i++) {
  const day = String(17 + i).padStart(2, '0');
  rows.push({ trade_date: `2026-08-${day}`, close: 100 + i, prev_close: 99 + i, volume: 1000 + i * 100, deliv_per: 45 + i, deliv_qty: 500 + i, turnover: 600 });
}
rows.push({ trade_date: '2026-09-01', close: 115, prev_close: 114, volume: 2500, deliv_per: 60, deliv_qty: 1500, turnover: 600 });

const futuresRows = [
  { symbol: 'AAA', trade_date: '2026-08-28', expiry: '2026-09-25', oi: 40000, change_oi: 1000 },
  { symbol: 'AAA', trade_date: '2026-08-31', expiry: '2026-09-25', oi: 45000, change_oi: 5000 },
  { symbol: 'AAA', trade_date: '2026-09-01', expiry: '2026-09-25', oi: 50000, change_oi: 5000 }
];
const futures = new Map([
  ['AAA|2026-09-01', { available: true, trade_date: '2026-09-01', oi: 50000, change_oi: 5000 }]
]);
const history = new Map([['AAA', rows], ['EMPTY', []]]);
const oiTrends = buildOiTrendBySymbolDate(futuresRows);
assert.equal(oiTrends.get('AAA|2026-09-01'), 10000);
const results = buildScannerResults(history, futures, new Set(['AAA']), oiTrends);
assert.equal(results.length, 1);
assert.equal(results[0].symbol, 'AAA');
assert.equal(results[0].metrics.oiExactDate, true);
assert.equal(results[0].metrics.futuresOi, 50000);
assert.equal(results[0].metrics.oiTrend3Day, 10000);
assert.equal(results[0].metrics.hasDerivatives, true);
assert.ok(rows.length > MATERIALIZE_LOOKBACK_DAYS || MATERIALIZE_LOOKBACK_DAYS >= rows.length);

const stale = buildScannerResults(new Map([['BBB', rows]]), new Map([['BBB|2026-08-31', { available: true, trade_date: '2026-08-31', oi: 1, change_oi: 1 }]]));
assert.equal(stale[0].metrics.futuresOi, null);
assert.equal(stale[0].metrics.oiExactDate, false);

// Historical F&O support must survive an expired historical contract; the caller supplies
// derivativesSymbols independently of current-date contract availability.
const historicalFno = buildScannerResults(
  new Map([['CCC', rows]]),
  new Map(),
  new Set(['CCC']),
  new Map()
);
assert.equal(historicalFno[0].metrics.derivativesSupported, true);
assert.equal(historicalFno[0].metrics.derivativesState, 'OI_MISSING_UNEXPECTEDLY');
assert.equal(historicalFno[0].score, null);

console.log('materializer tests passed');
