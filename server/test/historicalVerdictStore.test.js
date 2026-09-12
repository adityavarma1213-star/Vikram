'use strict';
const assert = require('node:assert/strict');
const { HistoricalVerdictStore } = require('../src/historicalVerdictStore');

// 1. Basic append + exact-date lookup.
{
  const store = new HistoricalVerdictStore();
  store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'ACCUMULATION CONFIRMED', score: 85 });
  const record = store.verdictOn('AAA', '2024-01-01');
  assert.equal(record.verdict, 'ACCUMULATION CONFIRMED');
  assert.equal(record.score, 85);
  assert.equal(store.verdictOn('AAA', '2024-01-02'), null, 'no interpolation to a nearby date');
}

// 2. Append-only: a duplicate (symbol, date, engineVersion, configVersion) is rejected, not
// silently overwritten.
{
  const store = new HistoricalVerdictStore();
  store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'ACCUMULATION CONFIRMED' });
  assert.throws(() => store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'DISTRIBUTION' }), /append-only/);
  assert.equal(store.verdictOn('AAA', '2024-01-01').verdict, 'ACCUMULATION CONFIRMED', 'the original record must survive the rejected duplicate write');
}

// 3. A genuine engine/config version change is a NEW record, not a duplicate — version
// traceability is preserved, and both records coexist.
{
  const store = new HistoricalVerdictStore();
  store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'ACCUMULATION CONFIRMED' });
  store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v2', configVersion: 'v1', verdict: 'ACCUMULATION STARTING' });
  assert.equal(store.history('AAA').length, 2);
}

// 4. Full reconstruction in chronological order.
{
  const store = new HistoricalVerdictStore();
  store.append({ symbol: 'BBB', tradeDate: '2024-03-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'DISTRIBUTION' });
  store.append({ symbol: 'BBB', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'ACCUMULATION CONFIRMED' });
  const history = store.history('BBB');
  assert.deepEqual(history.map(r => r.tradeDate), ['2024-01-01', '2024-03-01']);
}

// 5. Records are frozen — cannot be mutated after the fact.
{
  const store = new HistoricalVerdictStore();
  store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1', verdict: 'ACCUMULATION CONFIRMED', score: 85 });
  const record = store.verdictOn('AAA', '2024-01-01');
  assert.ok(Object.isFrozen(record));
  try { record.score = 999; } catch { /* ignore */ }
  assert.equal(record.score, 85);
}

// 6. Missing required fields refuses to create a partial/fabricated record.
{
  const store = new HistoricalVerdictStore();
  assert.throws(() => store.append({ symbol: 'AAA', tradeDate: '2024-01-01', engineVersion: 'v1', configVersion: 'v1' })); // no verdict
}

console.log('historicalVerdictStore.test.js: PASS');
