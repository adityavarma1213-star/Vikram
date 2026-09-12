'use strict';
const assert = require('node:assert/strict');
const { classifyCmRow, classifyFoRow, validateBatch } = require('../src/ingestValidation');

const DATE = '2026-09-01';
function baseCm(overrides = {}) {
  return {
    SYMBOL: 'RELIANCE', SERIES: 'EQ', PREV_CLOSE: '100', OPEN_PRICE: '101', HIGH_PRICE: '105',
    LOW_PRICE: '99', LAST_PRICE: '104', CLOSE_PRICE: '104', AVG_PRICE: '102',
    TTL_TRD_QNTY: '10000', DELIV_QTY: '5000', DELIV_PER: '50', TURNOVER_LACS: '1020', NO_OF_TRADES: '400',
    ...overrides
  };
}

// 1. Valid row
{
  const r = classifyCmRow(baseCm(), DATE);
  assert.equal(r.status, 'VALID');
  assert.equal(r.row.SYMBOL, 'RELIANCE');
  assert.equal(r.row.CLOSE_PRICE, 104);
}

// 2. Malformed row (non-numeric close)
{
  const r = classifyCmRow(baseCm({ CLOSE_PRICE: 'not-a-number' }), DATE);
  assert.equal(r.status, 'MALFORMED');
  assert.ok(r.reasons.some(x => x.field === 'CLOSE_PRICE'));
}

// 3. Missing required field
{
  const r = classifyCmRow(baseCm({ OPEN_PRICE: '' }), DATE);
  assert.equal(r.status, 'MISSING');
  assert.ok(r.reasons.some(x => x.field === 'OPEN_PRICE'));
}

// 4. Invalid numeric field (garbage volume)
{
  const r = classifyCmRow(baseCm({ TTL_TRD_QNTY: 'NaN-ish' }), DATE);
  assert.equal(r.status, 'MALFORMED');
}

// 5. Impossible value (negative price)
{
  const r = classifyCmRow(baseCm({ LOW_PRICE: '-5' }), DATE);
  assert.equal(r.status, 'INVALID');
}

// 5b. Impossible value (high < low)
{
  const r = classifyCmRow(baseCm({ HIGH_PRICE: '90', LOW_PRICE: '99' }), DATE);
  assert.equal(r.status, 'INVALID');
  assert.ok(r.reasons.some(x => x.reason === 'high < low'));
}

// 5c. Impossible value (delivery qty exceeds traded qty)
{
  const r = classifyCmRow(baseCm({ TTL_TRD_QNTY: '1000', DELIV_QTY: '5000' }), DATE);
  assert.equal(r.status, 'INVALID');
}

// 5d. Impossible value (delivery percentage out of range)
{
  const r = classifyCmRow(baseCm({ DELIV_PER: '150' }), DATE);
  assert.equal(r.status, 'INVALID');
}

// 6. Invalid date (malformed expected trade date propagated to the row)
{
  const r = classifyCmRow(baseCm(), '01-09-2026');
  assert.equal(r.status, 'MALFORMED');
  assert.ok(r.reasons.some(x => x.field === 'trade_date'));
}

// 7. Duplicate row detection within a batch
{
  const rows = [baseCm(), baseCm()];
  const { valid, invalid, summary } = validateBatch(rows, classifyCmRow, DATE, row => row.SYMBOL);
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].status, 'DUPLICATE');
  assert.equal(summary.VALID, 1);
  assert.equal(summary.DUPLICATE, 1);
}

// 8. Partial dataset: valid rows are kept, invalid rows are excluded (not silently zeroed)
{
  const rows = [baseCm({ SYMBOL: 'AAA' }), baseCm({ SYMBOL: 'BBB', CLOSE_PRICE: 'bad' }), baseCm({ SYMBOL: 'CCC', LOW_PRICE: '-1' })];
  const { valid, invalid, summary } = validateBatch(rows, classifyCmRow, DATE, row => row.SYMBOL);
  assert.deepEqual(valid.map(r => r.SYMBOL), ['AAA']);
  assert.equal(invalid.length, 2);
  assert.equal(summary.VALID, 1);
  assert.equal(summary.MALFORMED, 1);
  assert.equal(summary.INVALID, 1);
}

// --- F&O rows ---
function baseFo(overrides = {}) {
  return { TckrSymb: 'RELIANCE', XpryDt: '2026-09-25', ClsPric: '2900', OpnIntrst: '50000', ChngInOpnIntrst: '4000', FinInstrmTp: 'STF', FinInstrmNm: 'RELIANCE-Sep2026-FUT', ...overrides };
}

// 9. Valid F&O row
{
  const r = classifyFoRow(baseFo(), DATE);
  assert.equal(r.status, 'VALID');
}

// 10. Missing exact-date OI (required field absent)
{
  const r = classifyFoRow(baseFo({ OpnIntrst: '' }), DATE);
  assert.equal(r.status, 'MISSING');
  assert.ok(r.reasons.some(x => x.field === 'OpnIntrst'));
}

// 11. Invalid expiry (before trade date)
{
  const r = classifyFoRow(baseFo({ XpryDt: '2026-08-01' }), DATE);
  assert.equal(r.status, 'INVALID');
  assert.ok(r.reasons.some(x => x.field === 'XpryDt'));
}

// 12. Malformed expiry date format
{
  const r = classifyFoRow(baseFo({ XpryDt: '25-09-2026' }), DATE);
  assert.equal(r.status, 'MALFORMED');
}

// 13. Duplicate F&O row (same symbol+expiry twice)
{
  const rows = [baseFo(), baseFo()];
  const { valid, invalid } = validateBatch(rows, classifyFoRow, DATE, row => `${row.TckrSymb}|${row.XpryDt}`);
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].status, 'DUPLICATE');
}

console.log('ingestValidation.test.js: PASS');
