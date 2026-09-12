// SYNTHETIC_TEST_ONLY — exercises checkpoint/resume mechanics with a throwaway
// manifest file. No NSE data involved.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Manifest } = require('../lib/manifest');

const tmpFile = path.join(os.tmpdir(), `vikram-manifest-test-${Date.now()}.json`);

// 1) Fresh manifest starts empty
let m = new Manifest(tmpFile);
assert.equal(m.isDone('CM', '2026-01-01'), false);

// 2) Recording a SUCCESS+VALID entry marks it done
m.record('CM', '2026-01-01', { source_url: 'https://example.test/x', download_status: 'SUCCESS', sha256: 'abc', validation_status: 'VALID', row_count: 10 });
assert.equal(m.isDone('CM', '2026-01-01'), true);

// 3) A BLOCKED entry is NOT considered done (must be retried on resume)
m.record('CM', '2026-01-02', { source_url: 'https://example.test/y', download_status: 'BLOCKED', validation_status: 'NOT_APPLICABLE' });
assert.equal(m.isDone('CM', '2026-01-02'), false);

// 4) Checkpoint persists to disk and reloading gives the same resume state
const reloaded = new Manifest(tmpFile);
assert.equal(reloaded.isDone('CM', '2026-01-01'), true);
assert.equal(reloaded.isDone('CM', '2026-01-02'), false);

// 5) Summary counts real_data_records only from SUCCESS+VALID entries
const summary = reloaded.summary();
assert.equal(summary.real_data_records, 10);
assert.equal(summary.trading_sessions_confirmed, 1);
assert.equal(summary.by_segment.CM.blocked, 1);

fs.unlinkSync(tmpFile);
console.log('manifest.test.js passed (checkpoint/resume mechanics, SYNTHETIC_TEST_ONLY)');
