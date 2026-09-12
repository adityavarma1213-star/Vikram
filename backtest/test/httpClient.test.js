// SYNTHETIC_TEST_ONLY (mocked fetchImpl, no real network) — verifies
// lib/httpClient.js's timeout, retry classification, backoff, and terminal
// failure behavior.
const assert = require('node:assert/strict');
const { fetchWithRetry, classify } = require('../lib/httpClient');

function fakeResponse(status, body = '') {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => body, arrayBuffer: async () => Buffer.from(body).buffer };
}

async function testClassification() {
  assert.equal(classify(fakeResponse(403)), 'BLOCKED');
  assert.equal(classify(fakeResponse(404)), 'NOT_RETRYABLE_404');
  assert.equal(classify(fakeResponse(429)), 'RETRYABLE_RATE_LIMITED');
  assert.equal(classify(fakeResponse(500)), 'RETRYABLE_SERVER_ERROR');
  assert.equal(classify(fakeResponse(503)), 'RETRYABLE_SERVER_ERROR');
  assert.equal(classify({ name: 'AbortError' }), 'RETRYABLE_TIMEOUT');
  console.log('  classify(): PASS');
}

async function testSucceedsFirstTry() {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fakeResponse(200, 'ok'); };
  const { response, attempts } = await fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 3, baseDelayMs: 1 });
  assert.equal(response.status, 200);
  assert.equal(attempts, 1);
  assert.equal(calls, 1);
  console.log('  succeeds on first try: PASS');
}

async function testRetriesTransientThenSucceeds() {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return calls < 3 ? fakeResponse(503) : fakeResponse(200, 'ok'); };
  const { attempts } = await fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 5, baseDelayMs: 1 });
  assert.equal(attempts, 3, 'should succeed on the 3rd attempt after two 503s');
  assert.equal(calls, 3);
  console.log('  retries transient 503 then succeeds: PASS');
}

async function testDoesNotRetry404() {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fakeResponse(404); };
  await assert.rejects(
    () => fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 5, baseDelayMs: 1 }),
    err => { assert.equal(err.classification, 'NOT_RETRYABLE_404'); return true; }
  );
  assert.equal(calls, 1, 'a 404 must NOT be retried — it should fail after exactly one attempt');
  console.log('  does not retry 404 (single attempt, terminal): PASS');
}

async function testDoesNotRetryBlocked() {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fakeResponse(403); };
  await assert.rejects(
    () => fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 5, baseDelayMs: 1 }),
    err => { assert.equal(err.classification, 'BLOCKED'); return true; }
  );
  assert.equal(calls, 1, 'a 403 BLOCKED must NOT be retried, per requirement #11 (never bypass a block)');
  console.log('  does not retry 403 BLOCKED (single attempt, terminal): PASS');
}

async function testTerminalAfterMaxRetries() {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fakeResponse(500); };
  await assert.rejects(
    () => fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 2, baseDelayMs: 1 }),
    err => { assert.match(err.message, /TERMINAL FAILURE/); return true; }
  );
  assert.equal(calls, 3, 'expected exactly maxRetries+1 = 3 total attempts before terminal failure');
  console.log('  reaches a clear TERMINAL failure state after bounded retries: PASS');
}

async function testExponentialBackoffTiming() {
  let calls = 0;
  const timestamps = [];
  const fetchImpl = async () => { calls += 1; timestamps.push(Date.now()); return calls < 4 ? fakeResponse(429) : fakeResponse(200); };
  await fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 5, baseDelayMs: 20 });
  const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  // Expect roughly 20ms, 40ms, 80ms (exponential), allow generous scheduling slack.
  assert.ok(gaps[0] >= 15, `expected first backoff >= ~20ms, got ${gaps[0]}ms`);
  assert.ok(gaps[1] >= gaps[0], `expected second backoff >= first (exponential growth), got ${gaps[1]}ms vs ${gaps[0]}ms`);
  console.log(`  exponential backoff grows between attempts (${gaps.join('ms, ')}ms): PASS`);
}

async function testTimeoutAborts() {
  let calls = 0;
  const fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    calls += 1;
    const t = setTimeout(() => resolve(fakeResponse(200)), 5000); // would resolve, but should be aborted first
    opts.signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  await assert.rejects(
    () => fetchWithRetry('https://example.test/x', {}, { fetchImpl, maxRetries: 0, baseDelayMs: 1, requestTimeoutMs: 50 }),
    err => { assert.equal(err.classification, 'RETRYABLE_TIMEOUT'); return true; }
  );
  assert.equal(calls, 1);
  console.log('  bounded request timeout actually aborts a hanging request: PASS');
}

(async () => {
  await testClassification();
  await testSucceedsFirstTry();
  await testRetriesTransientThenSucceeds();
  await testDoesNotRetry404();
  await testDoesNotRetryBlocked();
  await testTerminalAfterMaxRetries();
  await testExponentialBackoffTiming();
  await testTimeoutAborts();
  console.log('httpClient.test.js PASSED (all 8 scenarios, mocked network only)');
})().catch(err => { console.error('httpClient.test.js FAILED:', err); process.exit(1); });
