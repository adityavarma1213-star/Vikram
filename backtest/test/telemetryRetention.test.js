// SYNTHETIC_TEST_ONLY fixture (same style as backtestRunner.test.js). Verifies that every field the frozen
// engine produced at decision time survives engine -> verdict stream -> events -> result -> CSV/JSON,
// that missing values stay N/A (never 0), and that the replay cannot see the future.
const assert = require('node:assert/strict');
const { detectSignalsAndForwardReturns } = require('../backtestRunner');
const realEngine = require('../lib/engineAdapter');
const { buildDecisionRecord, recordToFlat, toCsv, parseCsv, csvCellToValue, CSV_COLUMNS } = require('../lib/telemetrySchema');
const { computeOutcome, summarizeHorizon } = require('../lib/catchOutcome');

function build(n = 40, mutateFrom = null) {
  const dates = []; let d = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < n; i += 1) { dates.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
  const history = dates.map((date, i) => {
    const spike = i >= 20 && i % 5 === 4;
    let close = 100 + i; let volume = spike ? 2500 : 1000; let del = spike ? 60 : 40;
    if (mutateFrom !== null && i > mutateFrom) { close = 50; volume = 1; del = 1; }
    return { symbol: 'FAKE', trade_date: date, close, prev_close: close - 1, volume, deliv_per: del, deliv_qty: Math.round(volume * del / 100) };
  });
  const fut = new Map();
  for (let i = 15; i < history.length; i += 1) fut.set(`FAKE|${history[i].trade_date}`, { trade_date: history[i].trade_date, oi: 100000 + i * 1000, change_oi: 7000 });
  return { history, bySymbol: new Map([['FAKE', history]]), fut };
}

const { bySymbol, fut, history } = build();
const { signals } = detectSignalsAndForwardReturns(bySymbol, fut, realEngine, { warmup: 20 });
assert.ok(signals.length > 0);

for (const s of signals) {
  assert.ok(Array.isArray(s.decisions) && s.decisions.length === s.tradingSessionStreak, 'one decision record per confirmed streak day');
  for (const r of s.decisions) {
    assert.equal(r.verdict, 'ACCUMULATION CONFIRMED');
    for (const f of ['volumeRatio', 'obv', 'obvTrend', 'deliveryPct', 'futuresOi', 'changeOi', 'priceChangePct']) assert.equal(typeof r.metrics[f], 'number', `${f} retained as a number`);
    assert.equal(typeof r.score, 'number');
    assert.ok(r.score >= 75, 'score >= 75');
    assert.ok(r.metrics.volumeRatio >= 1.2 && r.metrics.deliveryPct >= 45 && r.metrics.obvTrend > 0 && r.metrics.changeOi > 0 && r.metrics.priceChangePct > 0.25, 'confirmation gates hold on the retained values');
    assert.deepEqual(r.gateFailures, []);
  }
}

// CSV round trip keeps numbers; null becomes N/A and comes back as null (never 0).
const flat = signals.flatMap(s => s.decisions.map((r, i) => recordToFlat(r, { eventIndex: s.eventIndex, streakDay: i + 1, streakLength: s.tradingSessionStreak })));
flat[0].obv = null; // simulate a genuinely missing value
const rows = parseCsv(toCsv(flat));
assert.equal(rows.length, flat.length);
assert.equal(rows[0].obv, 'N/A');
assert.equal(csvCellToValue(rows[0].obv), null);
assert.equal(csvCellToValue(rows[1].score), flat[1].score);
assert.deepEqual(Object.keys(rows[0]), CSV_COLUMNS);
const missing = buildDecisionRecord('X', { tradeDate: '2026-01-01', verdict: 'NO SIGNAL', score: null, metrics: { volumeRatio: null }, components: [], confirmation: {} }, { historyLength: 3 });
assert.equal(missing.score, null);
assert.equal(missing.metrics.volumeRatio, null);

// No look-ahead: changing every row after day D leaves every decision on or before D identical.
const cutoff = 31;
const a = detectSignalsAndForwardReturns(bySymbol, fut, realEngine, { warmup: 20 }).signals;
const alt = build(40, cutoff);
const b = detectSignalsAndForwardReturns(alt.bySymbol, alt.fut, realEngine, { warmup: 20 }).signals;
const upTo = list => list.flatMap(s => s.decisions).filter(r => r.tradeDate <= history[cutoff].trade_date).map(r => JSON.stringify(r));
assert.deepEqual(upTo(a), upTo(b), 'decisions up to the cutoff must not depend on later rows');

// Outcome: reference price, horizons, MFE/MAE, insufficient data is never zero.
const o = computeOutcome(history, 24, history[24].close);
assert.equal(o.referencePrice, history[24].close);
assert.equal(o.horizons['1D'].status, 'COMPUTED');
assert.equal(o.horizons['20D'].status, 'INSUFFICIENT_FUTURE_DATA');
assert.ok(o.horizons['5D'].mfePct >= o.horizons['5D'].maePct);
const sum = summarizeHorizon([o], 20);
assert.equal(sum.computed, 0); assert.equal(sum.winRatePct, null);

console.log('telemetryRetention tests passed');
