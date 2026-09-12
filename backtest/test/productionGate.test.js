// SYNTHETIC_TEST_ONLY — proves the gate actually refuses fake/insufficient
// runs. requireRealBacktest() now takes the RAW manifest data object (not a
// pre-computed summary) and re-verifies file integrity itself, so tests that
// exercise the "should pass" path need genuine files on disk — this test
// creates them under distinctive dates and cleans them up afterward.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertProductionEngine, requireRealBacktest } = require('../lib/productionGate');
const realEngine = require('../lib/engineAdapter');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// The REAL engine adapter must pass the gate.
assertProductionEngine(realEngine);

// A synthetic/mock adapter (like the one the audit trail found being
// mislabeled as VIKRAM elsewhere) must be REJECTED.
const fakeSynthetic = { is_synthetic: true, is_production_vikram: false, evaluate: () => ({}) };
assert.throws(() => assertProductionEngine(fakeSynthetic), /synthetic adapter cannot be used/i);

const unverified = { is_synthetic: false, is_production_vikram: false, evaluate: () => ({}) };
assert.throws(() => assertProductionEngine(unverified), /production VIKRAM engine is not verified/i);

// requireRealBacktest must refuse a backtest with zero real records, even if
// the engine is legitimate — an empty manifest has real_data_records === 0.
assert.throws(() => requireRealBacktest({ data_provenance: 'REAL_NSE', entries: {} }, realEngine), /REAL DATA REQUIRED/);

// ...and must refuse a manifest CLAIMING records via provenance alone, with
// no entries to back it up (guards against a hand-crafted/incomplete object).
assert.throws(() => requireRealBacktest({ data_provenance: 'NOT_REAL', entries: {} }, realEngine), /provenance is not REAL_NSE/);

// A manifest with a genuine SUCCESS+VALID entry, but the engine is synthetic,
// must still be refused (engine check is independent of data check).
const ROOT = path.join(__dirname, '..');
const ymd = '2098-01-01-gatetest';
const relPath = path.join('data', 'raw', 'cm', `${ymd}.TEST.csv`);
const absPath = path.join(ROOT, relPath);
const normPath = path.join(ROOT, 'data', 'normalized', 'cm', `${ymd}.json`);
const content = Buffer.from('SYMBOL,CLOSE\nTEST,100\n');

function withGenuineEntry(fn) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  fs.mkdirSync(path.dirname(normPath), { recursive: true });
  fs.writeFileSync(normPath, '[]');
  const manifestData = {
    data_provenance: 'REAL_NSE',
    entries: {
      [`CM|${ymd}`]: {
        segment: 'CM', trading_date: ymd, source_url: 'https://example.test/fixture',
        download_status: 'SUCCESS', validation_status: 'VALID',
        sha256: sha256(content), file_path: relPath, row_count: 1
      }
    }
  };
  try { fn(manifestData); } finally {
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    if (fs.existsSync(normPath)) fs.unlinkSync(normPath);
  }
}

withGenuineEntry(manifestData => {
  assert.throws(() => requireRealBacktest(manifestData, fakeSynthetic), /SYNTHETIC ENGINE REFUSED/);

  // Only real data + real engine + passing integrity check succeeds.
  const { summary, integrity } = requireRealBacktest(manifestData, realEngine); // should not throw
  assert.equal(summary.real_data_records, 1);
  assert.equal(integrity.ok, true);
});

// A manifest with real_data_records > 0 on paper, but the underlying raw
// file MISSING (deleted after being recorded) — the exact scenario AUDIT.md
// flagged as a hole — must now be REJECTED, not silently passed.
withGenuineEntry(manifestData => {
  fs.unlinkSync(absPath); // simulate the file having vanished after recording
  assert.throws(
    () => requireRealBacktest(manifestData, realEngine),
    err => { assert.match(err.message, /MANIFEST INTEGRITY VIOLATION/); assert.match(err.message, /MISSING/); return true; }
  );
});

// A manifest whose recorded SHA-256 was hand-edited to not match the actual
// (untouched) file — must also be REJECTED.
withGenuineEntry(manifestData => {
  manifestData.entries[`CM|${ymd}`].sha256 = 'tampered'.repeat(8);
  assert.throws(
    () => requireRealBacktest(manifestData, realEngine),
    err => { assert.match(err.message, /MANIFEST INTEGRITY VIOLATION/); assert.match(err.message, /MISMATCH/); return true; }
  );
});

console.log('productionGate.test.js passed (honesty-gate refusal logic INCLUDING file-integrity re-verification, SYNTHETIC_TEST_ONLY)');
