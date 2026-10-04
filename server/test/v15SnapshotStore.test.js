'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/v15SnapshotStore');

const res = (symbol, verdict, deliveryPct = 50) => ({ symbol, verdict, score: verdict === 'ACCUMULATION CONFIRMED' ? 80 : 40, metrics: { close: 10, volumeRatio: 1.5, obv: 100, obvTrend: 1, deliveryPct, deliveryQty: deliveryPct ? 5 : 0, futuresOi: 10, changeOi: 1, priceChangePct: 1, oiExactDate: true }, components: [], confirmation: { gateFailures: verdict === 'ACCUMULATION CONFIRMED' ? [] : ['volume ratio is below 1.2x'] } });
const scanner = (asOf, generatedAt, results, dataStatus = 'EOD VERIFIED') => ({ asOf, generatedAt, results, dataStatus, historyDays: 20 });
const opts = { engineSha256: 'e'.repeat(64), configSha256: 'c'.repeat(64), datasetVersion: 'd' };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15snap-'));

const s1 = store.buildSnapshot(scanner('2026-09-25', '2026-09-27T01:00:00Z', [res('A', 'ACCUMULATION CONFIRMED'), res('B', 'NO SIGNAL')]), opts);
assert.equal(s1.classification, 'VERIFIED_CONFIRMATIONS');
assert.deepEqual(s1.confirmedSymbols, ['A']);
assert.equal(s1.confirmed[0].score, 80);
assert.equal(s1.gateFailureSummary['volume ratio is below 1.2x'], 1);
assert.ok(store.verifySnapshot(s1));

const zero = store.buildSnapshot(scanner('2026-09-26', '2026-09-27T02:00:00Z', [res('A', 'NO SIGNAL'), res('B', 'NO SIGNAL')]), opts);
assert.equal(zero.classification, 'VERIFIED_ZERO_CONFIRMATIONS');

// All-zero delivery must never look like a verified zero-confirmation day.
const bad = store.buildSnapshot(scanner('2026-09-04', '2026-09-07T01:00:00Z', [res('A', 'NO SIGNAL', 0), res('B', 'NO SIGNAL', 0)]), opts);
assert.equal(bad.classification, 'DATA_INSUFFICIENT');
assert.equal(bad.dataQuality.status, 'DATA_INSUFFICIENT');

assert.equal(store.writeSnapshot(dir, s1).status, 'WRITTEN');
assert.equal(store.writeSnapshot(dir, s1).status, 'UNCHANGED');
store.writeSnapshot(dir, zero);
store.writeSnapshot(dir, bad);

// Immutability: a different payload for the same path is refused; tampered content is refused.
const clash = store.buildSnapshot(scanner('2026-09-25', '2026-09-27T01:00:00Z', [res('Z', 'ACCUMULATION CONFIRMED')]), opts);
assert.throws(() => store.writeSnapshot(dir, clash), e => e.name === 'ImmutableSnapshotError');
assert.throws(() => store.writeSnapshot(dir, { ...s1, counts: { scanned: 99 } }), e => e.name === 'ImmutableSnapshotError');

// A later scan of the same date is a new file; canonical = latest OK scan.
const later = store.buildSnapshot(scanner('2026-09-25', '2026-09-27T05:00:00Z', [res('A', 'NO SIGNAL')]), opts);
store.writeSnapshot(dir, later);
const st = store.statusForDate(dir, '2026-09-25');
assert.equal(st.versions, 2);
assert.equal(st.status, 'VERIFIED_ZERO_CONFIRMATIONS');
assert.equal(store.statusForDate(dir, '2026-09-04').status, 'DATA_INSUFFICIENT');
assert.equal(store.statusForDate(dir, '2026-09-30').status, 'MISSING_SNAPSHOT');

assert.equal(store.verifyChain(dir).ok, true);
const f = path.join(dir, store.readIndex(dir).entries[0].file);
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"confirmed": 1', '"confirmed": 0'));
assert.equal(store.verifyChain(dir).ok, false, 'tampering is detected');
// Regression: tampering must stay detectable, and re-writing the same scan afterwards must not make it look clean.
const tamperedEntry = store.readIndex(dir).entries[0];
const tamperedChain = store.verifyChain(dir);
assert.ok(tamperedChain.problems.some(p => p.includes(tamperedEntry.file) && p.includes('content hash mismatch')), 'problem names the tampered file');
assert.equal(store.verifySnapshot(JSON.parse(fs.readFileSync(f, 'utf8'))), false, 'tampered file no longer matches its own snapshotHash');
store.writeSnapshot(dir, s1); // same scan again: reports UNCHANGED (it compares the stored hash field only)
assert.equal(store.verifyChain(dir).ok, false, 'a rewrite does not repair or hide tampering; verifyChain still fails');

console.log('v15SnapshotStore tests passed');
