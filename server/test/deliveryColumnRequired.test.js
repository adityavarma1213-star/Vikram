'use strict';
// Regression test for the delivery=0% anomaly root cause found 2026-09-15: this repo's actual
// LIVE production ingestion path (server/src/staticSnapshot.js, which produced the real
// data/market-history/2026-09-07..11.json files) required only price/volume columns, not
// delivery columns -- so a source response missing DlvryQty/DlvryPct/DELIV_QTY/DELIV_PER would
// silently parse every row's deliv_per as 0 (Number('') === 0 in JS), indistinguishable from a
// genuine 0% delivery day. backtest/nseDownloader.js got this same fix in an earlier session
// (batch 1); this test guards the separately-maintained server/ copy, which had NOT been fixed
// and is the one that actually produced the real, currently-live anomalous data.
const assert = require('node:assert/strict');
const { parseCsv, requireColumns } = require('../src/staticSnapshot');

// UDiFF-shaped row missing DlvryQty/DlvryPct -- SYNTHETIC_TEST_ONLY fixture, not real NSE data.
const udiffRowsMissingDelivery = parseCsv(Buffer.from(
  'TradDt,TckrSymb,SctySrs,ClsPric,PrvsClsgPric,TtlTradgVol\n2026-09-11,TESTSYM,EQ,100,99,1000\n'
));
assert.throws(
  () => requireColumns(udiffRowsMissingDelivery, 'NSE UDiFF CM', ['TradDt', 'TckrSymb', 'SctySrs', 'ClsPric', 'PrvsClsgPric', 'TtlTradgVol', 'DlvryQty', 'DlvryPct']),
  /missing columns.*DlvryQty|missing columns.*DlvryPct/,
  'a UDiFF CM response missing delivery columns must throw, not silently produce deliv_per: 0'
);

// Legacy-shaped row missing DELIV_QTY/DELIV_PER -- also SYNTHETIC_TEST_ONLY.
const legacyRowsMissingDelivery = parseCsv(Buffer.from(
  'SYMBOL,SERIES,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY\nTESTSYM,EQ,100,99,1000\n'
));
assert.throws(
  () => requireColumns(legacyRowsMissingDelivery, 'NSE security-wise bhavcopy', ['SYMBOL', 'SERIES', 'CLOSE_PRICE', 'PREV_CLOSE', 'TTL_TRD_QNTY', 'DELIV_QTY', 'DELIV_PER']),
  /missing columns.*DELIV_QTY|missing columns.*DELIV_PER/,
  'a legacy bhavcopy response missing delivery columns must throw, not silently produce deliv_per: 0'
);

// A response that DOES include delivery columns must still pass (no false positive).
const udiffRowsWithDelivery = parseCsv(Buffer.from(
  'TradDt,TckrSymb,SctySrs,ClsPric,PrvsClsgPric,TtlTradgVol,DlvryQty,DlvryPct\n2026-09-11,TESTSYM,EQ,100,99,1000,500,50\n'
));
requireColumns(udiffRowsWithDelivery, 'NSE UDiFF CM', ['TradDt', 'TckrSymb', 'SctySrs', 'ClsPric', 'PrvsClsgPric', 'TtlTradgVol', 'DlvryQty', 'DlvryPct']);

console.log('deliveryColumnRequired tests passed (SYNTHETIC_TEST_ONLY fixtures) -- server/src/staticSnapshot.js now fails loudly instead of silently zeroing delivery on a missing/renamed source column');
