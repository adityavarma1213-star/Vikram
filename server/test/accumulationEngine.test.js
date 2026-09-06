const assert = require('node:assert/strict');
const { evaluate } = require('../../accumulation/engine');

function row(date, close, prevClose, volume, delivery, turnover = 60000000) {
  return { trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, turnover, deliv_qty: Math.round((Number(volume) || 0) * (Number(delivery) || 0) / 100) };
}

const base = [
  row('2026-08-18', 100, 99, 1000, 40), row('2026-08-19', 101, 100, 1050, 41),
  row('2026-08-20', 101, 101, 1100, 42), row('2026-08-21', 102, 101, 1080, 43),
  row('2026-08-24', 103, 102, 1150, 44), row('2026-08-25', 103, 103, 1180, 46),
  row('2026-08-26', 104, 103, 1250, 47), row('2026-08-27', 104, 104, 1300, 48),
  row('2026-08-28', 105, 104, 1400, 50), row('2026-09-01', 106, 105, 2000, 58)
];

const fno = { available: true, trade_date: '2026-09-01', oi: 100000, change_oi: 7000 };
const cash = { available: false, trade_date: '2026-09-01', oi: 100000, change_oi: 7000 };

// Cash Equity: normalized score excludes the unavailable OI weight and requires 3/3 pillars.
const cashConfirmed = evaluate({ symbol: 'CASHGOOD', history: base, current: base.at(-1), futures: cash });
assert.equal(cashConfirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(cashConfirmed.metrics.hasDerivatives, false);
assert.equal(cashConfirmed.confirmation.pillars.passed, 3);
assert.equal(cashConfirmed.confirmation.pillars.required, 3);
assert.equal(cashConfirmed.score, 100);

// F&O Equity: 3/4 is sufficient; volume intentionally fails while Delivery/OBV/OI pass.
const fnoThreeOfFour = base.map((r, i) => i === base.length - 1 ? { ...r, volume: 800 } : r);
const fnoConfirmed = evaluate({ symbol: 'FNO3OF4', history: fnoThreeOfFour, current: fnoThreeOfFour.at(-1), futures: fno });
assert.equal(fnoConfirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(fnoConfirmed.confirmation.pillars.passed, 3);
assert.equal(fnoConfirmed.confirmation.pillars.required, 3);
assert.equal(fnoConfirmed.confirmation.pillars.total, 4);
assert.equal(fnoConfirmed.confirmation.pillars.details.volume, false);

// Quiet Absorption: high delivery + rising OBV + tight price with subdued volume.
const quiet = base.map((r, i) => i === base.length - 1 ? { ...r, close: 105.2, prev_close: 105.0, volume: 1050, deliv_per: 60 } : r);
const quietResult = evaluate({ symbol: 'QUIET', history: quiet, current: quiet.at(-1), futures: cash });
assert.equal(quietResult.verdict, 'QUIET ABSORPTION');
assert.ok(quietResult.metrics.volumeRatio >= 0.65 && quietResult.metrics.volumeRatio <= 1.05);

// Turnover floor: everything else can be strong, but < ₹5 Cr is an absolute safety failure.
const lowTurnover = { ...base.at(-1), turnover: 49999999 };
const turnoverResult = evaluate({ symbol: 'TURNOVERFAIL', history: base, current: lowTurnover, futures: cash });
assert.notEqual(turnoverResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(turnoverResult.confirmation.gateFailures.some(x => x.includes('turnover is below ₹5 Cr')));

// Delivery floor: <35% is an absolute safety failure.
const lowDelivery = { ...base.at(-1), deliv_per: 34.9 };
const deliveryResult = evaluate({ symbol: 'DELIVERYFAIL', history: base, current: lowDelivery, futures: cash });
assert.notEqual(deliveryResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(deliveryResult.confirmation.gateFailures.some(x => x.includes('delivery is below 35.0%')));

// Distribution breakdown: falling price + high volume + falling OBV/OI must never be confirmation.
const distributionHistory = base.map((r, i) => i === base.length - 1 ? { ...r, close: 90, prev_close: 100, volume: 5000, deliv_per: 25 } : r);
const distributionResult = evaluate({ symbol: 'DISTRIBUTION', history: distributionHistory, current: distributionHistory.at(-1), futures: { ...fno, change_oi: -12000 } });
assert.equal(distributionResult.verdict, 'DISTRIBUTION');

// History <10 sessions: insufficient confirmation history blocks confirmation.
const shortHistory = base.slice(0, 9);
const shortResult = evaluate({ symbol: 'SHORT', history: shortHistory, current: shortHistory.at(-1), futures: null });
assert.notEqual(shortResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(shortResult.confirmation.gateFailures.some(x => x.includes('history is shorter than 10 sessions')));

// Runtime sanitization: null/NaN samples must not poison the moving averages.
const dirtyHistory = base.map((r, i) => i === 2 ? { ...r, volume: NaN, deliv_per: NaN } : r);
const dirtyResult = evaluate({ symbol: 'DIRTY', history: dirtyHistory, current: dirtyHistory.at(-1), futures: cash });
assert.ok(Number.isFinite(dirtyResult.metrics.avgVolume));
assert.ok(Number.isFinite(dirtyResult.metrics.avgDelivery));

console.log('accumulation engine tests passed (8 statutory scenarios)');
