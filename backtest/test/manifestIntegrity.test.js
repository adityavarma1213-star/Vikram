// Verifies lib/manifestIntegrity.js against REAL files on disk (under a
// dedicated test subdirectory of backtest/data so it never touches the
// genuine manifest/raw files), covering the four scenarios required by the
// remediation request. Cleans up everything it creates.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { verifyManifestIntegrity } = require('../lib/manifestIntegrity');

const ROOT = path.join(__dirname, '..');
const TEST_TAG = 'integritytest'; // distinctive so cleanup can't collide with real dates
const RAW_DIR = path.join(ROOT, 'data', 'raw', 'cm');
const NORM_DIR = path.join(ROOT, 'data', 'normalized', 'cm');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function makeEntry(ymd, { fileContent, recordedSha, withNormalized = true }) {
  const relRawPath = path.join('data', 'raw', 'cm', `${ymd}.TEST.csv`);
  const absRawPath = path.join(ROOT, relRawPath);
  fs.mkdirSync(path.dirname(absRawPath), { recursive: true });
  if (fileContent !== null) fs.writeFileSync(absRawPath, fileContent);
  if (withNormalized) {
    const normPath = path.join(NORM_DIR, `${ymd}.json`);
    fs.mkdirSync(path.dirname(normPath), { recursive: true });
    fs.writeFileSync(normPath, '[]');
  }
  return {
    segment: 'CM', trading_date: ymd, source_url: 'https://example.test/fixture',
    download_status: 'SUCCESS', validation_status: 'VALID',
    sha256: recordedSha, file_path: relRawPath, row_count: 1
  };
}

function cleanup(ymds) {
  for (const ymd of ymds) {
    const rawPath = path.join(RAW_DIR, `${ymd}.TEST.csv`);
    const normPath = path.join(NORM_DIR, `${ymd}.json`);
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    if (fs.existsSync(normPath)) fs.unlinkSync(normPath);
  }
}

const ymdA = `2099-01-01-${TEST_TAG}`;
const ymdB = `2099-01-02-${TEST_TAG}`;
const ymdC = `2099-01-03-${TEST_TAG}`;
const ymdD = `2099-01-04-${TEST_TAG}`;

try {
  // --- A. genuine file + correct hash = ACCEPTED ---
  const contentA = Buffer.from('SYMBOL,CLOSE\nTEST,100\n');
  const entryA = makeEntry(ymdA, { fileContent: contentA, recordedSha: sha256(contentA) });

  // --- B. modified raw file (content on disk no longer matches recorded hash) = REJECTED ---
  const contentB_original = Buffer.from('SYMBOL,CLOSE\nTEST,100\n');
  const entryB = makeEntry(ymdB, { fileContent: contentB_original, recordedSha: sha256(contentB_original) });
  // Now tamper with the file AFTER recording — simulates post-hoc alteration/corruption.
  fs.writeFileSync(path.join(RAW_DIR, `${ymdB}.TEST.csv`), 'SYMBOL,CLOSE\nTEST,999999\n');

  // --- C. missing raw file (manifest claims SUCCESS+VALID but file was deleted) = REJECTED ---
  const contentC = Buffer.from('SYMBOL,CLOSE\nTEST,100\n');
  const entryC = makeEntry(ymdC, { fileContent: contentC, recordedSha: sha256(contentC) });
  fs.unlinkSync(path.join(RAW_DIR, `${ymdC}.TEST.csv`)); // delete it after recording, before gate check

  // --- D. edited manifest hash (file untouched, but manifest's recorded hash was hand-edited) = REJECTED ---
  const contentD = Buffer.from('SYMBOL,CLOSE\nTEST,100\n');
  const entryD = makeEntry(ymdD, { fileContent: contentD, recordedSha: 'deadbeef'.repeat(8) }); // wrong hash on purpose

  const manifestData = {
    data_provenance: 'REAL_NSE',
    entries: {
      [`CM|${ymdA}`]: entryA,
      [`CM|${ymdB}`]: entryB,
      [`CM|${ymdC}`]: entryC,
      [`CM|${ymdD}`]: entryD
    }
  };

  const result = verifyManifestIntegrity(manifestData);

  assert.equal(result.checkedCount, 4, 'expected all 4 SUCCESS+VALID entries to be checked');
  assert.equal(result.ok, false, 'expected overall result to be REJECTED given B/C/D are all bad');

  const reasonsText = result.violations.map(v => v.reason).join(' | ');
  assert.ok(!reasonsText.includes(ymdA), `A) genuine file + correct hash should NOT appear in violations. Violations: ${reasonsText}`);
  assert.ok(reasonsText.includes('MISMATCH') && reasonsText.includes(ymdB), 'B) modified raw file should be rejected as a hash mismatch');
  assert.ok(reasonsText.includes('MISSING') && reasonsText.includes(ymdC), 'C) missing raw file should be rejected as missing');
  assert.ok(reasonsText.includes('MISMATCH') && reasonsText.includes(ymdD), 'D) edited manifest hash should be rejected as a hash mismatch');

  // Isolate A on its own to prove it is unconditionally accepted by itself.
  const onlyA = verifyManifestIntegrity({ data_provenance: 'REAL_NSE', entries: { [`CM|${ymdA}`]: entryA } });
  assert.equal(onlyA.ok, true, 'A) genuine file + correct hash, checked alone, must be ACCEPTED');
  assert.equal(onlyA.violations.length, 0);

  console.log('manifestIntegrity.test.js PASSED: A) accepted, B) modified-file rejected, C) missing-file rejected, D) edited-hash rejected.');
} finally {
  cleanup([ymdA, ymdB, ymdC, ymdD]);
}
