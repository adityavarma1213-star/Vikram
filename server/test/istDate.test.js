const assert = require('node:assert/strict');
const { toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact } = require('../src/istDate');

assert.equal(formatYmd(toIstCalendarDate(new Date('2026-09-05T00:00:00Z'))), '2026-09-05');
assert.equal(formatYmd(toIstCalendarDate(new Date('2026-09-04T23:59:59Z'))), '2026-09-05');
assert.equal(formatYmd(toIstCalendarDate(new Date('2026-09-04T18:29:59Z'))), '2026-09-04');
assert.equal(formatYmd(addDays(new Date('2026-09-05T00:00:00Z'), -1)), '2026-09-04');
assert.equal(formatDdMmYyyy(new Date('2026-09-05T00:00:00Z')), '05092026');
assert.equal(formatYmdCompact(new Date('2026-09-05T00:00:00Z')), '20260905');

console.log('IST date tests passed');
