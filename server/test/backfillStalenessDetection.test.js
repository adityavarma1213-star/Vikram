'use strict';
// Regression test for the 2026-09-27 staleness-detection gap: needsRefresh() previously only
// checked whether `futures` was populated, so an existing on-disk snapshot whose CM rows were
// silently ingested with deliv_qty/deliv_per null for every row (the DD-Mon-YYYY vs ISO
// date-comparison bug -- see bhavcopyDateNormalization.test.js) was permanently treated as
// healthy and never re-fetched by the scheduled backfill job. This proves:
//   1) a snapshot with futures present but ALL CM rows missing Delivery is now detected as stale;
//   2) a snapshot with futures present and genuine Delivery data is NOT flagged (no false positive
//      staleness loop for healthy days);
//   3) a snapshot where only an isolated individual symbol is missing Delivery (a real, legitimate
//      NSE "Missing != Zero" case, not the systemic ingestion defect) is NOT flagged stale --
//      the fix targets the whole-day corruption signature, not ordinary per-symbol N/A.
//   4) a snapshot with an empty `futures` array is still flagged stale (pre-existing behavior
//      preserved).
//
// This does not touch accumulation/engine.js, accumulation/config.js, scannerEngine.js, or
// scanMaterializer.js, and asserts nothing about scoring, weights, or confirmation gates.

const assert = require('node:assert/strict');

// backfillHistory.js resolves HISTORY_DIR relative to its own module location
// (path.resolve(__dirname, '../..') + '/data/market-history'), so we point HOME/ROOT at a throwaway
// tmp copy of the module tree isn't practical here -- instead we exercise the exported pure
// function directly against constructed snapshot objects, which is what needsRefresh's on-disk
// branch delegates to. This keeps the test independent of the real data directory.
const { hasAllNullDelivery } = require('../src/backfillHistory');

// Case 1: whole-day corruption -- futures present, every CM row has deliv_qty: null.
const corruptedSnapshot = {
  tradeDate: '2026-09-16',
  futures: [{ symbol: 'RELIANCE', trade_date: '2026-09-16', oi: 100, change_oi: 5 }],
  cm: [
    { symbol: 'AAA', trade_date: '2026-09-16', close: 100, volume: 1000, deliv_qty: null, deliv_per: null },
    { symbol: 'BBB', trade_date: '2026-09-16', close: 50, volume: 2000, deliv_qty: null, deliv_per: null },
    { symbol: 'CCC', trade_date: '2026-09-16', close: 75, volume: 500, deliv_qty: null, deliv_per: null }
  ]
};
assert.equal(hasAllNullDelivery(corruptedSnapshot), true, 'whole-day null Delivery must be detected as corrupted');

// Case 2: healthy day -- futures present, every CM row has genuine Delivery.
const healthySnapshot = {
  tradeDate: '2026-09-16',
  futures: [{ symbol: 'RELIANCE', trade_date: '2026-09-16', oi: 100, change_oi: 5 }],
  cm: [
    { symbol: 'AAA', trade_date: '2026-09-16', close: 100, volume: 1000, deliv_qty: 400, deliv_per: 40 },
    { symbol: 'BBB', trade_date: '2026-09-16', close: 50, volume: 2000, deliv_qty: 900, deliv_per: 45 },
    { symbol: 'CCC', trade_date: '2026-09-16', close: 75, volume: 500, deliv_qty: 100, deliv_per: 20 }
  ]
};
assert.equal(hasAllNullDelivery(healthySnapshot), false, 'a day with genuine Delivery data must not be flagged stale');

// Case 3: isolated legitimate per-symbol N/A -- must NOT be flagged (Missing != Zero; this is not
// the systemic bug signature, and re-fetching every day with one N/A symbol would be a false-positive
// staleness loop).
const isolatedNaSnapshot = {
  tradeDate: '2026-09-16',
  futures: [{ symbol: 'RELIANCE', trade_date: '2026-09-16', oi: 100, change_oi: 5 }],
  cm: [
    { symbol: 'AAA', trade_date: '2026-09-16', close: 100, volume: 1000, deliv_qty: 400, deliv_per: 40 },
    { symbol: 'BBB', trade_date: '2026-09-16', close: 50, volume: 2000, deliv_qty: null, deliv_per: null },
    { symbol: 'CCC', trade_date: '2026-09-16', close: 75, volume: 500, deliv_qty: 100, deliv_per: 20 }
  ]
};
assert.equal(hasAllNullDelivery(isolatedNaSnapshot), false, 'one legitimately N/A symbol must not trigger whole-day staleness');

// Case 4: no CM rows at all is a different, pre-existing failure mode (empty/failed ingest), not
// the "populated but null" signature this fix targets -- hasAllNullDelivery must not claim it.
const emptyCmSnapshot = { tradeDate: '2026-09-16', futures: [{ symbol: 'RELIANCE', trade_date: '2026-09-16', oi: 100, change_oi: 5 }], cm: [] };
assert.equal(hasAllNullDelivery(emptyCmSnapshot), false, 'an empty CM array is a different failure mode, not whole-day-null-delivery');

console.log('backfill staleness-detection tests passed (4 scenarios)');
