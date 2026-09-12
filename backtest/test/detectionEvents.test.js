// SYNTHETIC_TEST_ONLY — verifies lib/detectionEvents.js grouping logic
// against a hand-built verdict stream. No engine, no NSE data involved;
// pure state-machine testing.
const assert = require('node:assert/strict');
const { buildDetectionEvents } = require('../lib/detectionEvents');

const CONFIRMED = 'ACCUMULATION CONFIRMED';
const NOT_CONFIRMED = 'NO SIGNAL';

function day(date, close, verdict) { return { date, close, verdict }; }

// Scenario: 3 confirmed days (New -> Active -> Active), then 2 not-confirmed
// days (event ends), then 2 more confirmed days (a brand NEW event, not a
// continuation of the first).
const stream = [
  day('2026-01-01', 100, NOT_CONFIRMED),
  day('2026-01-02', 101, CONFIRMED),   // event 1, day 1 -> New
  day('2026-01-05', 103, CONFIRMED),   // event 1, day 2 -> Active
  day('2026-01-06', 105, CONFIRMED),   // event 1, day 3 -> Active, latest
  day('2026-01-07', 104, NOT_CONFIRMED), // event 1 ends here
  day('2026-01-08', 102, NOT_CONFIRMED),
  day('2026-01-09', 108, CONFIRMED),   // event 2, day 1 -> New (requalification, NOT a continuation)
  day('2026-01-12', 110, CONFIRMED)    // event 2, day 2 -> Active, still running at end of series
];

const events = buildDetectionEvents('FAKE', stream);

assert.equal(events.length, 2, 'expected exactly 2 distinct events');

const [event1, event2] = events;

// --- Event 1 ---
assert.equal(event1.firstDetectionDate, '2026-01-02');
assert.equal(event1.firstDetectionPrice, 101, 'first detection price must be the price ON the first confirmed day, never a later or current price');
assert.equal(event1.latestDetectionDate, '2026-01-06');
assert.equal(event1.latestDetectionPrice, 105);
assert.equal(event1.tradingSessionStreak, 3);
assert.equal(event1.status, 'Active', 'a 3-day streak should be Active, not New');
assert.equal(event1.endedDate, '2026-01-07', 'event should record exactly the day the streak broke');

// --- Event 2: proves reset-after-failed-qualification + requalification starts a NEW event ---
assert.equal(event2.firstDetectionDate, '2026-01-09', 'requalification must start a brand new event, not resume event 1');
assert.equal(event2.firstDetectionPrice, 108);
assert.equal(event2.tradingSessionStreak, 2);
assert.equal(event2.latestDetectionDate, '2026-01-12');
assert.equal(event2.latestDetectionPrice, 110);
assert.equal(event2.endedDate, null, 'event 2 is still running at the end of the series, so it must have no endedDate');
assert.equal(event2.eventIndex, 1, 'events must be indexed in chronological order');

// --- Edge case: a single-day confirmation (never extends) must be New, streak 1 ---
const singleDayStream = [day('2026-02-01', 50, CONFIRMED), day('2026-02-02', 51, NOT_CONFIRMED)];
const singleDayEvents = buildDetectionEvents('FAKE2', singleDayStream);
assert.equal(singleDayEvents.length, 1);
assert.equal(singleDayEvents[0].status, 'New', 'a 1-day streak must be labeled New, not Active');
assert.equal(singleDayEvents[0].tradingSessionStreak, 1);

// --- Edge case: never confirmed at all -> zero events ---
assert.deepEqual(buildDetectionEvents('FAKE3', [day('2026-03-01', 10, NOT_CONFIRMED)]), []);

console.log('detectionEvents.test.js PASSED (New/Active/streak/reset/requalification-as-new-event, SYNTHETIC_TEST_ONLY).');
