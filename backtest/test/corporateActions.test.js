// SYNTHETIC_TEST_ONLY for the discontinuity heuristic (hand-built price
// series). The former NSE corporate-actions fetch function was removed.
const assert = require('node:assert/strict');
const { detectPriceDiscontinuities, assessCoverage } = require('../lib/corporateActions');

function row(date, close) { return { trade_date: date, close }; }

// --- Discontinuity heuristic ---
const history = [
  row('2026-01-01', 100),
  row('2026-01-02', 101), // +1%, normal
  row('2026-01-05', 50),  // -50.5%, e.g. a 2:1 split -> should be flagged
  row('2026-01-06', 52),  // +4%, normal
  row('2026-01-07', 20)   // -61.5%, e.g. a bonus/merger -> should be flagged
];
const flagged = detectPriceDiscontinuities(history, 20);
assert.equal(flagged.length, 2, 'expected exactly 2 discontinuities at the default 20% threshold');
assert.equal(flagged[0].date, '2026-01-05');
assert.equal(flagged[1].date, '2026-01-07');
assert.ok(flagged.every(f => f.reason === 'SUSPECTED_CORPORATE_ACTION'));
assert.ok(flagged.every(f => f.note.includes('does NOT distinguish')), 'must be explicit this is a heuristic flag, not a confirmed corporate action');

// A quieter series must produce zero flags.
const quietHistory = [row('2026-01-01', 100), row('2026-01-02', 102), row('2026-01-05', 99)];
assert.deepEqual(detectPriceDiscontinuities(quietHistory, 20), []);

// Threshold is respected: an 18% move should NOT flag at a 20% threshold.
const borderline = [row('2026-01-01', 100), row('2026-01-02', 118)];
assert.deepEqual(detectPriceDiscontinuities(borderline, 20), []);

// --- Coverage assessment: never defaults to "available" ---
assert.equal(assessCoverage(null).status, 'CORPORATE_ACTION_DATA_REQUIRED', 'no fetch attempted at all must NOT be silently treated as available');

const failedFetch = { ok: false, status: 403, url: 'https://example.test' };
const failedAssessment = assessCoverage(failedFetch);
assert.equal(failedAssessment.status, 'CORPORATE_ACTION_DATA_REQUIRED');
assert.match(failedAssessment.reason, /heuristic-only/);

const successFetch = { ok: true, records: [{ symbol: 'X', purpose: 'Bonus 1:1' }] };
const successAssessment = assessCoverage(successFetch);
assert.equal(successAssessment.status, 'DATA_AVAILABLE');
assert.equal(successAssessment.recordCount, 1);

console.log('corporateActions.test.js PASSED (discontinuity heuristic + honest coverage-state logic, SYNTHETIC_TEST_ONLY; no network code exists in this module).');
