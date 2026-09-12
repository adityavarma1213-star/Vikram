'use strict';
// #6 remediation test. Proves /api/scanner/all processes the full symbol universe, not a
// hard-coded 200-symbol slice. Needs a real Postgres instance (DATABASE_URL) since it seeds
// cm_eod and exercises the real HTTP server, same convention as test/integration.test.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('SKIP fullUniverse.test.js: DATABASE_URL not set');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
  await pool.query('TRUNCATE cm_eod, futures_eod, ingestion_runs, scanner_results, scanner_results_periods');

  // Seed a universe of 260 distinct symbols (comfortably over the old 200-symbol cap) with one
  // valid EOD row each so the scanner has real (not fabricated) data to evaluate.
  const SYMBOL_COUNT = 260;
  const day = '2026-09-01';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < SYMBOL_COUNT; i++) {
      const symbol = `SYM${String(i).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO cm_eod(symbol,trade_date,series,prev_close,open,high,low,last_price,close,avg_price,volume,deliv_qty,deliv_per) VALUES($1,$2,'EQ',100,101,105,99,102,102,101,10000,5000,50)`,
        [symbol, day]
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  const port = 39000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, [path.join(__dirname, '../src/index.js')], {
    env: { ...process.env, PORT: String(port), AUTH_SECRET: 'test-secret-please-do-not-use-in-prod' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server did not start in time')), 8000);
    server.stdout.on('data', chunk => { if (chunk.toString().includes('listening')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`server exited early with code ${code}`)); });
  });

  function get(requestPath) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${requestPath}`, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      }).on('error', reject);
    });
  }

  try {
    const all = await get('/api/scanner/all');
    assert.equal(all.universeSize, SYMBOL_COUNT, `expected the full ${SYMBOL_COUNT}-symbol universe to be counted, got ${all.universeSize}`);
    assert.equal(all.results.length, SYMBOL_COUNT, `expected results for all ${SYMBOL_COUNT} symbols (>200), got ${all.results.length}`);
    const distinctSymbols = new Set(all.results.map(r => r.symbol));
    assert.equal(distinctSymbols.size, SYMBOL_COUNT, 'expected every symbol to be represented exactly once');
    console.log(`fullUniverse.test.js: PASS (${SYMBOL_COUNT} symbols processed, no 200-symbol cap)`);
  } finally {
    server.kill();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
