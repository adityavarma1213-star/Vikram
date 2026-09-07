const assert = require('node:assert/strict');
const { evaluate } = require('../../accumulation/engine');

function row(date, close, prevClose, volume, delivery) {
  return { trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: Math.round(volume * delivery / 100) };
}

const base = [
  row('2026-08-18', 100, 99, 1000, 40), row('2026-08-19', 101, 100, 1050, 41),
  row('2026-08-20', 101, 101, 1100, 42), row('2026-08-21', 102, 101, 1080, 43),
  row('2026-08-24', 103, 102, 1150, 44), row('2026-08-25', 103, 103, 1180, 46),
  row('2026-08-26', 104, 103, 1250, 47), row('2026-08-27', 104, 104, 1300, 48),
  row('2026-08-28', 105, 104, 1400, 50), row('2026-09-01', 106, 105, 2000, 58)
];

const futures = { trade_date: '2026-09-01', oi: 100000, change_oi: 7000 };
const confirmed = evaluate({ symbol: 'GOOD', history: base, current: base.at(-1), futures });
assert.equal(confirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.deepEqual(confirmed.confirmation.gateFailures, []);

const lowVolume = base.map((r, i) => i === base.length - 1 ? { ...r, volume: 1200 } : r);
const lowVolumeResult = evaluate({ symbol: 'LOWVOL', history: lowVolume, current: lowVolume.at(-1), futures });
assert.notEqual(lowVolumeResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(lowVolumeResult.confirmation.gateFailures.includes('volume ratio is below 1.2x'));

const lowDelivery = base.map((r, i) => i === base.length - 1 ? { ...r, deliv_per: 30.3 } : r);
const lowDeliveryResult = evaluate({ symbol: 'LOWDEL', history: lowDelivery, current: lowDelivery.at(-1), futures });
assert.notEqual(lowDeliveryResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(lowDeliveryResult.confirmation.gateFailures.includes('delivery is below 45%'));

const noOiResult = evaluate({ symbol: 'NOOI', history: base, current: base.at(-1), futures: null });
assert.notEqual(noOiResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(noOiResult.confirmation.gateFailures.includes('exact-date futures OI is not increasing'));

const negativeOiResult = evaluate({ symbol: 'NEGOI', history: base, current: base.at(-1), futures: { ...futures, change_oi: -7000 } });
assert.notEqual(negativeOiResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(negativeOiResult.confirmation.gateFailures.includes('exact-date futures OI is not increasing'));

const fallingObvHistory = base.map((r, i) => {
  if (i === base.length - 2) return { ...r, close: 108, prev_close: r.close, volume: 4000 };
  if (i === base.length - 1) return { ...r, close: 100, prev_close: 108, volume: 6000, deliv_per: 58 };
  return r;
});
const fallingObvResult = evaluate({ symbol: 'OBVFAIL', history: fallingObvHistory, current: fallingObvHistory.at(-1), futures });
assert.notEqual(fallingObvResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(fallingObvResult.confirmation.gateFailures.includes('OBV is not rising'));

console.log('accumulation engine tests passed (6 scenarios)');
