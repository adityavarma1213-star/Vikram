'use strict';
const assert = require('node:assert/strict');
const cf = require('../src/catchFrequency');

assert.equal(cf.isoWeekKey('2026-01-01'), '2026-W01');
assert.equal(cf.isoWeekKey('2025-12-29'), '2026-W01');
assert.equal(cf.isoWeekKey('2026-09-28'), '2026-W40');
assert.equal(cf.isoWeekKey('2027-01-03'), '2026-W53');

const recs = [
  { date: '2026-09-21', status: 'VERIFIED_CONFIRMATIONS', scanned: 100, starting: 10, confirmed: 2, confirmedSymbols: ['A', 'B'] },
  { date: '2026-09-22', status: 'VERIFIED_CONFIRMATIONS', scanned: 100, starting: 10, confirmed: 2, confirmedSymbols: ['B', 'C'] },
  { date: '2026-09-23', status: 'DATA_INSUFFICIENT' },
  { date: '2026-09-24', status: 'MISSING_SNAPSHOT' },
  { date: '2026-09-25', status: 'VERIFIED_ZERO_CONFIRMATIONS', scanned: 100, starting: 5, confirmed: 0, confirmedSymbols: [] },
  { date: '2026-09-28', status: 'VERIFIED_ZERO_CONFIRMATIONS', scanned: 100, starting: 5, confirmed: 0, confirmedSymbols: [] }
];
const out = cf.buildCatchFrequency(recs);
const day = d => out.daily.find(r => r.date === d);
assert.equal(day('2026-09-21').repeats, 'DATA_INSUFFICIENT', 'no previous verified session');
assert.equal(day('2026-09-22').repeats, 1);
assert.equal(day('2026-09-22').newDetections, 1);
assert.equal(day('2026-09-23').confirmed, null, 'unverified day is not counted as zero');
assert.equal(day('2026-09-23').confirmationRatePct, 'DATA_INSUFFICIENT');
assert.equal(day('2026-09-24').status, 'MISSING_SNAPSHOT');
assert.equal(day('2026-09-25').confirmed, 0, 'verified zero stays a real 0');
assert.equal(day('2026-09-25').repeats, 'DATA_INSUFFICIENT', 'gap breaks the repeat chain');

const w = out.weekly.find(r => r.period === '2026-W39');
assert.equal(w.sessions, 5);
assert.equal(w.verifiedSessions, 3);
assert.equal(w.confirmed, 4);
assert.equal(w.uniqueConfirmed, 3);
assert.equal(w.repeats, 1);
assert.match(w.dataQuality, /^PARTIAL/);
const w40 = out.weekly.find(r => r.period === '2026-W40');
assert.equal(w40.trend, 'DOWN');

const onlyBad = cf.buildCatchFrequency([{ date: '2026-09-04', status: 'DATA_INSUFFICIENT' }]);
assert.equal(onlyBad.weekly[0].confirmed, 'DATA_INSUFFICIENT');
assert.equal(onlyBad.monthly[0].avgConfirmedPerSession, 'DATA_INSUFFICIENT');

console.log('catchFrequency tests passed');
