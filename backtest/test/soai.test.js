const assert = require('node:assert/strict');
const { computeSOAI, soaiRawForWindow, dailyRangeProxy } = require('../lib/soai');
const { getSharedIndex } = require('../lib/symbolSeries');

// --- hand-computed known values (SYNTHETIC_TEST_ONLY) ---
const rows = [
  { close: 100, deliv_qty: 0 },
  { close: 101, deliv_qty: 500 }, // range 1, deliv 500
  { close: 100, deliv_qty: 700 }, // range 1, deliv 700
  { close: 102, deliv_qty: 300 }  // range 2, deliv 300
];
// dailyRangeProxy pairs: |101-100|=1, |100-101|=1, |102-100|=2 -> [1,1,2], sum=4
assert.deepEqual(dailyRangeProxy(rows), [1, 1, 2]);
// soaiRaw = sum(deliv_qty from index 1 on) / (sum(range)+1) = (500+700+300) / (4+1) = 1500/5 = 300
assert.equal(soaiRawForWindow(rows), 300);

// too little history -> DATA_INSUFFICIENT
const tiny = Array.from({ length: 10 }, (_, i) => ({ trade_date: `d${i}`, close: 100, deliv_qty: 100 }));
const tinyResult = computeSOAI(tiny, { windowSize: 10, baselineWindows: 5 });
assert.equal(tinyResult.status, 'DATA_INSUFFICIENT');

// Constructed series: baseline windows all have modest, consistent absorption; recent window has a much
// higher delivery-to-range ratio with near-zero price movement -> PRICE_SUPPRESSED_ABSORPTION_PATTERN
function buildRows(n, fn) {
  return Array.from({ length: n }, (_, i) => ({ trade_date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, ...fn(i) }));
}
const windowSize = 10, baselineWindows = 5;
const total = windowSize * (baselineWindows + 1);
const constructed = buildRows(total, (i) => {
  const inRecentWindow = i >= total - windowSize;
  if (inRecentWindow) {
    // alternate +/-0.05 so price barely moves, delivery is large
    return { close: 100 + (i % 2 === 0 ? 0.05 : -0.05), deliv_qty: 10000 };
  }
  // baseline: small oscillation with modest delivery that varies slightly by window
  // (a touch of variance so stdev isn't degenerate zero, but nowhere near the recent spike)
  const windowIndex = Math.floor(i / windowSize);
  return { close: 100 + (i % 2 === 0 ? 0.5 : -0.5), deliv_qty: 480 + windowIndex * 10 };
});
const suppressedResult = computeSOAI(constructed, { windowSize, baselineWindows });
assert.equal(suppressedResult.status, 'CALCULATED');
assert.ok(suppressedResult.soaiZ > 2, `expected soaiZ > 2, got ${suppressedResult.soaiZ}`);
assert.equal(suppressedResult.label, 'PRICE_SUPPRESSED_ABSORPTION_PATTERN');

// Normal range case: recent window looks statistically like the baseline -> NORMAL_RANGE
// (small per-window variation in delivery keeps the baseline stdev non-degenerate,
// and the recent window's value sits well within that same spread)
const normal = buildRows(total, (i) => {
  const windowIndex = Math.floor(i / windowSize);
  const wiggle = windowIndex % 2 === 0 ? -15 : 15; // deterministic +/- around 500
  return { close: 100 + (i % 2 === 0 ? 0.5 : -0.5), deliv_qty: 500 + wiggle };
});
const normalResult = computeSOAI(normal, { windowSize, baselineWindows });
assert.equal(normalResult.status, 'CALCULATED');
assert.equal(normalResult.label, 'NORMAL_RANGE');

// --- REAL DATA: run SOAI across real symbols, never fabricated ---
const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const symbols = index.symbols().slice(0, 25);
let calculated = 0, insufficient = 0;
const validLabels = new Set(['PRICE_SUPPRESSED_ABSORPTION_PATTERN', 'ELEVATED_ABSORPTION_WITH_PRICE_PARTICIPATION', 'BELOW_NORMAL_ABSORPTION', 'NORMAL_RANGE', 'INSUFFICIENT_SIGNAL']);
for (const sym of symbols) {
  const series = index.cmSeriesAsOf(sym, lastDate);
  const r = computeSOAI(series);
  if (r.status === 'CALCULATED') { calculated += 1; assert.ok(validLabels.has(r.label), `unexpected label ${r.label} for ${sym}`); }
  else insufficient += 1;
}
console.log(`REAL DATA SOAI scan over ${symbols.length} symbols as of ${lastDate}: ${calculated} calculated, ${insufficient} DATA_INSUFFICIENT`);
assert.ok(calculated > 0);

// ============================================================
// QC AUDIT PASS (13-Sep-2026) — additional edge-case coverage
// ============================================================

// Missing close values: a pair with a null close must be excluded, not fabricated as zero-range
const missingClose = [
  { close: 100, deliv_qty: 100 },
  { close: null, deliv_qty: 200 },  // this pair (vs prev) must be skipped entirely
  { close: 102, deliv_qty: 150 }
];
// Only pair index2 vs index1 is skippable (prev null); pair index1 vs index0 also skipped (curr null).
// Remaining: none of the 2 pairs are valid (both involve the null), so soaiRawForWindow should return null.
assert.equal(soaiRawForWindow(missingClose), null);

// Missing delivery values below the 20% threshold: still computable, using only present days
const mostlyPresentDeliv = [
  { close: 100, deliv_qty: 100 },
  { close: 101, deliv_qty: 200 },
  { close: 102, deliv_qty: 150 },
  { close: 103, deliv_qty: 180 },
  { close: 104, deliv_qty: 170 },
  { close: 105, deliv_qty: null } // 1 of 5 pairs missing delivery = 20%, at the boundary (not >20%)
];
assert.notEqual(soaiRawForWindow(mostlyPresentDeliv), null);

// Missing delivery values ABOVE the 20% threshold: must return null (insufficient), never silently zero-fill
const mostlyMissingDeliv = [
  { close: 100, deliv_qty: 100 },
  { close: 101, deliv_qty: null },
  { close: 102, deliv_qty: null },
  { close: 103, deliv_qty: null },
  { close: 104, deliv_qty: 170 }
];
assert.equal(soaiRawForWindow(mostlyMissingDeliv), null);

// Zero-movement window: price never changes -> totalRange = 0, must not throw or divide by zero
const zeroMovement = [
  { close: 100, deliv_qty: 500 },
  { close: 100, deliv_qty: 500 },
  { close: 100, deliv_qty: 500 }
];
const zeroMoveRaw = soaiRawForWindow(zeroMovement);
assert.equal(zeroMoveRaw, 1000 / 1); // totalDeliv=1000 (2 pairs), totalRange=0, +1 guard -> 1000

// Zero-variance baseline (all baseline windows produce the identical raw ratio): soaiZ must be null,
// label must be INSUFFICIENT_SIGNAL, and the reason text must mention the zero-variance baseline explicitly
const degenerateBaseline = buildRows(total, () => ({ close: 100, deliv_qty: 500 })); // perfectly flat, every window identical
const degenerateResult = computeSOAI(degenerateBaseline, { windowSize, baselineWindows });
assert.equal(degenerateResult.soaiZ, null);
assert.equal(degenerateResult.label, 'INSUFFICIENT_SIGNAL');
assert.match(degenerateResult.reason, /zero-variance baseline/);

// Reproducibility: identical input must always produce an identical result object (deep-equal, not just same status)
const reproInputA = buildRows(total, (i) => {
  const windowIndex = Math.floor(i / windowSize);
  return { close: 100 + (i % 3), deliv_qty: 400 + windowIndex * 7 };
});
const reproInputB = JSON.parse(JSON.stringify(reproInputA)); // independent copy, same values
const reproResultA = computeSOAI(reproInputA, { windowSize, baselineWindows });
const reproResultB = computeSOAI(reproInputB, { windowSize, baselineWindows });
assert.deepEqual(reproResultA, reproResultB);

// Insufficient history (already covered above by `tinyResult`, re-asserted here for the QC checklist's own record)
assert.equal(tinyResult.status, 'DATA_INSUFFICIENT');

console.log('SOAI QC edge cases passed: missing close, missing delivery (below/above threshold), zero-movement window, zero-variance baseline, reproducibility, insufficient history');
console.log('soai.test.js passed');
