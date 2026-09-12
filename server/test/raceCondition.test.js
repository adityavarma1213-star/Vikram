'use strict';
// #3 remediation test. Proves the check-then-act race in detectNewMatches is fixed by actually
// running two concurrent calls against a real Postgres instance (a mocked single client, as used
// in alertEngine.test.js, cannot exercise cross-connection concurrency/locking, so this needs a
// real DB — same convention as test/integration.test.js: skip, don't fake-pass, if unavailable).
const assert = require('node:assert/strict');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('SKIP raceCondition.test.js: DATABASE_URL not set');
    return;
  }

  const { Pool } = require('pg');
  const fs = require('node:fs');
  const path = require('node:path');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  await pool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
  await pool.query('TRUNCATE scanner_matches_seen');

  const { detectNewMatches } = require('../src/alerts/newMatchDetector');
  const match = { symbol: 'RACE', tradeDate: '2026-09-05' };

  // Fire many concurrent "did this just become a new match" checks for the SAME
  // scanner_id/symbol/trade_date, simulating overlapping ingestion/alert-pipeline runs.
  const CONCURRENCY = 25;
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => detectNewMatches(pool, 'accumulation', [match]))
  );

  const totalFlaggedNew = results.reduce((sum, r) => sum + r.length, 0);
  assert.equal(totalFlaggedNew, 1, `expected exactly one caller to observe the match as new, got ${totalFlaggedNew} (duplicate alerts would fire otherwise)`);

  const stored = await pool.query('SELECT COUNT(*)::int AS n FROM scanner_matches_seen WHERE scanner_id=$1 AND symbol=$2 AND trade_date=$3', ['accumulation', match.symbol, match.tradeDate]);
  assert.equal(stored.rows[0].n, 1, 'expected exactly one row — no duplicate records');

  // A second, later batch for the same match must correctly see it as already-seen (not new
  // again), proving the final state is deterministic and stable after the concurrent burst.
  const after = await detectNewMatches(pool, 'accumulation', [match]);
  assert.equal(after.length, 0);

  await pool.end();
  console.log(`raceCondition.test.js: PASS (${CONCURRENCY} concurrent calls -> exactly 1 new-match detection, 1 stored row)`);
}

main().catch(e => { console.error(e); process.exit(1); });
