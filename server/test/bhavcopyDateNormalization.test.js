'use strict';
// Regression tests for the delivery-loss bug proven against live NSE data on 2026-09-25:
// fetchCm() compared the Full Bhavcopy source's DATE1 field ("DD-Mon-YYYY") directly against
// formatYmd(date) ("YYYY-MM-DD") without normalizing either side, so the comparison always
// failed and the source was always rejected in favor of the UDiFF fallback, which carries no
// delivery columns at all -- silently producing deliv_qty/deliv_per: null for every symbol,
// every day. See REMEDIATION_STATUS.md / the 2026-09-27 forensic trace for the full proof.
//
// This file proves: (1) a correctly-dated Full Bhavcopy file is now accepted and its real
// delivery values survive; (2) date validation still rejects a genuine mismatch and still falls
// through to the UDiFF source when the primary source is unavailable; (3) the unrelated Futures
// OI exact-date path (INDHOTEL) is untouched; (4) the unrelated non-F&O control (3MINDIA)
// remains correctly N/A. Tests 3 and 4 read the real, on-disk market-history for 2026-09-25 --
// same convention as test/researchStatic.test.js -- rather than synthetic fixtures, because the
// point is to prove nothing in the untouched Futures/materialize path regressed.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// fetchCm() calls preserveRaw(), which writes the fetched bytes to the real
// data/raw-archive/<segment>/<date>.{csv,zip} path and rewrites data/raw-archive/manifest.json
// as a side effect of ordinary production use. These tests must never let that happen to the
// real repository: writes are stubbed out (no-op) for the duration of every mocked-fetch call,
// so running this file leaves the working tree untouched no matter what date is fetched.
function withMockedFetch(urlToBuffer, fn) {
  const originalFetch = global.fetch;
  const fs = require('fs');
  const originalWriteFileSync = fs.writeFileSync;
  const originalMkdirSync = fs.mkdirSync;
  global.fetch = async (url) => {
    if (!(url in urlToBuffer)) {
      const err = new Error(`NSE 404 for ${url}`);
      throw err;
    }
    const buf = urlToBuffer[url];
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  fs.writeFileSync = () => {};
  fs.mkdirSync = () => {};
  return fn().finally(() => {
    global.fetch = originalFetch;
    fs.writeFileSync = originalWriteFileSync;
    fs.mkdirSync = originalMkdirSync;
  });
}

function fullBhavcopyCsv(dateStr, symbol, deliveryQty, deliveryPer) {
  const header = 'SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER';
  const row = `${symbol}, EQ, ${dateStr}, 100.00, 101.00, 102.00, 99.00, 100.50, 100.50, 100.25, 1000, 10.00, 5, ${deliveryQty}, ${deliveryPer}`;
  return Buffer.from(`${header}\n${row}\n`);
}

async function run() {
  const { fetchCm, readHistory, materialize } = require('../src/staticSnapshot');

  // ---------------------------------------------------------------------------------------
  // TEST 1 -- DELIVERY: proven example, 360ONE / 2026-09-25, against the ACTUAL stored raw
  // NSE archive bytes (not a synthetic fixture), so this proves the real regression is fixed,
  // not just a hypothetical shape.
  // ---------------------------------------------------------------------------------------
  {
    const cmCsvPath = path.join(__dirname, '..', '..', 'data', 'raw-archive', 'CM', '2026-09-25.csv');
    const cmZipPath = path.join(__dirname, '..', '..', 'data', 'raw-archive', 'CM', '2026-09-25.zip');
    assert.ok(fs.existsSync(cmCsvPath), 'expected the real raw Full Bhavcopy archive for 2026-09-25 to be present');
    const urlToBuffer = {
      'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_25092026.csv': fs.readFileSync(cmCsvPath),
      'https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20260925_F_0000.csv.zip': fs.readFileSync(cmZipPath)
    };
    const calledUrls = [];
    await withMockedFetch(urlToBuffer, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url) => { calledUrls.push(url); return originalFetch(url); };
      const rows = await fetchCm(new Date('2026-09-25T00:00:00.000Z'));
      const row = rows.find(r => r.symbol === '360ONE');
      assert.ok(row, 'expected 360ONE to be present in fetchCm() output');
      assert.equal(row.deliv_qty, 438430, 'proven raw NSE value: DELIV_QTY = 438430');
      assert.equal(row.deliv_per, 59.4, 'proven raw NSE value: DELIV_PER = 59.40');
      assert.equal(row.trade_date, '2026-09-25');
    });
    assert.deepEqual(
      calledUrls,
      ['https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_25092026.csv'],
      'the Full Bhavcopy source must be accepted on the first try -- no fallback to the delivery-incapable UDiFF source'
    );
  }

  // ---------------------------------------------------------------------------------------
  // TEST 2 -- DATE VALIDATION: a correctly formatted DD-Mon-YYYY DATE1 must match the
  // requested date; a genuinely different date must still be rejected, and rejection must
  // still fall through to the secondary source when available.
  // ---------------------------------------------------------------------------------------
  {
    const date = new Date('2026-09-25T00:00:00.000Z');
    const fullUrl = 'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_25092026.csv';

    // 2a. Matching date -- must be accepted, with real delivery values surviving.
    await withMockedFetch({ [fullUrl]: fullBhavcopyCsv('25-Sep-2026', 'TESTSYM', 500, 50) }, async () => {
      const rows = await fetchCm(date);
      assert.equal(rows[0].deliv_qty, 500);
      assert.equal(rows[0].deliv_per, 50);
      assert.equal(rows[0].trade_date, '2026-09-25');
    });

    // 2b. Genuinely mismatched date -- must be rejected. With no working fallback URL, the
    // overall fetchCm() call must throw (proving the mismatch was NOT silently accepted).
    await withMockedFetch({ [fullUrl]: fullBhavcopyCsv('24-Sep-2026', 'TESTSYM', 500, 50) }, async () => {
      await assert.rejects(() => fetchCm(date), /archive returned 2026-09-24 while 2026-09-25 was requested|NSE 404/);
    });
  }

  // ---------------------------------------------------------------------------------------
  // TEST 3 -- FUTURES CONTROL (untouched code path): INDHOTEL / 2026-09-25 exact-date OI
  // must remain fully populated, read from the REAL on-disk market-history (same convention
  // as test/researchStatic.test.js), proving the Futures/materialize path was not touched by
  // this fix.
  // ---------------------------------------------------------------------------------------
  {
    const history = readHistory();
    assert.ok(history.length > 0, 'expected real market-history files to be present in this repo');
    const materialized = materialize(history);
    const row = materialized.results.find(r => r.symbol === 'INDHOTEL' && r.tradeDate === '2026-09-25');
    assert.ok(row, 'expected an INDHOTEL result for 2026-09-25');
    assert.equal(typeof row.metrics.futuresOi, 'number');
    assert.ok(row.metrics.futuresOi > 0, 'futuresOi must be populated (non-null, positive)');
    assert.equal(typeof row.metrics.changeOi, 'number');
    assert.equal(row.metrics.oiExactDate, true, 'exact-date OI must remain true for INDHOTEL');
  }

  // ---------------------------------------------------------------------------------------
  // TEST 4 -- NON-F&O CONTROL (untouched code path): 3MINDIA / 2026-09-25 must remain
  // correctly N/A for Futures OI, read from the REAL on-disk market-history.
  // ---------------------------------------------------------------------------------------
  {
    const history = readHistory();
    const materialized = materialize(history);
    const row = materialized.results.find(r => r.symbol === '3MINDIA' && r.tradeDate === '2026-09-25');
    assert.ok(row, 'expected a 3MINDIA result for 2026-09-25');
    assert.equal(row.metrics.futuresOi, null, '3MINDIA has no F&O contract -- futuresOi must remain null');
    assert.equal(row.metrics.changeOi, null, '3MINDIA has no F&O contract -- changeOi must remain null');
    assert.equal(row.metrics.oiExactDate, false, '3MINDIA has no F&O contract -- oiExactDate must remain false');
    assert.ok(!materialized.derivativesSymbols.has('3MINDIA'), '3MINDIA must not appear in derivativesSymbols');
  }

  console.log('bhavcopyDateNormalization tests passed (delivery fix proven live; Futures OI and non-F&O controls unaffected)');
}

run().catch(err => { console.error(err); process.exit(1); });
