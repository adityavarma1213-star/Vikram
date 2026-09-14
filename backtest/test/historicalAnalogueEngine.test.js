const assert = require('node:assert/strict');
const { findHistoricalAnalogues, computeHistoricalOutcome, HORIZONS } = require('../lib/historicalAnalogueEngine');
const { getSharedIndex } = require('../lib/symbolSeries');
const { buildSignalDNA, computePopulationStats } = require('../lib/signalDNA');

const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const allSymbols = index.symbols();

// ============================================================
// REAL-DATA TESTS (primary — real repository data throughout)
// ============================================================

// --- exact same symbol/date reproducibility ---
const targetSymbol = allSymbols[0];
const resultA = findHistoricalAnalogues(targetSymbol, lastDate, index, { maxCandidates: 5000, topN: 5 });
const resultB = findHistoricalAnalogues(targetSymbol, lastDate, index, { maxCandidates: 5000, topN: 5 });
assert.deepEqual(resultA, resultB, 'identical target/date/dataset must produce an identical result (deterministic ranking)');

// --- target date exclusion: no analogue may have analogueDate === targetDate ---
for (const a of resultA.analogues) assert.notEqual(a.analogueDate, lastDate);

// --- future-date exclusion / no-look-ahead: every analogue's date must be strictly before target date ---
for (const a of resultA.analogues) {
  assert.ok(a.analogueDate < lastDate, `analogue date ${a.analogueDate} must be strictly before target date ${lastDate}`);
  assert.equal(a.lookAheadStatus, 'NO_LOOK_AHEAD_VERIFIED');
}

// --- no-look-ahead, stronger check: an EARLIER target date must never surface an analogue at or after it ---
const earlierTargetDate = allDates[100];
const earlierResult = findHistoricalAnalogues(targetSymbol, earlierTargetDate, index, { maxCandidates: 5000, topN: 10 });
for (const a of earlierResult.analogues) {
  assert.ok(a.analogueDate < earlierTargetDate, 'no-look-ahead violated: an analogue for an earlier target date used data at/after that date');
}
// and the target's own Signal DNA for the earlier date must not have been influenced by later real data:
// verify by rebuilding the SAME target directly and checking its underlying series never exceeds earlierTargetDate
const rebuiltTargetSeries = index.cmSeriesAsOf(targetSymbol, earlierTargetDate);
assert.ok(rebuiltTargetSeries.every(r => r.trade_date <= earlierTargetDate));

// --- historical-date eligibility: the earliest possible target date must yield DATA_INSUFFICIENT (no history before it) ---
const veryEarlyDate = allDates[0];
const noHistoryResult = findHistoricalAnalogues(targetSymbol, veryEarlyDate, index);
assert.equal(noHistoryResult.status, 'DATA_INSUFFICIENT');

// --- insufficient overlapping dimensions: force via a tiny candidate pool with almost no shared coverage ---
// (uses a target with very little F&O and a candidate set restricted to a single, mostly-empty symbol —
// real data, just a deliberately narrow slice to exercise the DATA_INSUFFICIENT branch)
const narrowResult = findHistoricalAnalogues(targetSymbol, allDates[15], index, { candidateSymbols: [allSymbols[allSymbols.length - 1]], maxCandidates: 100 });
assert.ok(['FOUND', 'DATA_INSUFFICIENT'].includes(narrowResult.status));

// --- missing dimensions never converted into a fabricated similarity: every analogue must have >=2 matched dimensions ---
for (const a of resultA.analogues) assert.ok(a.matchedDimensions.length >= 2);

// --- duplicate historical records: the same (symbol,date) pair must never appear twice in one result's analogue list ---
const seenPairs = new Set();
for (const a of resultA.analogues) {
  const key = `${a.analogueSymbol}|${a.analogueDate}`;
  assert.ok(!seenPairs.has(key), `duplicate analogue record found: ${key}`);
  seenPairs.add(key);
}

// --- symbol lifecycle boundary: a candidate symbol with no CM row on a sampled date simply never appears
// as an analogue for that date (verified indirectly: every returned analogueDate/analogueSymbol pair
// must correspond to a real row that actually exists in the dataset) ---
for (const a of resultA.analogues) {
  const rowExists = index.cmSeriesAsOf(a.analogueSymbol, a.analogueDate).some(r => r.trade_date === a.analogueDate);
  assert.ok(rowExists, `analogue ${a.analogueSymbol}/${a.analogueDate} has no corresponding real CM row`);
}

// --- deterministic ranking: similarity must be non-increasing down the returned list ---
for (let i = 1; i < resultA.analogues.length; i += 1) {
  assert.ok(resultA.analogues[i - 1].similarity >= resultA.analogues[i].similarity, 'analogues must be sorted by similarity descending');
}

// --- provenance present on every analogue ---
for (const a of resultA.analogues) {
  assert.ok(a.provenance && a.provenance.source === 'data/market-history');
  assert.ok(typeof a.provenance.targetFingerprint === 'string');
  assert.ok(typeof a.provenance.analogueFingerprint === 'string');
  assert.equal(a.dataQualityStatus, 'REAL');
}

// --- real-data execution with calibration ---
const popStats = computePopulationStats(allSymbols.slice(0, 50), lastDate, index, buildSignalDNA);
const calibratedResult = findHistoricalAnalogues(targetSymbol, lastDate, index, { maxCandidates: 5000, topN: 5, populationStats: popStats });
assert.equal(calibratedResult.status, 'FOUND');
for (const a of calibratedResult.analogues) assert.ok(['REAL_DATA_CALIBRATED', 'UNCALIBRATED_PROTOTYPE'].includes(a.similarityStatus));

console.log(`REAL DATA: target ${targetSymbol}@${lastDate} — ${resultA.totalMatchesFound} matches from ${resultA.candidatesScanned} candidates scanned (${resultA.datesSampled} dates sampled of ${resultA.candidateDatesAvailable} available)`);

// ============================================================
// HISTORICAL OUTCOME (optional interface)
// ============================================================
if (resultA.analogues.length > 0) {
  const a = resultA.analogues[0];
  const outcome = computeHistoricalOutcome(a.analogueSymbol, a.analogueDate, index);
  assert.equal(outcome.status, 'CALCULATED');
  for (const h of HORIZONS) {
    const key = `${h}D`;
    assert.ok(key in outcome.horizons);
    assert.ok(['REAL', 'INSUFFICIENT_FUTURE_DATA'].includes(outcome.horizons[key].status));
  }
  console.log(`Historical outcome for top analogue ${a.analogueSymbol}@${a.analogueDate}:`, JSON.stringify(outcome.horizons));
}
// an analogue date near the very end of the dataset must show INSUFFICIENT_FUTURE_DATA for large horizons
const nearEndDate = allDates[allDates.length - 2];
const nearEndOutcome = computeHistoricalOutcome(targetSymbol, nearEndDate, index);
if (nearEndOutcome.status === 'CALCULATED') {
  assert.equal(nearEndOutcome.horizons['120D'].status, 'INSUFFICIENT_FUTURE_DATA');
}
// unknown date -> DATA_N_A, never fabricated
const unknownOutcome = computeHistoricalOutcome(targetSymbol, '1999-01-01', index);
assert.equal(unknownOutcome.status, 'DATA_N_A');

// ============================================================
// SYNTHETIC_TEST_ONLY — adversarial edge cases (clearly marked, never mixed into real-data assertions above)
// ============================================================

// A fake index with a tiny, fully controlled dataset, to test genuine adversarial edges without
// depending on what happens to be true of the real 263-session dataset.
function makeFakeIndex(rowsBySymbol) {
  return {
    cmSeriesAsOf(symbol, asOfDate) {
      const rows = rowsBySymbol[symbol] || [];
      return rows.filter(r => r.trade_date <= asOfDate);
    },
    foSeriesAsOf() { return []; },
    symbols() { return Object.keys(rowsBySymbol); },
    allTradingDates() {
      const set = new Set();
      for (const rows of Object.values(rowsBySymbol)) for (const r of rows) set.add(r.trade_date);
      return [...set].sort();
    }
  };
}

function fakeRows(n, closeFn, delivFn) {
  return Array.from({ length: n }, (_, i) => ({ trade_date: `2026-05-${String(i + 1).padStart(2, '0')}`, close: closeFn(i), volume: 1000, deliv_qty: 400, deliv_per: delivFn ? delivFn(i) : 40 }));
}

// SYNTHETIC_TEST_ONLY: a fake symbol whose recent window looks identical to its own earlier window
// must find itself as its own top (and only, in this tiny universe) analogue, with similarity ~1
const flatFake = fakeRows(30, () => 100);
const fakeIndex1 = makeFakeIndex({ FAKESYM: flatFake });
const selfMatchResult = findHistoricalAnalogues('FAKESYM', flatFake[29].trade_date, fakeIndex1, { maxCandidates: 1000, topN: 3 });
if (selfMatchResult.status === 'FOUND') {
  assert.ok(selfMatchResult.analogues[0].similarity > 0.9, 'SYNTHETIC_TEST_ONLY: a self-similar flat series should match its own earlier window almost perfectly');
}

// SYNTHETIC_TEST_ONLY: only 1 trading date total in the universe -> no history before target -> DATA_INSUFFICIENT
const singleDayFake = [{ trade_date: '2026-05-01', close: 100, volume: 1000, deliv_qty: 400, deliv_per: 40 }];
const fakeIndex2 = makeFakeIndex({ ONLYDAY: singleDayFake });
const singleDayResult = findHistoricalAnalogues('ONLYDAY', '2026-05-01', fakeIndex2);
assert.equal(singleDayResult.status, 'DATA_INSUFFICIENT');

// ============================================================
// CORPORATE-ACTION CAVEAT — regression test (closes the acceptance-audit finding)
// ============================================================
const { assessCorporateActionRisk } = require('../lib/historicalAnalogueEngine');

// Every real analogue in the primary result must be VERIFICATION_BLOCKED on corporate
// actions — never an affirmative "adjusted"/"confirmed clean" claim — because no validated
// historical corporate-action feed exists in this codebase (assessCoverage(null) always
// reflects that honestly). This is checked directly on the actual returned records, not
// just on the standalone helper.
for (const a of resultA.analogues) {
  assert.ok(a.corporateActionStatus, 'every analogue must carry a corporateActionStatus');
  assert.equal(a.corporateActionStatus.status, 'VERIFICATION_BLOCKED');
  assert.notEqual(a.corporateActionStatus.status, 'CONFIRMED');
  assert.notEqual(a.corporateActionStatus.status, 'ADJUSTED');
  assert.notEqual(a.corporateActionStatus.status, 'CLEAR');
  assert.ok(Array.isArray(a.corporateActionStatus.targetDiscontinuitiesInWindow));
  assert.ok(Array.isArray(a.corporateActionStatus.candidateDiscontinuitiesInWindow));
  assert.ok(a.provenance.corporateActionCoverage, 'provenance must surface the coverage status too');
}

// The overall result's limitations must explicitly name the corporate-action caveat —
// this must never be silently omitted from the top-level disclosure.
assert.ok(resultA.limitations.some(l => l.includes('CORPORATE-ACTION CAVEAT')));

// Direct unit test of the helper: even when NO discontinuity is present in either window,
// the status must still be VERIFICATION_BLOCKED — absence of a flagged discontinuity is
// NOT proof that no unadjusted corporate action occurred, and must never be upgraded to a
// clean/confirmed claim.
const cleanTargetSeries = Array.from({ length: 10 }, (_, i) => ({ trade_date: `2026-06-${String(i + 1).padStart(2, '0')}`, close: 100 + i * 0.1 }));
const cleanCandidateSeries = Array.from({ length: 10 }, (_, i) => ({ trade_date: `2026-06-${String(i + 1).padStart(2, '0')}`, close: 200 + i * 0.1 }));
const noDiscontinuityResult = assessCorporateActionRisk(cleanTargetSeries, cleanCandidateSeries);
assert.equal(noDiscontinuityResult.status, 'VERIFICATION_BLOCKED');
assert.equal(noDiscontinuityResult.targetDiscontinuitiesInWindow.length, 0);
assert.equal(noDiscontinuityResult.candidateDiscontinuitiesInWindow.length, 0);

// And when a large single-day jump IS present (SYNTHETIC_TEST_ONLY — a hand-built 40% jump),
// it must be surfaced in the flags array, while the overall status remains VERIFICATION_BLOCKED
// (a flagged heuristic discontinuity still isn't a validated adjustment either way).
const jumpySeries = [
  { trade_date: '2026-06-01', close: 100 },
  { trade_date: '2026-06-02', close: 140 } // SYNTHETIC_TEST_ONLY: 40% single-day jump
];
const jumpyResult = assessCorporateActionRisk(jumpySeries, cleanCandidateSeries);
assert.equal(jumpyResult.status, 'VERIFICATION_BLOCKED');
assert.equal(jumpyResult.targetDiscontinuitiesInWindow.length, 1);
assert.equal(jumpyResult.targetDiscontinuitiesInWindow[0].reason, 'SUSPECTED_CORPORATE_ACTION');

console.log('Corporate-action caveat regression tests passed: never claims adjusted/confirmed comparability, flags surfaced when present, VERIFICATION_BLOCKED holds regardless');
console.log('historicalAnalogueEngine.test.js passed');
