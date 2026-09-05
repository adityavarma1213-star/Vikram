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

const confirmed = evaluate('TEST', history, {
  trade_date: '2026-09-01', oi: 100000, change_oi: 7000
});
assert.equal(confirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(confirmed.metrics.oiExactDate, true);
assert.equal(confirmed.metrics.deliveryQty, 1160);
assert.ok(confirmed.score >= 75);

const stale = evaluate('TEST', history, {
  trade_date: '2026-08-28', oi: 95000, change_oi: 5000
});
assert.equal(stale.metrics.oiExactDate, false);
assert.equal(stale.metrics.futuresOi, null);
assert.equal(stale.metrics.changeOi, null);
assert.match(stale.why.join(' '), /exact date/);

const missing = evaluate('TEST', history.map(r => ({ ...r, deliv_per: null, deliv_qty: null })), null);
assert.equal(missing.metrics.deliveryPct, null);
assert.equal(missing.metrics.deliveryQty, null);
assert.match(missing.why.join(' '), /Delivery data is unavailable/);

console.log('scanner tests passed');
