'use strict';

const assert = require('node:assert/strict');
const { parseCsv, requireColumns } = require('../src/staticSnapshot');

// UDiFF CM does not require delivery columns. Delivery may be unavailable/null
// when the separate delivery-bearing source is not present.
const udiffRowsMissingDelivery = parseCsv(Buffer.from(
  'TradDt,TckrSymb,SctySrs,ClsPric,PrvsClsgPric,TtlTradgVol\n2026-09-11,TESTSYM,EQ,100,99,1000\n'
));
requireColumns(
  udiffRowsMissingDelivery,
  'NSE UDiFF CM',
  ['TradDt', 'TckrSymb', 'SctySrs', 'ClsPric', 'PrvsClsgPric', 'TtlTradgVol']
);

// Delivery-bearing source must still require its delivery headers.
const legacyRowsMissingDelivery = parseCsv(Buffer.from(
  'SYMBOL,SERIES,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY\nTESTSYM,EQ,100,99,1000\n'
));
assert.throws(
  () => requireColumns(
    legacyRowsMissingDelivery,
    'NSE security-wise bhavcopy',
    ['SYMBOL', 'SERIES', 'CLOSE_PRICE', 'PREV_CLOSE', 'TTL_TRD_QNTY', 'DELIV_QTY', 'DELIV_PER']
  ),
  /missing columns.*DELIV_QTY|missing columns.*DELIV_PER/
);

const legacyRowsWithDelivery = parseCsv(Buffer.from(
  'SYMBOL,SERIES,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY,DELIV_QTY,DELIV_PER\nTESTSYM,EQ,100,99,1000,500,50\n'
));
requireColumns(
  legacyRowsWithDelivery,
  'NSE security-wise bhavcopy',
  ['SYMBOL', 'SERIES', 'CLOSE_PRICE', 'PREV_CLOSE', 'TTL_TRD_QNTY', 'DELIV_QTY', 'DELIV_PER']
);

console.log('deliveryColumnRequired tests passed');
