'use strict';
const assert = require('node:assert/strict');
const { currentLookbackLabel, historicalSnapshotLabel, PERIOD_SESSIONS } = require('../src/timeframeLabels');

// 1. Current-lookback labels never say "ago" or "historical" or "as of" — the exact confusion
// this guard exists to prevent.
for (const period of Object.keys(PERIOD_SESSIONS)) {
  const label = currentLookbackLabel(period);
  assert.ok(label, `expected a label for ${period}`);
  assert.ok(!/ago|historical|as of/i.test(label), `current-lookback label for ${period} must not sound historical: "${label}"`);
  assert.ok(/trailing \d+ trading session/.test(label));
}

// 2. '1Y' means 252 trailing sessions, not "one calendar year ago" — matches the real
// PERIOD_ROWS semantics in server/src/index.js.
assert.equal(currentLookbackLabel('1Y'), 'Current verdict \u2014 trailing 252 trading sessions');

// 3. A historical-snapshot label always carries an explicit date and never overlaps in wording
// with the current-lookback shape.
{
  const label = historicalSnapshotLabel('2024-06-15');
  assert.ok(label.includes('2024-06-15'));
  assert.ok(!/trailing \d+ trading session/.test(label));
}

// 4. An unknown period returns null rather than a guessed label.
assert.equal(currentLookbackLabel('5Y'), null);
assert.equal(historicalSnapshotLabel(null), null);

console.log('timeframeLabels.test.js: PASS');
