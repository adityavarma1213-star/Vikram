const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('SKIP integration.test.js: DATABASE_URL not set');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8');
  await pool.query(schema);
  await pool.query('TRUNCATE cm_eod, futures_eod, ingestion_runs, scanner_results');

  const days = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-31','2026-09-01'];
  let prevA = 100, prevB = 50;
  for (const [i, day] of days.entries()) {
    const closeA = prevA + 1;
    const closeB = prevB - 0.5;
    await pool.query(`INSERT INTO cm_eod(symbol,trade_date,series,prev_close,close,last_price,volume,deliv_qty,deliv_per) VALUES('AAA',$1,'EQ',$2,$3,$3,$4,$5,$6)`, [day, prevA, closeA, 1000 + i * 50, 500 + i * 10, 45 + i]);
    await pool.query(`INSERT INTO cm_eod(symbol,trade_date,series,prev_close,close,last_price,volume,deliv_qty,deliv_per) VALUES('BBB',$1,'EQ',$2,$3,$3,$4,$5,$6)`, [day, prevB, closeB, 900 - i * 20, 300 - i * 5, 30 - i]);
    prevA = closeA; prevB = closeB;
  }
  await pool.query(`INSERT INTO futures_eod(symbol,trade_date,expiry,close,oi,change_oi) VALUES('AAA',$1,$2,110,50000,4000)`, [days.at(-1), '2026-09-25']);

  const { materializeScannerResults } = require('../src/ingest');
  const count = await materializeScannerResults();
  assert.equal(count, 2);
  const stored = await pool.query('SELECT * FROM scanner_results ORDER BY symbol');
  assert.equal(stored.rows.length, 2);
  const aaa = stored.rows.find(r => r.symbol === 'AAA');
  const bbb = stored.rows.find(r => r.symbol === 'BBB');
  assert.equal(aaa.metrics.oiExactDate, true);
  assert.equal(bbb.metrics.oiExactDate, false);
  assert.equal(bbb.metrics.futuresOi, null);

  const port = 34567 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, [path.join(__dirname, '../src/index.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
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
    const health = await get('/api/health');
    assert.equal(health.status, 'ok');
    assert.equal(health.materializedSymbols, 2);

    const all = await get('/api/scanner/all');
    assert.equal(all.results.length, 2);
    assert.equal(all.results.find(r => r.symbol === 'AAA').materialized, true);
    assert.equal(all.results.find(r => r.symbol === 'AAA').metrics.oiExactDate, true);

    const mixed = await get('/api/scanner/scan?symbols=AAA,ZZZ');
    assert.equal(mixed.results.length, 2);
    assert.equal(mixed.results.find(r => r.symbol === 'ZZZ').score, null);

    const stock = await get('/api/stock/AAA');
    assert.equal(stock.result.symbol, 'AAA');
    assert.equal(stock.result.metrics.oiExactDate, true);
    console.log('integration tests passed (schema + materializer + API)');
  } finally {
    server.kill();
  }
  await pool.end();
}

main().catch(error => { console.error(error); process.exit(1); });
