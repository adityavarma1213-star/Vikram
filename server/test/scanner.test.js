const assert = require('node:assert/strict');
const { evaluate } = require('../src/scannerEngine');

function row(date, close, prevClose, volume, delivery, deliveryQty) {
  return { trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: deliveryQty };
}

const history = [
  row('2026-08-17', 100, 99, 1000, 40, 400),
  row('2026-08-18', 101, 100, 1050, 41, 430),
  row('2026-08-19', 101, 101, 1100, 42, 460),
  row('2026-08-20', 102, 101, 1080, 43, 465),
  row('2026-08-21', 102, 102, 1150, 44, 500),
  row('2026-08-24', 103, 102, 1200, 45, 540),
  row('2026-08-25', 103, 103, 1180, 46, 545),
  row('2026-08-26', 104, 103, 1250, 47, 590),
  row('2026-08-27', 104, 104, 1300, 48, 620),
  row('2026-08-28', 105, 104, 1400, 50, 700),
  row('2026-09-01', 106, 105, 2000, 58, 1160)
];

const confirmed = evaluate('TEST', history, { trade_date: '2026-09-01', oi: 100000, change_oi: 7000 });
assert.equal(confirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(confirmed.metrics.oiExactDate, true);
assert.equal(confirmed.metrics.deliveryQty, 1160);
assert.ok(confirmed.score >= 75);

const postgresDateCase = evaluate('TEST', history.map(r => ({ ...r, trade_date: new Date(`${r.trade_date}T00:00:00Z`) }),), { trade_date: new Date('2026-09-01T00:00:00Z'), oi: 100000, change_oi: 7000 });
assert.equal(postgresDateCase.tradeDate, '2026-09-01');
assert.equal(postgresDateCase.metrics.oiExactDate, true);
assert.equal(postgresDateCase.metrics.futuresOi, 100000);

const stale = evaluate('TEST', history, { trade_date: '2026-08-28', oi: 95000, change_oi: 5000 });
assert.equal(stale.metrics.oiExactDate, false);
assert.equal(stale.metrics.futuresOi, null);
assert.equal(stale.metrics.changeOi, null);
assert.match(stale.why.join(' '), /exact date/);

const missingDelivery = evaluate('TEST', history.map(r => ({ ...r, deliv_per: null, deliv_qty: null })), null);
assert.equal(missingDelivery.metrics.deliveryPct, null);
assert.equal(missingDelivery.metrics.deliveryQty, null);
assert.match(missingDelivery.why.join(' '), /Delivery data is unavailable/);

const missingOi = evaluate('TEST', history, null);
assert.equal(missingOi.metrics.futuresOi, null);
assert.equal(missingOi.metrics.changeOi, null);
assert.match(missingOi.why.join(' '), /Futures OI confirmation is unavailable/);

const negativeOi = evaluate('TEST', history, { trade_date: '2026-09-01', oi: 100000, change_oi: -7000 });
assert.equal(negativeOi.metrics.changeOi, -7000);
assert.ok(negativeOi.score < confirmed.score);
assert.notEqual(negativeOi.verdict, 'ACCUMULATION CONFIRMED');

const volumeHistory = history.map((r, i) => i === history.length - 1 ? { ...r, volume: 2100 } : r);
const volumeCase = evaluate('TEST', volumeHistory, { trade_date: '2026-09-01', oi: 1, change_oi: 1 });
const priorAverage = history.slice(0, -1).reduce((sum, r) => sum + r.volume, 0) / (history.length - 1);
assert.ok(Math.abs(volumeCase.metrics.volumeRatio - (2100 / priorAverage)) < 1e-9);

const obv = evaluate('TEST', history, { trade_date: '2026-09-01', oi: 1, change_oi: 1 });
assert.equal(typeof obv.metrics.obv, 'number');
assert.ok(obv.metrics.obvTrend > 0);

const deliveryTrend = evaluate('TEST', history, { trade_date: '2026-09-01', oi: 1, change_oi: 1 });
assert.ok(deliveryTrend.metrics.deliveryTrend > 0);

const shortHistory = history.slice(-5);
const insufficient = evaluate('TEST', shortHistory, { trade_date: '2026-09-01', oi: 100000, change_oi: 7000 });
assert.notEqual(insufficient.verdict, 'ACCUMULATION CONFIRMED');
assert.match(insufficient.why.join(' '), /requires at least 10/);

const empty = evaluate('TEST', [], null);
assert.equal(empty.score, null);
assert.equal(empty.metrics.close, null);
assert.equal(empty.metrics.volume, null);
assert.equal(empty.metrics.deliveryPct, null);
assert.equal(empty.metrics.futuresOi, null);
assert.match(empty.why.join(' '), /No verified EOD history/);

console.log('scanner tests passed (11 scenarios)');
