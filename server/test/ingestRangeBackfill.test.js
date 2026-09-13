'use strict';
// DB-independent checks for runRangeBackfill (server/src/ingest.js). Full execution against a
// real database and real NSE responses is covered by ingestionLock.test.js's own honest skip
// pattern -- this file only proves the function exists, is exported separately from the cron
// incremental path, and validates its required parameters before touching any network or DB call.
const assert = require('node:assert/strict');
const ingest = require('../src/ingest');

assert.equal(typeof ingest.runRangeBackfill, 'function', 'runRangeBackfill must be exported as a distinct function from runIncrementalIngest');
assert.notEqual(ingest.runRangeBackfill, ingest.runIncrementalIngest, 'range backfill must be a separate function, not an alias for the narrow cron-incremental path');

ingest.runRangeBackfill({}).then(
  () => { console.error('runRangeBackfill({}) should have rejected without startDate/endDate'); process.exit(1); },
  (err) => {
    assert.match(err.message, /startDate and endDate/);
    console.log('ingestRangeBackfill tests passed (exported separately, validates required parameters; full DB/network execution not exercised here)');
  }
);
