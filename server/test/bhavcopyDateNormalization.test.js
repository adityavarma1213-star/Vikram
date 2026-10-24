'use strict';
// Offline regression tests over the REAL on-disk market-history (no network, no NSE access).
// The former TEST 1 / TEST 2 exercised fetchCm(), the direct NSE download function, which was
// removed (see docs/NSE_ACQUISITION_REMOVED.md); they are gone with it. What remains proves that
// the Futures OI exact-date path (INDHOTEL) and the non-F&O control (3MINDIA) are unaffected.

const assert = require('node:assert/strict');

const PINNED_SESSION = '2026-09-25';
const historyThrough = (history, date) => history.filter(d => d.tradeDate <= date);

async function run() {
  const { readHistory, materialize } = require('../src/staticSnapshot');

  // ---------------------------------------------------------------------------------------
  // TEST 3 -- FUTURES CONTROL (untouched code path): INDHOTEL / 2026-09-25 exact-date OI
  // must remain fully populated, read from the REAL on-disk market-history (same convention
  // as test/researchStatic.test.js), proving the Futures/materialize path was not touched by
  // this fix.
  // ---------------------------------------------------------------------------------------
  {
    // materialize() returns ONE row per symbol: that symbol's latest session. This test is about the
    // 2026-09-25 session, so the real on-disk history is cut at that date (point-in-time). Without the
    // cut, any later session added to data/market-history (e.g. 2026-09-28) moves every symbol's row off
    // 2026-09-25 and the lookup below finds nothing. Same real data, same assertions; only the input is pinned.
    const history = readHistory();
    assert.ok(history.length > 0, 'expected real market-history files to be present in this repo');
    assert.ok(history.some(d => d.tradeDate === PINNED_SESSION), `expected the real ${PINNED_SESSION} session in data/market-history`);
    const materialized = materialize(historyThrough(history, PINNED_SESSION));
    const row = materialized.results.find(r => r.symbol === 'INDHOTEL' && r.tradeDate === PINNED_SESSION);
    assert.ok(row, 'expected an INDHOTEL result for 2026-09-25');
    assert.equal(typeof row.metrics.futuresOi, 'number');
    assert.ok(row.metrics.futuresOi > 0, 'futuresOi must be populated (non-null, positive)');
    assert.equal(typeof row.metrics.changeOi, 'number');
    assert.equal(row.metrics.oiExactDate, true, 'exact-date OI must remain true for INDHOTEL');
  }

  // ---------------------------------------------------------------------------------------
  // TEST 4 -- NON-F&O CONTROL (untouched code path): 3MINDIA / 2026-09-25 must remain
  // correctly N/A for Futures OI, read from the REAL on-disk market-history.
  // ---------------------------------------------------------------------------------------
  {
    const history = readHistory();
    assert.ok(history.some(d => d.tradeDate === PINNED_SESSION), `expected the real ${PINNED_SESSION} session in data/market-history`);
    const materialized = materialize(historyThrough(history, PINNED_SESSION));
    const row = materialized.results.find(r => r.symbol === '3MINDIA' && r.tradeDate === PINNED_SESSION);
    assert.ok(row, 'expected a 3MINDIA result for 2026-09-25');
    assert.equal(row.metrics.futuresOi, null, '3MINDIA has no F&O contract -- futuresOi must remain null');
    assert.equal(row.metrics.changeOi, null, '3MINDIA has no F&O contract -- changeOi must remain null');
    assert.equal(row.metrics.oiExactDate, false, '3MINDIA has no F&O contract -- oiExactDate must remain false');
    assert.ok(!materialized.derivativesSymbols.has('3MINDIA'), '3MINDIA must not appear in derivativesSymbols');
  }

  console.log('bhavcopyDateNormalization tests passed (offline; Futures OI and non-F&O controls unaffected)');
}

run().catch(err => { console.error(err); process.exit(1); });
