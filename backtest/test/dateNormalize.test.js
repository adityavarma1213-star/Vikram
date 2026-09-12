const assert = require('node:assert/strict');
const { normalizeNseDateToIso } = require('../lib/dateNormalize');
const { confirmTradeDate } = require('../lib/validators');

// Required formats per remediation request:
assert.equal(normalizeNseDateToIso('2021-09-01'), '2021-09-01', 'ISO YYYY-MM-DD');
assert.equal(normalizeNseDateToIso('2021-09-01T00:00:00Z'), '2021-09-01', 'ISO with time component');
assert.equal(normalizeNseDateToIso('01-SEP-2021'), '2021-09-01', 'DD-MON-YYYY uppercase');
assert.equal(normalizeNseDateToIso('01-Sep-2021'), '2021-09-01', 'DD-MON-YYYY mixed case');
assert.equal(normalizeNseDateToIso('31-DEC-2025'), '2025-12-31', 'DD-MON-YYYY year-end');

// Additional formats actually referenced by this downloader's supported URL families:
assert.equal(normalizeNseDateToIso('01-09-2021'), '2021-09-01', 'DD-MM-YYYY numeric');
assert.equal(normalizeNseDateToIso('01/09/2021'), '2021-09-01', 'DD/MM/YYYY slash');

// Must NOT guess on garbage / genuinely unrecognized formats — fail closed.
assert.equal(normalizeNseDateToIso('not-a-date'), null);
assert.equal(normalizeNseDateToIso(''), null);
assert.equal(normalizeNseDateToIso(null), null);
assert.equal(normalizeNseDateToIso(undefined), null);
assert.equal(normalizeNseDateToIso('2021/09/01'), null, 'YYYY/MM/DD with slashes is intentionally NOT supported (ambiguous with DD/MM/YYYY) — must fail closed, not guess');

// Round-trip through confirmTradeDate with each format, proving the exact
// bug found in AUDIT.md §2/§4 (DD-MON-YYYY silently failing) is fixed:
assert.deepEqual(confirmTradeDate([{ DATE1: '01-SEP-2021' }], '2021-09-01', 'DATE1'), { ok: true }, 'REGRESSION CHECK: this exact case previously failed before the fix');
assert.deepEqual(confirmTradeDate([{ TradDt: '2021-09-01' }], '2021-09-01', 'TradDt'), { ok: true });
assert.deepEqual(confirmTradeDate([{ TradDt: '01-09-2021' }], '2021-09-01', 'TradDt'), { ok: true });
assert.deepEqual(confirmTradeDate([{ TradDt: '01/09/2021' }], '2021-09-01', 'TradDt'), { ok: true });

// A genuine mismatch (wrong day) must still be caught, not masked by the fix:
assert.equal(confirmTradeDate([{ DATE1: '02-SEP-2021' }], '2021-09-01', 'DATE1').ok, false);

// An unrecognized format must fail loudly and distinctly (not silently pass or silently misparse):
const unrecognizedResult = confirmTradeDate([{ TradDt: 'Sept First 2021' }], '2021-09-01', 'TradDt');
assert.equal(unrecognizedResult.ok, false);
assert.match(unrecognizedResult.reason, /UNRECOGNIZED_DATE_FORMAT/);

console.log('dateNormalize.test.js PASSED (ISO, DD-MON-YYYY, DD-MM-YYYY, DD/MM/YYYY, unrecognized-format handling, and the exact AUDIT.md regression case).');
