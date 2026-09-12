'use strict';
// SYNTHETIC_TEST_ONLY fixtures.
const assert = require('node:assert/strict');
const { SignalEventStore, createEvent } = require('../lib/signalEventStore');

// 1. A frozen event genuinely cannot have T0/P0 mutated after creation.
{
  const event = createEvent({ symbol: 'AAA', T0: '2024-01-01', P0: 100, verdict: 'ACCUMULATION CONFIRMED' });
  assert.ok(Object.isFrozen(event));
  try { event.P0 = 999; } catch { /* strict mode throws; non-strict silently no-ops — either is fine */ }
  assert.equal(event.P0, 100, 'P0 must remain immutable no matter how the mutation attempt fails');
  try { event.T0 = '2099-01-01'; } catch { /* ignore */ }
  assert.equal(event.T0, '2024-01-01');
}

// 2. Missing required fields refuses to create a partial/fabricated event.
assert.throws(() => createEvent({ symbol: 'AAA', T0: '2024-01-01', verdict: 'X' })); // no P0
assert.throws(() => createEvent({ symbol: 'AAA', P0: 100, verdict: 'X' })); // no T0

// 3. The store is append-only: close() never mutates the original, it appends a new record.
{
  const store = new SignalEventStore();
  const id = store.append({ symbol: 'AAA', T0: '2024-01-01', P0: 100, verdict: 'ACCUMULATION CONFIRMED' });
  const original = store.get(id);
  assert.equal(original.eventStatus, 'OPEN');

  const closedId = store.close(id, '2024-01-10');
  assert.equal(store.get(id).eventStatus, 'OPEN', 'the original event object must be untouched');
  assert.equal(store.get(closedId).eventStatus, 'CLOSED');
  assert.equal(store.get(closedId).requalificationOf, id);
  assert.equal(store.all().length, 2, 'closing appends, never replaces');
}

// 4. Requalification after a broken streak creates a NEW event with a back-reference, not a
// mutation of the old one — full history remains reconstructable.
{
  const store = new SignalEventStore();
  const firstId = store.append({ symbol: 'BBB', T0: '2024-01-01', P0: 50, verdict: 'ACCUMULATION CONFIRMED' });
  store.close(firstId, '2024-01-05');
  const requalifiedId = store.append({ symbol: 'BBB', T0: '2024-03-01', P0: 55, verdict: 'ACCUMULATION CONFIRMED', requalificationOf: firstId });
  const history = store.bySymbol('BBB');
  assert.equal(history.length, 3); // original open, original closed, new requalified event
  assert.equal(store.get(requalifiedId).T0, '2024-03-01'); // a genuinely new detection, new T0/P0
  assert.equal(store.get(requalifiedId).requalificationOf, firstId);
  assert.equal(store.get(firstId).T0, '2024-01-01', 'the original T0 is never overwritten by the requalification');
}

console.log('signalEventStore.test.js: PASS (SYNTHETIC_TEST_ONLY fixtures)');
