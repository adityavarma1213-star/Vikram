'use strict';
// #10 remediation tests. Requires a real Postgres instance (DATABASE_URL) because it exercises
// the actual HTTP server + auth routes end-to-end, the same pattern test/integration.test.js
// uses. Skips (not a false pass) when no DATABASE_URL is configured, matching this repo's
// existing convention for DB-backed tests.
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('SKIP auth.test.js: DATABASE_URL not set');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fs = require('node:fs');
  await pool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
  await pool.query('TRUNCATE users, saved_scans RESTART IDENTITY CASCADE');

  const port = 38000 + Math.floor(Math.random() * 1000);
  const authSecret = 'test-secret-please-do-not-use-in-prod';
  const server = spawn(process.execPath, [path.join(__dirname, '../src/index.js')], {
    env: { ...process.env, PORT: String(port), AUTH_SECRET: authSecret },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server did not start in time')), 8000);
    server.stdout.on('data', chunk => { if (chunk.toString().includes('listening')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`server exited early with code ${code}`)); });
  });

  function request(method, requestPath, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const data = body !== undefined ? JSON.stringify(body) : null;
      const req = http.request(
        `http://127.0.0.1:${port}${requestPath}`,
        { method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
        res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => { try { resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null }); } catch (e) { reject(e); } });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  try {
    // Register two distinct users.
    const regA = await request('POST', '/api/auth/register', { body: { email: 'alice@example.com', password: 'correct-horse-a' } });
    assert.equal(regA.status, 201);
    const tokenA = regA.json.token;
    assert.ok(tokenA);

    const regB = await request('POST', '/api/auth/register', { body: { email: 'bob@example.com', password: 'correct-horse-b' } });
    assert.equal(regB.status, 201);
    const tokenB = regB.json.token;
    assert.ok(tokenB);
    assert.notEqual(tokenA, tokenB);

    // 1. Unauthenticated request to a private route is rejected.
    const noAuth = await request('GET', '/api/scanner/saved');
    assert.equal(noAuth.status, 401);

    // 5. Invalid/garbage token is rejected.
    const badToken = await request('GET', '/api/scanner/saved', { headers: { Authorization: 'Bearer not-a-real-token' } });
    assert.equal(badToken.status, 401);

    // 2. Authenticated user succeeds and can create + read their own private data.
    const save = await request('POST', '/api/scanner/saved', { headers: { Authorization: `Bearer ${tokenA}` }, body: { name: 'Alice scan', rule: { field: 'close', op: '>', value: 1 } } });
    assert.equal(save.status, 201);
    const listA = await request('GET', '/api/scanner/saved', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(listA.status, 200);
    assert.equal(listA.json.scans.length, 1);
    assert.equal(listA.json.scans[0].name, 'Alice scan');

    // 3. User B cannot see user A's saved scan.
    const listB = await request('GET', '/api/scanner/saved', { headers: { Authorization: `Bearer ${tokenB}` } });
    assert.equal(listB.status, 200);
    assert.equal(listB.json.scans.length, 0);

    // 4. A forged x-vikram-user header cannot impersonate another user or substitute for auth.
    const forgedNoToken = await request('GET', '/api/scanner/saved', { headers: { 'x-vikram-user': '1' } });
    assert.equal(forgedNoToken.status, 401);

    const forgedWithToken = await request('GET', '/api/scanner/saved', { headers: { Authorization: `Bearer ${tokenB}`, 'x-vikram-user': '1' } });
    assert.equal(forgedWithToken.status, 200);
    assert.equal(forgedWithToken.json.scans.length, 0); // still Bob's (empty) data, not Alice's, despite the forged header

    // 6 & 7. Authorization is enforced server-side from the verified token, and an intentionally
    // public route keeps working without any authentication at all.
    const health = await request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.status, 'ok');

    // 8. Logout invalidates the session: the token that worked a moment ago must stop working,
    // not just on the client that logged out, but everywhere (token_version-based revocation).
    const logout = await request('POST', '/api/auth/logout', { headers: { Authorization: `Bearer ${tokenB}` } });
    assert.equal(logout.status, 200);
    const afterLogout = await request('GET', '/api/scanner/saved', { headers: { Authorization: `Bearer ${tokenB}` } });
    assert.equal(afterLogout.status, 401, 'a logged-out token must be rejected even though it has not expired yet');
    // Bob's other, still-valid-looking token check: Alice's session is unaffected by Bob's logout.
    const aliceStillWorks = await request('GET', '/api/scanner/saved', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(aliceStillWorks.status, 200);

    console.log('auth.test.js: PASS');
  } finally {
    server.kill();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
