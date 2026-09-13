'use strict';
// ITEM 2 TEST REQUIREMENT: "Add a test proving raw-source provenance metadata is required for
// new downloads." This exercises the REAL enforcement code path (manifestIntegrity.js +
// productionGate.js) directly with synthetic fixtures — no network, no csv-parse dependency
// (unlike downloaderResume.test.js, which exercises the same guarantee end-to-end through the
// real downloader but is currently BLOCKED in this sandbox by a missing npm package; see
// ITEM2_PROVENANCE_REPORT.md).
//
// The claim under test: a manifest entry cannot be trusted as real data — and a backtest built
// from it is refused outright — unless it carries file_path + sha256 (raw-source provenance
// metadata) AND that sha256 actually verifies against real bytes on disk. This is enforced at
// requireRealBacktest(), the single gate backtestRunner.js calls before treating anything as real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verifyManifestIntegrity } = require('../lib/manifestIntegrity');
const { requireRealBacktest } = require('../lib/productionGate');
const { sha256 } = require('../lib/validators');

const BACKTEST_ROOT = path.join(__dirname, '..');
const realEngine = { is_production_vikram: true, is_synthetic: false, source_file: 'x', source_sha256: 'y' };

function withTempRawFile(relPathUnderNormalized, content, fn) {
  // manifestIntegrity.js resolves file_path relative to BACKTEST_ROOT and re-hashes whatever is
  // there — use a real scratch file so the "hash actually verifies" path is genuinely exercised.
  const absPath = path.join(BACKTEST_ROOT, relPathUnderNormalized);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  try {
    return fn(absPath);
  } finally {
    fs.unlinkSync(absPath);
  }
}

// 1. An entry with NO sha256 at all is rejected, even if everything else looks plausible.
withTempRawFile('data/_test_scratch/no_sha.raw', 'irrelevant content', (absPath) => {
  const relPath = path.relative(BACKTEST_ROOT, absPath);
  const manifestData = {
    data_provenance: 'REAL_NSE',
    entries: {
      'CM|2099-01-01': {
        segment: 'CM', trading_date: '2099-01-01', source_url: 'https://nsearchives.nseindia.com/x',
        download_status: 'SUCCESS', validation_status: 'VALID', sha256: null, file_path: relPath, row_count: 10
      }
    }
  };
  const integrity = verifyManifestIntegrity(manifestData);
  assert.equal(integrity.ok, false, 'an entry missing sha256 must fail integrity verification');
  assert.ok(integrity.violations.some(v => /no recorded SHA-256/.test(v.reason)));
  assert.throws(
    () => requireRealBacktest(manifestData, realEngine),
    /MANIFEST INTEGRITY VIOLATION.*no recorded SHA-256/s,
    'requireRealBacktest must refuse a backtest built on an entry with no raw-source hash'
  );
});
console.log('missing sha256 -> refused — PASS');

// 2. An entry with NO file_path at all (nothing to verify against) is rejected.
{
  const manifestData = {
    data_provenance: 'REAL_NSE',
    entries: {
      'CM|2099-01-02': {
        segment: 'CM', trading_date: '2099-01-02', source_url: 'https://nsearchives.nseindia.com/x',
        download_status: 'SUCCESS', validation_status: 'VALID', sha256: 'deadbeef', file_path: null, row_count: 10
      }
    }
  };
  const integrity = verifyManifestIntegrity(manifestData);
  assert.equal(integrity.ok, false);
  assert.ok(integrity.violations.some(v => /no file_path recorded/.test(v.reason)));
  assert.throws(() => requireRealBacktest(manifestData, realEngine), /no file_path recorded/);
}
console.log('missing file_path -> refused — PASS');

// 3. An entry whose recorded sha256 does NOT match the actual bytes on disk (tampered, corrupted,
// or hand-edited manifest) is rejected — proves the hash is actually re-verified, not just
// checked for presence.
withTempRawFile('data/_test_scratch/tampered.raw', 'original bytes', (absPath) => {
  const relPath = path.relative(BACKTEST_ROOT, absPath);
  const wrongHash = sha256(Buffer.from('different bytes entirely'));
  const manifestData = {
    data_provenance: 'REAL_NSE',
    entries: {
      'CM|2099-01-03': {
        segment: 'CM', trading_date: '2099-01-03', source_url: 'https://nsearchives.nseindia.com/x',
        download_status: 'SUCCESS', validation_status: 'VALID', sha256: wrongHash, file_path: relPath, row_count: 10
      }
    }
  };
  const integrity = verifyManifestIntegrity(manifestData);
  assert.equal(integrity.ok, false);
  assert.ok(integrity.violations.some(v => /SHA-256 MISMATCH/.test(v.reason)));
  assert.throws(() => requireRealBacktest(manifestData, realEngine), /SHA-256 MISMATCH/);
});
console.log('sha256 mismatch (tampered file) -> refused — PASS');

// 4. A raw file that has since been deleted (but the manifest still claims SUCCESS+VALID) is
// rejected — proves provenance is re-checked against the filesystem every run, not cached/trusted
// from a prior verification.
{
  const fakeMissingPath = 'data/_test_scratch/does_not_exist_' + Date.now() + '.raw';
  const manifestData = {
    data_provenance: 'REAL_NSE',
    entries: {
      'CM|2099-01-04': {
        segment: 'CM', trading_date: '2099-01-04', source_url: 'https://nsearchives.nseindia.com/x',
        download_status: 'SUCCESS', validation_status: 'VALID', sha256: 'deadbeef', file_path: fakeMissingPath, row_count: 10
      }
    }
  };
  const integrity = verifyManifestIntegrity(manifestData);
  assert.equal(integrity.ok, false);
  assert.ok(integrity.violations.some(v => /raw file MISSING/.test(v.reason)));
  assert.throws(() => requireRealBacktest(manifestData, realEngine), /raw file MISSING/);
}
console.log('missing raw file on disk -> refused — PASS');

// 5. Conversely: a genuinely complete, correct entry (real bytes on disk, matching hash, existing
// normalized file) IS accepted — proves the checks above reject for cause, not indiscriminately.
withTempRawFile('data/_test_scratch/genuine.raw', 'genuine NSE-style content', (absPath) => {
  const relPath = path.relative(BACKTEST_ROOT, absPath);
  const realHash = sha256(fs.readFileSync(absPath));
  const normPath = path.join(BACKTEST_ROOT, 'data', 'normalized', 'cm', '2099-01-05.json');
  fs.mkdirSync(path.dirname(normPath), { recursive: true });
  fs.writeFileSync(normPath, '[]');
  try {
    const manifestData = {
      data_provenance: 'REAL_NSE',
      entries: {
        'CM|2099-01-05': {
          segment: 'CM', trading_date: '2099-01-05', source_url: 'https://nsearchives.nseindia.com/x',
          download_status: 'SUCCESS', validation_status: 'VALID', sha256: realHash, file_path: relPath, row_count: 10
        }
      }
    };
    const integrity = verifyManifestIntegrity(manifestData);
    assert.equal(integrity.ok, true, `expected a genuinely complete entry to pass; got: ${JSON.stringify(integrity.violations)}`);
  } finally {
    fs.unlinkSync(normPath);
  }
});
console.log('genuine complete provenance -> accepted — PASS');

console.log('provenanceRequired.test.js: PASS (proves raw-source provenance metadata is required and re-verified before any backtest can trust it)');
