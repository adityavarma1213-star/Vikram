// SYNTHETIC_TEST_ONLY for the discontinuity heuristic (hand-built price
// series). The fetchCorporateActionsRaw() network path is exercised
// separately in this test with a mocked fetchImpl — this file does not
// contact real NSE.
const assert = require('node:assert/strict');
const { detectPriceDiscontinuities, fetchCorporateActionsRaw, assessCoverage } = require('../lib/corporateActions');

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

// --- Real fetch attempt, mocked network (proves the function honestly
// reports failure rather than fabricating corporate-action records when
// the real NSE endpoint cannot be reached) ---
(async () => {
  const blockedFetchImpl = async () => ({ ok: false, status: 403, headers: { get: (h) => (h === 'x-deny-reason' ? 'host_not_allowed' : null) } });
  const blockedResult = await fetchCorporateActionsRaw('01-01-2026', '31-01-2026', { fetchImpl: blockedFetchImpl });
  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.coverage, 'CORPORATE_ACTION_DATA_REQUIRED');
  assert.equal(blockedResult.denyReason, 'host_not_allowed');

  const workingFetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ symbol: 'X', purpose: 'Bonus 1:1' }] }) });
  const workingResult = await fetchCorporateActionsRaw('01-01-2026', '31-01-2026', { fetchImpl: workingFetchImpl });
  assert.equal(workingResult.ok, true);
  assert.equal(workingResult.records.length, 1);

  console.log('corporateActions.test.js PASSED (discontinuity heuristic + honest coverage-state logic, SYNTHETIC_TEST_ONLY / mocked network).');
})().catch(err => { console.error('corporateActions.test.js FAILED:', err); process.exit(1); });
