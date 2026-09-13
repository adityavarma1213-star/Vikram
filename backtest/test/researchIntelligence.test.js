'use strict';
// SYNTHETIC_TEST_ONLY fixtures — validates aggregation math and the
// never-fabricate-on-insufficient-sample rule, not real market performance.
const assert = require('assert');
const { buildResearchIntelligence, confidenceTier, median, mean, CONFIDENCE_THRESHOLDS } = require('../lib/researchIntelligence');

function horizon(status, returnPct, mfePct, maePct, maxDrawdownPct) {
  if (status !== 'COMPUTED') return { status };
  return { status, returnPct, mfePct, maePct, maxDrawdownPct, benchmarkRelativeReturnPct: 'NOT_AVAILABLE — no benchmark series provided' };
}

// 1. median/mean helpers
assert.strictEqual(median([]), null);
assert.strictEqual(median([5]), 5);
assert.strictEqual(median([1, 3, 5]), 3);
assert.strictEqual(median([1, 2, 3, 4]), 2.5);
assert.strictEqual(mean([]), null);
assert.strictEqual(mean([2, 4, 6]), 4);
console.log('helpers: PASS');

// 2. confidence tiers follow the documented thresholds exactly
assert.strictEqual(confidenceTier(0), 'INSUFFICIENT_SAMPLE');
assert.strictEqual(confidenceTier(CONFIDENCE_THRESHOLDS.LOW - 1), 'INSUFFICIENT_SAMPLE');
assert.strictEqual(confidenceTier(CONFIDENCE_THRESHOLDS.LOW), 'LOW');
assert.strictEqual(confidenceTier(CONFIDENCE_THRESHOLDS.MEDIUM), 'MEDIUM');
assert.strictEqual(confidenceTier(CONFIDENCE_THRESHOLDS.HIGH), 'HIGH');
console.log('confidenceTier: PASS');

// 3. A symbol with zero ASM records never appears (nothing to report — not a fabricated zero-record entry)
{
  const result = buildResearchIntelligence({ records: [] });
  assert.strictEqual(result.symbolCount, 0);
  assert.deepStrictEqual(result.symbols, {});
}
console.log('empty ASM input: PASS');

// 4. A symbol with real events but INSUFFICIENT_FUTURE_DATA on every horizon reports
//    INSUFFICIENT_SAMPLE with every numeric field null — never a guessed number.
{
  const asm = {
    limitation: 'test-limitation',
    records: [
      { symbol: 'ABC', T0: '2026-01-05', P0: 100, horizons: { '1D': horizon('INSUFFICIENT_FUTURE_DATA'), '5D': horizon('INSUFFICIENT_FUTURE_DATA'), '20D': horizon('INSUFFICIENT_FUTURE_DATA'), '60D': horizon('INSUFFICIENT_FUTURE_DATA'), '120D': horizon('INSUFFICIENT_FUTURE_DATA') } }
    ]
  };
  const result = buildResearchIntelligence(asm);
  const abc = result.symbols.ABC;
  assert.ok(abc);
  assert.strictEqual(abc.totalHistoricalEvents, 1);
  for (const h of ['1D', '5D', '20D', '60D', '120D']) {
    assert.strictEqual(abc.horizons[h].status, 'INSUFFICIENT_SAMPLE');
    assert.strictEqual(abc.horizons[h].confidence, 'INSUFFICIENT_SAMPLE');
    assert.strictEqual(abc.horizons[h].successRatePct, null);
    assert.strictEqual(abc.horizons[h].medianReturnPct, null);
    assert.strictEqual(abc.horizons[h].avgReturnPct, null);
  }
  assert.strictEqual(result.limitation, 'test-limitation');
}
console.log('insufficient-future-data symbol: PASS');

// 5. Real aggregation math over several events, mixed win/loss, for one horizon.
{
  const records = [
    { symbol: 'XYZ', T0: '2026-01-05', P0: 100, horizons: { '20D': horizon('COMPUTED', 10, 12, -2, -3) } },
    { symbol: 'XYZ', T0: '2026-02-10', P0: 110, horizons: { '20D': horizon('COMPUTED', -4, 3, -6, -6) } },
    { symbol: 'XYZ', T0: '2026-03-15', P0: 90, horizons: { '20D': horizon('COMPUTED', 6, 8, -1, -2) } },
    { symbol: 'XYZ', T0: '2026-04-20', P0: 95, horizons: { '20D': horizon('INSUFFICIENT_FUTURE_DATA') } }
  ];
  const result = buildResearchIntelligence({ records });
  const xyz = result.symbols.XYZ;
  assert.strictEqual(xyz.totalHistoricalEvents, 4); // sample includes the not-yet-resolved event
  const h20 = xyz.horizons['20D'];
  assert.strictEqual(h20.status, 'COMPUTED');
  assert.strictEqual(h20.sampleCount, 4);
  assert.strictEqual(h20.computedCount, 3); // only the 3 resolved events count toward the rate
  assert.strictEqual(h20.successRatePct, Math.round((2 / 3) * 10000) / 100); // 2 of 3 positive
  assert.strictEqual(h20.medianReturnPct, 6); // median of [10, -4, 6] -> 6
  assert.strictEqual(h20.avgReturnPct, mean([10, -4, 6]));
  assert.strictEqual(h20.confidence, 'INSUFFICIENT_SAMPLE'); // 3 computed < LOW threshold (5)
  assert.strictEqual(xyz.firstSignalDate, '2026-01-05');
  assert.strictEqual(xyz.lastSignalDate, '2026-04-20');
}
console.log('mixed win/loss aggregation: PASS');

// 6. Two different symbols never mix records.
{
  const records = [
    { symbol: 'AAA', T0: '2026-01-01', P0: 50, horizons: { '1D': horizon('COMPUTED', 5, 5, 0, 0) } },
    { symbol: 'BBB', T0: '2026-01-01', P0: 50, horizons: { '1D': horizon('COMPUTED', -5, 0, -5, -5) } }
  ];
  const result = buildResearchIntelligence({ records });
  assert.strictEqual(result.symbolCount, 2);
  assert.strictEqual(result.symbols.AAA.horizons['1D'].avgReturnPct, 5);
  assert.strictEqual(result.symbols.BBB.horizons['1D'].avgReturnPct, -5);
}
console.log('symbol isolation: PASS');

// 7. Malformed/missing records are skipped, not thrown on.
{
  const result = buildResearchIntelligence({ records: [null, {}, { symbol: '', horizons: {} }] });
  assert.strictEqual(result.symbolCount, 0);
}
console.log('malformed input tolerance: PASS');

console.log('researchIntelligence.test.js: PASS (SYNTHETIC_TEST_ONLY fixtures — validates aggregation math, not real performance)');
