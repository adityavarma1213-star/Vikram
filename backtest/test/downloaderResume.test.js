// OFFLINE VERIFICATION of resume/checkpoint behavior against the ACTUAL
// nseDownloader.run()/downloadOneSegment() code path (not just the Manifest
// class in isolation, which manifest.test.js already covers separately).
//
// global.fetch is mocked so no real network call occurs. This test writes
// into the REAL backtest/data directories (nseDownloader.js hardcodes those
// paths — it is not parameterized for a test sandbox), using two calendar
// dates far outside the actual 5-year window this pipeline targets, and
// deletes every artifact it created afterward so the real manifest.json
// keeps recording ONLY the genuine, live NSE-blocked evidence.
//
// NOTE: this uses the LEGACY_CSV format with an ISO-formatted DATE1 value in
// the fixture, specifically to isolate "does resume/checkpoint work" from
// the separate, disclosed risk that real NSE's legacy DATE1 column format
// may not be ISO (see AUDIT.md, section: NSE DATA ACQUISITION / date handling).
// This test proves resume mechanics; it does NOT prove the date-format
// cross-check is correct against a real NSE file.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const downloader = require('../nseDownloader');
const { Manifest } = require('../lib/manifest');

const TEST_DATE_1 = new Date('2015-01-05T00:00:00Z'); // Monday, far outside the real 5yr window
const TEST_DATE_2 = new Date('2015-01-06T00:00:00Z'); // Tuesday

function legacyCsvFixture(ymd) {
  const rows = [
    ['SYMBOL', 'SERIES', 'DATE1', 'PREV_CLOSE', 'OPEN_PRICE', 'HIGH_PRICE', 'LOW_PRICE', 'LAST_PRICE', 'CLOSE_PRICE', 'AVG_PRICE', 'TTL_TRD_QNTY', 'TURNOVER_LACS', 'NO_OF_TRADES', 'DELIV_QTY', 'DELIV_PER'],
    ['TESTSYM', 'EQ', ymd, '99', '100', '105', '98', '101', '101', '100', '1000', '10', '50', '400', '40']
  ];
  return rows.map(r => r.join(',')).join('\n');
}

let fetchCallLog = [];
const realFetch = global.fetch;

function installMockFetch() {
  fetchCallLog = [];
  global.fetch = async (url, opts) => {
    fetchCallLog.push(url);
    const isFo = url.includes('/fo/');
    if (isFo) {
      // Simulate F&O archive genuinely unavailable for this synthetic test
      // date (this test only exercises the CM segment's resume mechanics).
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'not found' };
    }
    if (url.includes('.csv.zip')) {
      // UDIFF_ZIP candidate: simulate NSE not having this format for this
      // (synthetic, pre-UDiFF) test date, so the code falls through to the
      // LEGACY_CSV candidate exactly like it would for genuinely old dates.
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'not found' };
    }
    // LEGACY_CSV candidate
    const ymdMatch = url.match(/sec_bhavdata_full_(\d{2})(\d{2})(\d{4})\.csv/);
    const ymd = `${ymdMatch[3]}-${ymdMatch[2]}-${ymdMatch[1]}`;
    const bodyBuf = Buffer.from(legacyCsvFixture(ymd), 'utf8');
    return {
      ok: true, status: 200, headers: { get: () => null },
      arrayBuffer: async () => bodyBuf.buffer.slice(bodyBuf.byteOffset, bodyBuf.byteOffset + bodyBuf.byteLength)
    };
  };
}

function restoreFetch() { global.fetch = realFetch; }

function cleanupArtifacts() {
  for (const date of [TEST_DATE_1, TEST_DATE_2]) {
    const ymd = date.toISOString().slice(0, 10);
    for (const seg of ['cm', 'fo']) {
      const rawDir = path.join(__dirname, '..', 'data', 'raw', seg);
      if (fs.existsSync(rawDir)) {
        for (const f of fs.readdirSync(rawDir)) if (f.startsWith(ymd)) fs.unlinkSync(path.join(rawDir, f));
      }
      const normFile = path.join(__dirname, '..', 'data', 'normalized', seg, `${ymd}.json`);
      if (fs.existsSync(normFile)) fs.unlinkSync(normFile);
    }
  }
  // Remove the test entries from the REAL manifest without touching genuine ones.
  const manifest = new Manifest(downloader.MANIFEST_PATH);
  for (const date of [TEST_DATE_1, TEST_DATE_2]) {
    const ymd = date.toISOString().slice(0, 10);
    for (const seg of ['CM', 'FO']) delete manifest.data.entries[manifest.key(seg, ymd)];
  }
  manifest._save();
}

async function main() {
  cleanupArtifacts(); // in case a prior failed run left artifacts behind
  installMockFetch();
  try {
    // --- Simulated first run: only date 1 is in range (stands in for "the
    // process was killed after date 1 completed") ---
    const run1 = await downloader.run({ startDate: TEST_DATE_1, endDate: TEST_DATE_1, sleepMs: 0 });
    assert.equal(run1.blocked, null, 'run1 should not be blocked (mock returns 200 for LEGACY_CSV)');
    const callsAfterRun1 = fetchCallLog.length;
    assert.ok(callsAfterRun1 >= 2, 'expected at least the UDIFF_ZIP + LEGACY_CSV attempts for CM plus an FO attempt');

    const manifestAfterRun1 = new Manifest(downloader.MANIFEST_PATH);
    assert.equal(manifestAfterRun1.isDone('CM', '2015-01-05'), true, 'date 1 CM should be checkpointed as done after run1');

    const rawFile = path.join(__dirname, '..', 'data', 'raw', 'cm', '2015-01-05.LEGACY_CSV.csv');
    assert.ok(fs.existsSync(rawFile), 'raw CM file for date 1 should be preserved on disk');
    const normFile = path.join(__dirname, '..', 'data', 'normalized', 'cm', '2015-01-05.json');
    assert.ok(fs.existsSync(normFile), 'normalized CM file for date 1 should exist');

    // --- Simulated second run ("resume"): range now covers dates 1 AND 2 ---
    fetchCallLog = []; // reset call log to prove date 1's CM segment is NOT re-fetched
    const run2 = await downloader.run({ startDate: TEST_DATE_1, endDate: TEST_DATE_2, sleepMs: 0 });
    assert.equal(run2.blocked, null);

    // Only the CM segment for date 1 succeeded+validated in run1, so ONLY it
    // must be skipped on resume. FO for date 1 legitimately never succeeded
    // (mock returns 404 for FO), so per the documented resume contract
    // ("done only if SUCCESS+VALID"), FO for date 1 SHOULD be retried — that
    // is correct behavior, not a resume failure, so it is deliberately
    // excluded from this assertion.
    const cmDate1RefetchAttempts = fetchCallLog.filter(u => u.includes('/content/cm/') || u.includes('sec_bhavdata_full')).filter(u => u.includes('20150105') || u.includes('05012015')).length;
    assert.equal(cmDate1RefetchAttempts, 0, 'RESUME FAILURE: CM segment for date 1 was re-fetched even though it was already checkpointed as SUCCESS+VALID');

    const foDate1RetryAttempts = fetchCallLog.filter(u => u.includes('/content/fo/')).filter(u => u.includes('20150105')).length;
    assert.ok(foDate1RetryAttempts >= 1, 'EXPECTED: FO for date 1 (never successfully validated in run1) should be retried on resume, not silently skipped');

    const date2Attempts = fetchCallLog.filter(u => u.includes('20150106') || u.includes('06012015')).length;
    assert.ok(date2Attempts >= 1, 'date 2 should have been fetched on the resumed run');

    const manifestAfterRun2 = new Manifest(downloader.MANIFEST_PATH);
    assert.equal(manifestAfterRun2.isDone('CM', '2015-01-05'), true);
    assert.equal(manifestAfterRun2.isDone('CM', '2015-01-06'), true);

    // --- Determinism: real_data_records must not double-count date 1 just
    // because run() was invoked twice ---
    const summary = manifestAfterRun2.summary();
    assert.equal(summary.trading_sessions_confirmed, 2, 'expected exactly 2 confirmed CM sessions (date 1 + date 2), not a duplicate');

    console.log('downloaderResume.test.js PASSED: real run()/downloadOneSegment() code path — checkpoint skip on resume verified, no double-counting, raw+normalized files verified present (mocked network, LEGACY_CSV path only).');
  } finally {
    restoreFetch();
    cleanupArtifacts();
  }
}

main().catch(err => { restoreFetch(); cleanupArtifacts(); console.error('downloaderResume.test.js FAILED:', err); process.exit(1); });
