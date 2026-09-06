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
assert.equal(confirmed.metrics.pillarCount, 4);
assert.equal(confirmed.confirmation.quorum.passed, 4);

// Quiet/modest volume is no longer a universal veto when the other institutional pillars are strong.
const modestVolume = base.map((r, i) => i === base.length - 1 ? { ...r, volume: 1200 } : r);
const modestVolumeResult = evaluate({ symbol: 'MODESTVOL', history: modestVolume, current: modestVolume.at(-1), futures });
assert.equal(modestVolumeResult.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(modestVolumeResult.metrics.pillarCount, 3); // Delivery + OBV + OI

// Delivery below the safety floor blocks accumulation confirmation.
const lowDelivery = base.map((r, i) => i === base.length - 1 ? { ...r, deliv_per: 30.3 } : r);
const lowDeliveryResult = evaluate({ symbol: 'LOWDEL', history: lowDelivery, current: lowDelivery.at(-1), futures });
assert.notEqual(lowDeliveryResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(lowDeliveryResult.confirmation.gateFailures.includes('delivery is below 35%'));

// Cash-only stocks are evaluated on the three equity pillars; OI is not a prerequisite.
const cashResult = evaluate({ symbol: 'CASH', history: base, current: base.at(-1), futures: null });
assert.equal(cashResult.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(cashResult.metrics.fnoAvailable, false);
assert.equal(cashResult.metrics.availablePillars, 3);
assert.equal(cashResult.metrics.pillarCount, 3);

// Falling OI is not an accumulation pillar, but absence of OI must not automatically reject cash-equity evidence.
const negativeOiResult = evaluate({ symbol: 'NEGOI', history: base, current: base.at(-1), futures: { ...futures, change_oi: -7000 } });
assert.equal(negativeOiResult.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(negativeOiResult.metrics.fnoAvailable, true);
assert.equal(negativeOiResult.metrics.pillarCount, 3);

const fallingObvHistory = base.map((r, i) => {
  // The engine derives OBV direction from each row's close versus the prior row's actual close.
  if (i === base.length - 2) return { ...r, close: 108, prev_close: r.close, volume: 4000 };
  if (i === base.length - 1) return { ...r, close: 100, prev_close: 108, volume: 6000, deliv_per: 58 };
  return r;
});
const fallingObvResult = evaluate({ symbol: 'OBVFAIL', history: fallingObvHistory, current: fallingObvHistory.at(-1), futures });
assert.notEqual(fallingObvResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(fallingObvResult.confirmation.gateFailures.some(x => x.includes('quorum') || x.includes('price')));

console.log('accumulation engine tests passed (6 scenarios)');
