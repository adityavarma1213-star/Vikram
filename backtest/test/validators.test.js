// SYNTHETIC_TEST_ONLY — hand-crafted fixtures to test validator LOGIC.
// None of these numbers are real NSE data and must never be reported as such.
const assert = require('node:assert/strict');
const { sha256, requireColumns, validateCmRow, validateFoRow, findDuplicates, confirmTradeDate } = require('../lib/validators');

// sha256 determinism
assert.equal(sha256(Buffer.from('hello')), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

// schema / format-change detection
assert.throws(() => requireColumns([{ A: 1 }], 'test', ['A', 'B']), /schema mismatch/);
requireColumns([{ A: 1, B: 2 }], 'test', ['A', 'B']); // should not throw

// the delivery_qty > volume invariant (the exact check the audit trail flagged as missing elsewhere)
assert.deepEqual(validateCmRow({ symbol: 'X', trade_date: '2026-01-01', volume: 100, deliv_qty: 150, close: 10, deliv_per: 50 }).some(e => e.includes('exceeds volume')), true);
assert.deepEqual(validateCmRow({ symbol: 'X', trade_date: '2026-01-01', volume: 100, deliv_qty: 50, close: 10, deliv_per: 50 }), []);
assert.deepEqual(validateCmRow({ symbol: '', trade_date: '2026-01-01', volume: 100, deliv_qty: 50, close: 10, deliv_per: 50 }).includes('missing symbol'), true);

// F&O row validation
assert.deepEqual(validateFoRow({ symbol: 'X', trade_date: '2026-01-01', expiry: '2026-01-30', oi: 100 }), []);
assert.deepEqual(validateFoRow({ symbol: 'X', trade_date: '2026-01-01', expiry: null, oi: 100 }).includes('missing expiry'), true);

// duplicate detection
assert.deepEqual(findDuplicates([{ symbol: 'A', trade_date: '2026-01-01' }, { symbol: 'A', trade_date: '2026-01-01' }, { symbol: 'B', trade_date: '2026-01-01' }], r => `${r.symbol}|${r.trade_date}`), ['A|2026-01-01']);

// trade-date cross-check (catches NSE serving a stale/wrong-day file)
assert.deepEqual(confirmTradeDate([{ TradDt: '2026-01-01' }], '2026-01-01', 'TradDt'), { ok: true });
assert.equal(confirmTradeDate([{ TradDt: '2026-01-02' }], '2026-01-01', 'TradDt').ok, false);
assert.equal(confirmTradeDate([{ TradDt: '2026-01-01' }, { TradDt: '2026-01-02' }], '2026-01-01', 'TradDt').ok, false);

console.log('validators.test.js passed (SYNTHETIC_TEST_ONLY fixtures)');
