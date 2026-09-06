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
const cash = { available: false, trade_date: '2026-09-01' };

const cashConfirmed = evaluate({ symbol: 'CASHGOOD', history: base, current: base.at(-1), futures: cash });
assert.equal(cashConfirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(cashConfirmed.metrics.hasDerivatives, false);
assert.equal(cashConfirmed.metrics.derivativesSupported, false);
assert.equal(cashConfirmed.metrics.derivativesState, 'OI_NOT_SUPPORTED');
assert.equal(cashConfirmed.confirmation.pillars.passed, 3);
assert.equal(cashConfirmed.confirmation.pillars.required, 3);
assert.equal(cashConfirmed.confirmation.pillars.total, 3);
assert.equal(cashConfirmed.score, 100);

const cashWeakVolumeHistory = base.map((r, i) => i === base.length - 1 ? { ...r, volume: 700 } : r);
const cashWeakVolume = evaluate({ symbol: 'CASH2OF3', history: cashWeakVolumeHistory, current: cashWeakVolumeHistory.at(-1), futures: cash });
assert.notEqual(cashWeakVolume.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(cashWeakVolume.confirmation.pillars.passed, 2);
assert.equal(cashWeakVolume.confirmation.pillars.required, 3);
assert.equal(cashWeakVolume.confirmation.pillars.details.volume, false);

const fnoWeakVolumeHistory = base.map((r, i) => i === base.length - 1 ? { ...r, volume: 800 } : r);
const fnoWeakVolume = evaluate({ symbol: 'FNO_WEAK_VOLUME', history: fnoWeakVolumeHistory, current: fnoWeakVolumeHistory.at(-1), futures: fno });
assert.notEqual(fnoWeakVolume.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(fnoWeakVolume.confirmation.pillars.passed, 3);
assert.equal(fnoWeakVolume.confirmation.pillars.required, 4);
assert.equal(fnoWeakVolume.confirmation.pillars.total, 4);
assert.equal(fnoWeakVolume.confirmation.pillars.details.volume, false);

const fnoConfirmed = evaluate({ symbol: 'FNO_GOOD', history: base, current: base.at(-1), futures: fno });
assert.equal(fnoConfirmed.verdict, 'ACCUMULATION CONFIRMED');
assert.equal(fnoConfirmed.metrics.derivativesState, 'OI_SUPPORTED_WITH_EVIDENCE');
assert.equal(fnoConfirmed.confirmation.pillars.passed, 4);
assert.equal(fnoConfirmed.confirmation.pillars.required, 4);
assert.equal(fnoConfirmed.confirmation.pillars.total, 4);
assert.equal(fnoConfirmed.confirmation.pillars.details.price, true);

// Falling closes are deliberately stronger than the base fixture so the OBV test cannot accidentally rise on the first replacement row.
const fallingObvHistory = base.map((r, i) => {
  if (i < base.length - 5) return r;
  const closes = [102, 101, 100, 99, 98];
  return { ...r, close: closes[i - (base.length - 5)], prev_close: closes[i - (base.length - 5)] + 1, volume: 2000, deliv_per: 60 };
});
const fallingObv = evaluate({ symbol: 'HDFCLIFE_CASE', history: fallingObvHistory, current: fallingObvHistory.at(-1), futures: fno });
assert.equal(fallingObv.confirmation.pillars.details.obv, false);
assert.notEqual(fallingObv.verdict, 'ACCUMULATION CONFIRMED');

const flatPriceHistory = base.map((r, i) => i === base.length - 1 ? { ...r, close: 105.05, prev_close: 105, volume: 2000, deliv_per: 60 } : r);
const flatPrice = evaluate({ symbol: 'DABUR_CASE', history: flatPriceHistory, current: flatPriceHistory.at(-1), futures: fno });
assert.equal(flatPrice.confirmation.pillars.details.price, false);
assert.notEqual(flatPrice.verdict, 'ACCUMULATION CONFIRMED');

const fnoMissingOi = evaluate({ symbol: 'FNOMISSINGOI', history: base, current: base.at(-1), futures: { available: false, derivativesSupported: true, trade_date: '2026-09-01' } });
assert.equal(fnoMissingOi.metrics.derivativesState, 'OI_MISSING_UNEXPECTEDLY');
assert.equal(fnoMissingOi.score, null);
assert.notEqual(fnoMissingOi.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(fnoMissingOi.confirmation.gateFailures.some(x => x.includes('F&O OI data is missing unexpectedly')));

const quiet = base.map((r, i) => i === base.length - 1 ? { ...r, close: 105.2, prev_close: 105.0, volume: 1050, deliv_per: 60 } : r);
const quietResult = evaluate({ symbol: 'QUIET', history: quiet, current: quiet.at(-1), futures: cash });
assert.equal(quietResult.verdict, 'QUIET ABSORPTION');
assert.ok(quietResult.metrics.volumeRatio >= 0.65 && quietResult.metrics.volumeRatio <= 1.05);

const lowTurnover = { ...base.at(-1), turnover: 49999999 };
const turnoverResult = evaluate({ symbol: 'TURNOVERFAIL', history: base, current: lowTurnover, futures: cash });
assert.notEqual(turnoverResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(turnoverResult.confirmation.gateFailures.some(x => x.includes('turnover is below ₹5 Cr')));

const lowDelivery = { ...base.at(-1), deliv_per: 34.9 };
const deliveryResult = evaluate({ symbol: 'DELIVERYFAIL', history: base, current: lowDelivery, futures: cash });
assert.notEqual(deliveryResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(deliveryResult.confirmation.gateFailures.some(x => x.includes('delivery is below 35.0%')));

const cashLowConfirmedDelivery = { ...base.at(-1), deliv_per: 50 };
const cashLowConfirmedDeliveryResult = evaluate({ symbol: 'CASH_DELIVERY_50', history: base, current: cashLowConfirmedDelivery, futures: cash });
assert.equal(cashLowConfirmedDeliveryResult.confirmation.pillars.details.delivery, false);
assert.notEqual(cashLowConfirmedDeliveryResult.verdict, 'ACCUMULATION CONFIRMED');

const distributionHistory = base.map((r, i) => i === base.length - 1 ? { ...r, close: 90, prev_close: 100, volume: 5000, deliv_per: 25 } : r);
const distributionResult = evaluate({ symbol: 'DISTRIBUTION', history: distributionHistory, current: distributionHistory.at(-1), futures: { ...fno, change_oi: -12000 } });
assert.equal(distributionResult.verdict, 'DISTRIBUTION');

const shortHistory = base.slice(0, 9);
const shortResult = evaluate({ symbol: 'SHORT', history: shortHistory, current: shortHistory.at(-1), futures: null });
assert.notEqual(shortResult.verdict, 'ACCUMULATION CONFIRMED');
assert.ok(shortResult.confirmation.gateFailures.some(x => x.includes('history is shorter than 10 sessions')));

const dirtyHistory = base.map((r, i) => i === 2 ? { ...r, volume: NaN, deliv_per: NaN } : r);
const dirtyResult = evaluate({ symbol: 'DIRTY', history: dirtyHistory, current: dirtyHistory.at(-1), futures: cash });
assert.ok(Number.isFinite(dirtyResult.metrics.avgVolume));
assert.ok(Number.isFinite(dirtyResult.metrics.avgDelivery));

console.log('accumulation engine tests passed (14 statutory scenarios)');
