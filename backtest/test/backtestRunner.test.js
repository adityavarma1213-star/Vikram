// SYNTHETIC_TEST_ONLY — fabricated price series to test the backtest MECHANICS
// (look-ahead safety, horizon computation, insufficient-future-data handling).
// These numbers are not real NSE data and these results are not a real backtest.
const assert = require('node:assert/strict');
const { detectSignalsAndForwardReturns } = require('../backtestRunner');
const realEngine = require('../lib/engineAdapter');

function row(date, close, prevClose, volume, delivery) {
  return { symbol: 'FAKE', trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: Math.round(volume * delivery / 100) };
}

// Build 30 days of firm accumulation-style fixture data (mirrors the shape
// used in server/test/accumulationEngine.test.js) so the engine's own
// confirmation gates plausibly fire, then 3 more days after the last signal
// so 1D can be COMPUTED but 5D/20D/60D/120D cannot (INSUFFICIENT_FUTURE_DATA).
const dates = [];
let d = new Date('2026-01-01T00:00:00Z');
for (let i = 0; i < 33; i += 1) { dates.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }

// Volume/delivery spike every 5th day from day 20 onward (mirrors the "good"
// scenario in server/test/accumulationEngine.test.js) so the engine's strict
// confirmation gates (volume ratio, delivery, OBV, exact-date OI) actually
// clear on spike days, while quiet days between spikes do not confirm.
const history = dates.map((date, i) => {
  const isSpike = i >= 20 && i % 5 === 4;
  return row(date, 100 + i, 100 + i - 1, isSpike ? 2500 : 1000, isSpike ? 60 : 40);
});
const bySymbol = new Map([['FAKE', history]]);
const futuresBySymbolDate = new Map();
for (let i = 15; i < history.length; i += 1) {
  futuresBySymbolDate.set(`FAKE|${history[i].trade_date}`, { trade_date: history[i].trade_date, oi: 100000 + i * 1000, change_oi: 7000 });
}

const { signals, horizonStats } = detectSignalsAndForwardReturns(bySymbol, futuresBySymbolDate, realEngine, { warmup: 20 });

assert.ok(signals.length > 0, 'expected at least one confirmed signal in the fixture');

// Look-ahead safety: every signal's forward return, when COMPUTED, must use an
// exitDate strictly AFTER the signalDate.
for (const s of signals) {
  for (const [horizonKey, fr] of Object.entries(s.forwardReturns)) {
    if (fr.status === 'COMPUTED') assert.ok(fr.exitDate > s.signalDate, `${horizonKey} exit date must be after signal date`);
  }
}

// The last signals (near the end of the fixture) should have some horizons
// marked INSUFFICIENT_FUTURE_DATA rather than a fabricated number.
const lastSignal = signals[signals.length - 1];
const hasInsufficient = Object.values(lastSignal.forwardReturns).some(fr => fr.status === 'INSUFFICIENT_FUTURE_DATA');
assert.ok(hasInsufficient, 'expected the most recent signal to lack full future data for the longer horizons');

assert.ok(horizonStats['1D'], 'expected 1D horizon stats');
assert.ok(horizonStats['120D'], 'expected 120D horizon stats');

// --- AUDIT FOLLOW-UP verification: event semantics ---
// Every signal must now carry detection-EVENT metadata (§6/§8), not just a
// bare day. firstDetectionPrice must equal the price on firstDetectionDate,
// never a later day's price even when the streak continued.
for (const s of signals) {
  assert.ok(s.eventStatus === 'New' || s.eventStatus === 'Active', `eventStatus must be New or Active, got ${s.eventStatus}`);
  assert.ok(s.tradingSessionStreak >= 1);
  assert.equal(s.entryClose, s.firstDetectionPrice, 'entry price must be the FIRST detection day price, never the latest');
}

// A consecutive multi-day confirmation must collapse into ONE event with a
// streak > 1, not N separate day-level signals — this is the exact behavior
// AUDIT.md §8 flagged as missing. Build a fixture with 3 CONSECUTIVE spike
// days to prove it.
{
  const consecDates = [];
  let cd = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 30; i += 1) { consecDates.push(cd.toISOString().slice(0, 10)); cd = new Date(cd.getTime() + 86400000); }
  const consecHistory = consecDates.map((date, i) => {
    const isSpike = i >= 20; // spike on day 20 AND every day after -> a genuine multi-day streak
    return row(date, 100 + i, 100 + i - 1, isSpike ? 2500 : 1000, isSpike ? 60 : 40);
  });
  const consecBySymbol = new Map([['CONSEC', consecHistory]]);
  const consecFutures = new Map();
  for (let i = 15; i < consecHistory.length; i += 1) consecFutures.set(`CONSEC|${consecHistory[i].trade_date}`, { trade_date: consecHistory[i].trade_date, oi: 100000, change_oi: 7000 });

  const { signals: consecSignals } = detectSignalsAndForwardReturns(consecBySymbol, consecFutures, realEngine, { warmup: 20 });
  assert.equal(consecSignals.length, 1, `EVENT COLLAPSE FAILURE: a single continuous confirmed streak must be ONE event, got ${consecSignals.length}`);
  assert.ok(consecSignals[0].tradingSessionStreak > 1, 'a multi-day streak must report tradingSessionStreak > 1');
  assert.equal(consecSignals[0].firstDetectionDate, consecHistory[20].trade_date, 'firstDetectionDate must be the FIRST day the streak started, not a later day');
}

// --- AUDIT FOLLOW-UP verification: corporate-action caveat is attached, never silently absorbed ---
{
  const caDates = [];
  let cad = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 30; i += 1) { caDates.push(cad.toISOString().slice(0, 10)); cad = new Date(cad.getTime() + 86400000); }
  const caHistory = caDates.map((date, i) => {
    const isSpike = i === 24; // single confirmed day at index 24
    let close = 100 + i;
    if (i === 26) close = 40; // a huge drop 2 days after entry, inside the 5D holding window -> suspected corp action
    return row(date, close, i === 26 ? 100 + i - 1 : 100 + i - 1, isSpike ? 2500 : 1000, isSpike ? 60 : 40);
  });
  const caBySymbol = new Map([['CAFLAG', caHistory]]);
  const caFutures = new Map();
  for (let i = 15; i < caHistory.length; i += 1) caFutures.set(`CAFLAG|${caHistory[i].trade_date}`, { trade_date: caHistory[i].trade_date, oi: 100000, change_oi: 7000 });

  const { signals: caSignals } = detectSignalsAndForwardReturns(caBySymbol, caFutures, realEngine, { warmup: 20, corporateActionCoverage: { status: 'CORPORATE_ACTION_DATA_REQUIRED' } });
  assert.ok(caSignals.length > 0, 'expected the fixture to produce a signal to check the caveat against');
  const withDrop = caSignals.find(s => s.firstDetectionDate === caHistory[24].trade_date);
  assert.ok(withDrop, 'expected a signal at the fixture spike day');
  assert.ok(withDrop.forwardReturns['5D'].corporateActionCaveat, '5D horizon spans the suspected discontinuity and MUST carry a caveat, not a silently-trusted return');
  assert.match(withDrop.forwardReturns['5D'].corporateActionCaveat, /CORPORATE_ACTION_DATA_REQUIRED/, 'caveat must surface the actual coverage status, not hide it');
  if (withDrop.forwardReturns['1D'].status === 'COMPUTED') {
    assert.equal(withDrop.forwardReturns['1D'].corporateActionCaveat, null, '1D holding period ends before the discontinuity and must NOT be falsely flagged');
  }
}

console.log(`backtestRunner.test.js passed (${signals.length} synthetic signal(s) + event-collapse + corporate-action-caveat checks, SYNTHETIC_TEST_ONLY — not a real backtest)`);
