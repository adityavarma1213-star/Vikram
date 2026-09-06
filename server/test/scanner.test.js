const assert = require('node:assert/strict');
const { evaluate } = require('../src/scannerEngine');

function row(date, close, prevClose, volume, delivery, deliveryQty, turnover = 60000000) {
  return { trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: deliveryQty, turnover };
}

const history = [
  row('2026-08-17', 100, 99, 1000, 40, 400), row('2026-08-18', 101, 100, 1050, 41, 430),
  row('2026-08-19', 101, 101, 1100, 42, 460), row('2026-08-20', 102, 101, 1080, 43, 465),
  row('2026-08-21', 102, 102, 1150, 44, 500), row('2026-08-24', 103, 102, 1200, 45, 540),
  row('2026-08-25', 103, 103, 1180, 46, 545), row('2026-08-26', 104, 103, 1250, 47, 590),
  row('2026-08-27', 104, 104, 1300, 48, 620), row('2026-08-28', 105, 104, 1400, 50, 700),
  row('2026-09-01', 106, 105, 2000, 58, 1160)
];
const fno = { available: true, trade_date: '2026-09-01', oi: 100000, change_oi: 7000 };

const confirmed = evaluate('TEST', history, fno);
assert.equal(confirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(confirmed.metrics.oiExactDate, true);
assert.equal(confirmed.metrics.deliveryQty, 1160);
assert.ok(confirmed.score >= 75);

const postgresHistory = history.map(r => ({ ...r, trade_date: new Date(`${r.trade_date}T00:00:00Z`) }));
const postgresDateCase = evaluate('TEST', postgresHistory, { ...fno, trade_date: new Date('2026-09-01T00:00:00Z') });
assert.equal(postgresDateCase.tradeDate, '2026-09-01');
assert.equal(postgresDateCase.metrics.oiExactDate, true);
assert.equal(postgresDateCase.metrics.futuresOi, 100000);

const stale = evaluate('TEST', history, { ...fno, trade_date: '2026-08-28' });
assert.equal(stale.metrics.oiExactDate, false);
assert.equal(stale.metrics.futuresOi, null);
assert.equal(stale.metrics.changeOi, null);

const missingDelivery = evaluate('TEST', history.map(r => ({ ...r, deliv_per: null, deliv_qty: null })), null);
assert.equal(missingDelivery.metrics.deliveryPct, null);
assert.equal(missingDelivery.metrics.deliveryQty, null);
assert.match(missingDelivery.why.join(' '), /Delivery data is unavailable/);

const missingOi = evaluate('TEST', history, null);
assert.equal(missingOi.metrics.futuresOi, null);
assert.equal(missingOi.metrics.changeOi, null);
assert.equal(missingOi.metrics.hasDerivatives, false);

// Falling OI removes the OI pillar but 3/4 still qualifies under the statutory F&O quorum.
const negativeOi = evaluate('TEST', history, { ...fno, change_oi: -7000 });
assert.equal(negativeOi.metrics.changeOi, -7000);
assert.ok(negativeOi.score < confirmed.score);
assert.equal(negativeOi.confirmation.pillars.passed, 3);
assert.equal(negativeOi.verdict, 'ACCUMULATION CONFIRMED');

const volumeHistory = history.map((r, i) => i === history.length - 1 ? { ...r, volume: 2100 } : r);
const volumeCase = evaluate('TEST', volumeHistory, fno);
const priorAverage = history.slice(0, -1).reduce((sum, r) => sum + r.volume, 0) / (history.length - 1);
assert.ok(Math.abs(volumeCase.metrics.volumeRatio - (2100 / priorAverage)) < 1e-9);

const obv = evaluate('TEST', history, fno);
assert.equal(typeof obv.metrics.obv, 'number');
assert.ok(obv.metrics.obvTrend > 0);

const deliveryTrend = evaluate('TEST', history, fno);
assert.ok(deliveryTrend.metrics.deliveryTrend > 0);

const shortHistory = history.slice(-5);
const insufficient = evaluate('TEST', shortHistory, fno);
assert.notEqual(insufficient.verdict, 'ACCUMULATION CONFIRMED');
assert.match(insufficient.why.join(' '), /history is shorter than 10 sessions/);

const empty = evaluate('TEST', [], null);
assert.equal(empty.score, null);
assert.equal(empty.metrics.close, null);
assert.equal(empty.metrics.volume, null);
assert.equal(empty.metrics.deliveryPct, null);
assert.equal(empty.metrics.futuresOi, null);
assert.match(empty.why.join(' '), /No verified EOD history/);

console.log('scanner tests passed (11 scenarios)');
