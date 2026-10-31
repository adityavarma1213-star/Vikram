'use strict';
// OFFLINE tests. No network, no real Dhan credentials, no database. All data is synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const http = require('node:http'); const crypto = require('node:crypto');
const express = require('express');
const F = require('./fixtures/dhanSynthetic');
const { chunkRange } = require('../src/dhanHistorical/chunker');
const { validateRequest } = require('../src/dhanHistorical/request');
const { parseCandles, validateCandles, coverage } = require('../src/dhanHistorical/validate');
const { toCsv, csvFilename } = require('../src/dhanHistorical/csv');
const { redact } = require('../src/dhanHistorical/redact');
const { createClient, DhanError } = require('../src/dhanHistorical/client');
const { runDownload, createJobStore } = require('../src/dhanHistorical/service');
const { parseScripMaster, loadInstruments } = require('../src/dhanHistorical/instruments');
const { createDhanHistoricalRouter } = require('../src/dhanHistorical/routes');
const { istStamp, addDays } = require('../src/dhanHistorical/dates');

let passed = 0; const queue = [];
const test = (name, fn) => queue.push([name, fn]);
const NOW = Date.parse('2026-10-30T06:00:00Z');
const fastLimits = { minGapMs: 0, timeoutMs: 1000, maxRetries: 3, retryBaseMs: 1, maxChunksPerJob: 30, maxRowsPerJob: 600000, jobTtlMs: 600000, maxJobsPerUser: 3, maxStartsPerMinutePerUser: 4 };
const noSleep = () => Promise.resolve();
const okRes = body => ({ status: 200, json: async () => body });
const errRes = (status, body) => ({ status, json: async () => body });
const inst = { securityId: '900001', exchangeSegment: 'NSE_EQ', instrument: 'EQUITY' };

// ---- chunking at the verified 90-day limit
test('chunkRange: 89-day chunks never exceed the verified 90-day limit, no gaps/overlap', () => {
  const ch = chunkRange('2026-01-01', '2026-10-30', 89);
  for (const c of ch) assert.ok((Date.parse(c.to) - Date.parse(c.from)) / 86400000 + 1 <= 90);
  assert.equal(ch[0].from, '2026-01-01'); assert.equal(ch.at(-1).to, '2026-10-30');
  for (let i = 1; i < ch.length; i++) assert.equal(ch[i].from, addDays(ch[i - 1].to, 1));
  assert.deepEqual(chunkRange('2026-03-01', '2026-03-01', 89), [{ from: '2026-03-01', to: '2026-03-01' }]);
  assert.throws(() => chunkRange('2026-03-02', '2026-03-01', 89));
});

// ---- input validation
test('validateRequest: valid daily and 5m requests', () => {
  const d = validateRequest({ symbol: 'testco', interval: '1d', from: '2024-01-01', to: '2026-10-29' }, { now: NOW });
  assert.ok(d.ok); assert.equal(d.plan.symbol, 'TESTCO'); assert.equal(d.plan.exchangeSegment, 'NSE_EQ');
  const m = validateRequest({ symbol: 'TESTCO', interval: '5m', from: '2026-08-01', to: '2026-10-29' }, { now: NOW });
  assert.ok(m.ok); assert.equal(m.plan.chunks.length, 2);
});
test('validateRequest: rejects bad symbol, interval, segment, dates, future, >5y intraday, too many chunks', () => {
  const bad = o => validateRequest({ symbol: 'TESTCO', interval: '1d', from: '2026-01-01', to: '2026-02-01', ...o }, { now: NOW });
  assert.ok(!bad({ symbol: 'x; drop' }).ok); assert.ok(!bad({ symbol: '' }).ok); assert.ok(!bad({ symbol: 'http://evil' }).ok);
  assert.ok(!bad({ interval: '1m' }).ok); assert.ok(!bad({ exchangeSegment: 'NSE_FNO' }).ok);
  assert.ok(!bad({ from: '2026-02-30' }).ok); assert.ok(!bad({ from: '01-01-2026' }).ok);
  assert.ok(!bad({ from: '2026-03-01', to: '2026-02-01' }).ok); assert.ok(!bad({ to: '2026-11-15' }).ok);
  assert.ok(!bad({ interval: '5m', from: '2019-01-01' }).ok);
  assert.ok(!bad({ interval: '1d', from: '1990-01-01' }).ok);
  assert.ok(!validateRequest(null).ok);
  assert.ok(validateRequest({ symbol: 'TESTCO', interval: '5m', from: '2022-01-01', to: '2026-10-29' }, { now: NOW }).ok);   // ~5y is allowed (about 21 requests)
});
test('validateRequest ignores a user-supplied url/host field', () => {
  const v = validateRequest({ symbol: 'TESTCO', interval: '1d', from: '2026-01-01', to: '2026-02-01', url: 'http://evil.example', host: 'evil' }, { now: NOW });
  assert.ok(v.ok); assert.equal(JSON.stringify(v.plan).includes('evil'), false);
});

// ---- parsing, validation, duplicates, coverage
test('parseCandles: parses Dhan arrays; rejects missing arrays and length mismatch', () => {
  const rows = parseCandles(F.dailyPayload(['2026-10-26', '2026-10-27']));
  assert.equal(rows.length, 2); assert.equal(istStamp(rows[0].ts), '2026-10-26 00:00:00');
  assert.throws(() => parseCandles({ open: [] }), /missing array/);
  const p = F.dailyPayload(['2026-10-26']); p.high = [];
  assert.throws(() => parseCandles(p), /different lengths/);
});
test('validateCandles: drops duplicates, broken OHLC, bad numbers, out-of-range; never repairs', () => {
  const p = F.dailyPayload(['2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-29', '2026-11-05']);
  p.high[3] = 1;            // high below open/close -> broken OHLC
  p.close[4] = null;        // Number(null)=0 -> non-positive price
  const { candles, report } = validateCandles(parseCandles(p), { interval: '1d', from: '2026-10-26', to: '2026-10-30' });
  assert.equal(report.duplicatesDropped, 1); assert.equal(report.invalidDropped, 2); assert.equal(report.outOfRangeDropped, 1);
  assert.equal(candles.length, 2);
});
test('coverage: reports weekdays with no data and short intraday days; makes no claim they are errors', () => {
  const rows = parseCandles(F.dailyPayload(['2026-10-26', '2026-10-28']));
  const { candles } = validateCandles(rows, { interval: '1d', from: '2026-10-26', to: '2026-10-28' });
  const c = coverage(candles, { interval: '1d', from: '2026-10-26', to: '2026-10-28' });
  assert.equal(c.weekdaysWithoutData, 1); assert.deepEqual(c.weekdaysWithoutDataSample, ['2026-10-27']);
  const m = validateCandles(parseCandles(F.intradayPayload('2026-10-26', 70)), { interval: '5m', from: '2026-10-26', to: '2026-10-26' });
  assert.equal(coverage(m.candles, { interval: '5m', from: '2026-10-26', to: '2026-10-26' }).intradayDaysWithFewerThan75Bars, 1);
});

// ---- CSV
test('CSV: header, IST timestamps, injection-safe text, filename marks PARTIAL', () => {
  const { candles } = validateCandles(parseCandles(F.intradayPayload('2026-10-26', 2)), { interval: '5m', from: '2026-10-26', to: '2026-10-26' });
  const csv = toCsv(candles, { symbol: 'TESTCO', securityId: '900001', exchangeSegment: 'NSE_EQ', interval: '5m' });
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'symbol,security_id,exchange_segment,interval,timestamp_ist,date_ist,open,high,low,close,volume');
  assert.ok(lines[1].startsWith('TESTCO,900001,NSE_EQ,5m,2026-10-26 09:15:00,2026-10-26,'));
  assert.ok(toCsv(candles, { symbol: '=CMD()', securityId: '1', exchangeSegment: 'NSE_EQ', interval: '5m' }).includes("'=CMD()"));
  assert.equal(csvFilename({ symbol: 'TESTCO', interval: '1d', from: 'a', to: 'b', complete: true }), 'dhan_TESTCO_1d_a_b.csv');
  assert.ok(csvFilename({ symbol: 'T/../X', interval: '1d', from: 'a', to: 'b', complete: false }).endsWith('_PARTIAL.csv'));
  assert.ok(!csvFilename({ symbol: 'T/../X', interval: '1d', from: 'a', to: 'b', complete: false }).includes('/'));
});

// ---- redaction
test('redact: removes explicit secrets, JWT-looking strings and header-style secrets', () => {
  const s = redact(`failed token=${F.FAKE_TOKEN} access-token: abc123xyz client-id=1000000001 raw 1000000001`, [F.FAKE_TOKEN, '1000000001']);
  assert.ok(!s.includes('FAKEFAKE') && !s.includes('1000000001') && !s.includes('abc123xyz'));
  assert.ok(!redact('Bearer eyJabcdefgh12.abcdefgh12.abcdefgh12').includes('eyJabcdefgh12'));
});

// ---- client: request shape, auth, retries, rate limit
test('client request shape: daily toDate is non-inclusive; intraday uses date-time; host is fixed', () => {
  const c = createClient({ accessToken: F.FAKE_TOKEN, fetchImpl: async () => okRes({}), limits: fastLimits });
  const d = c.buildRequest({ instrument: inst, intervalKey: '1d', from: '2026-10-01', to: '2026-10-30' });
  assert.equal(d.url, 'https://api.dhan.co/v2/charts/historical'); assert.equal(d.body.toDate, '2026-10-31'); assert.equal(d.body.fromDate, '2026-10-01');
  const m = c.buildRequest({ instrument: inst, intervalKey: '5m', from: '2026-10-01', to: '2026-10-30' });
  assert.equal(m.url, 'https://api.dhan.co/v2/charts/intraday'); assert.equal(m.body.interval, '5'); assert.equal(m.body.fromDate, '2026-10-01 09:15:00');
});
test('client: sends access-token header, never puts it in URL/body', async () => {
  let seen; const c = createClient({ accessToken: F.FAKE_TOKEN, clientId: '1000000001', fetchImpl: async (u, o) => { seen = { u, o }; return okRes(F.dailyPayload(['2026-10-26'])); }, limits: fastLimits });
  await c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' });
  assert.equal(seen.o.headers['access-token'], F.FAKE_TOKEN); assert.ok(!seen.u.includes(F.FAKE_TOKEN)); assert.ok(!seen.o.body.includes(F.FAKE_TOKEN));
});
test('client: auth failure (401 / DH-901) is NOT retried', async () => {
  let calls = 0; const c = createClient({ accessToken: F.FAKE_TOKEN, fetchImpl: async () => { calls++; return errRes(401, { errorType: 'Invalid_Authentication', errorCode: 'DH-901', errorMessage: 'bad' }); }, sleepImpl: noSleep, limits: fastLimits });
  await assert.rejects(c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' }), e => e.kind === 'AUTH');
  assert.equal(calls, 1);
});
test('client: not subscribed (DH-902), invalid input (DH-905/813) classified, not retried', async () => {
  for (const [code, kind] of [['DH-902', 'SUBSCRIPTION'], ['DH-905', 'INPUT'], ['813', 'INPUT'], ['DH-907', 'DATA']]) {
    let calls = 0; const c = createClient({ accessToken: 'x'.repeat(10), fetchImpl: async () => { calls++; return errRes(400, { errorCode: code }); }, sleepImpl: noSleep, limits: fastLimits });
    await assert.rejects(c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' }), e => e.kind === kind);
    assert.equal(calls, 1);
  }
});
test('client: rate limit retries are bounded (1 + maxRetries calls) then RATE_LIMIT', async () => {
  let calls = 0; const c = createClient({ accessToken: 'x'.repeat(10), fetchImpl: async () => { calls++; return errRes(429, { errorCode: 'DH-904' }); }, sleepImpl: noSleep, limits: fastLimits });
  await assert.rejects(c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' }), e => e.kind === 'RATE_LIMIT' && e.attempts === 4);
  assert.equal(calls, 4);
});
test('client: transient 500 then success is retried; network failure is bounded', async () => {
  let n = 0; const c = createClient({ accessToken: 'x'.repeat(10), fetchImpl: async () => (++n < 3 ? errRes(500, { errorCode: 'DH-908' }) : okRes(F.dailyPayload(['2026-10-26']))), sleepImpl: noSleep, limits: fastLimits });
  const out = await c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' }); assert.equal(out.open.length, 1); assert.equal(n, 3);
  let k = 0; const c2 = createClient({ accessToken: 'x'.repeat(10), fetchImpl: async () => { k++; throw new Error('boom ' + F.FAKE_TOKEN); }, sleepImpl: noSleep, limits: fastLimits });
  await assert.rejects(c2.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' }), e => e.kind === 'TRANSIENT' && !e.message.includes('FAKEFAKE'));
  assert.equal(k, 4);
});
test('client: throttle spaces calls by minGapMs', async () => {
  const waits = []; const c = createClient({ accessToken: 'x'.repeat(10), fetchImpl: async () => okRes({}), sleepImpl: async ms => { waits.push(ms); }, limits: { ...fastLimits, minGapMs: 260 } });
  await c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' });
  await c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' });
  assert.ok(waits.length >= 1 && waits.every(w => w > 0 && w <= 260));
});
test('client: missing token fails closed without any request', async () => {
  let calls = 0; const c = createClient({ accessToken: '', fetchImpl: async () => { calls++; return okRes({}); }, limits: fastLimits });
  await assert.rejects(c.fetchChunk({ instrument: inst, intervalKey: '1d', from: '2026-10-26', to: '2026-10-26' }), e => e.kind === 'NOT_CONFIGURED'); assert.equal(calls, 0);
});

// ---- service: complete / empty / partial / failed
const planFor = (interval, from, to) => validateRequest({ symbol: 'TESTCO', interval, from, to }, { now: NOW }).plan;
test('service: complete 5m download across 2 chunks, CSV produced, no duplicates at chunk edges', async () => {
  const plan = planFor('5m', '2026-08-01', '2026-10-29'); assert.equal(plan.chunks.length, 2);
  const client = { fetchChunk: async ({ from }) => from === '2026-08-01' ? F.intradayPayload('2026-08-03', 75) : F.intradayPayload('2026-10-29', 75) };
  const r = await runDownload({ plan, instrument: inst, client });
  assert.equal(r.status, 'complete'); assert.equal(r.complete, true); assert.equal(r.report.candleCount, 150); assert.ok(r.csv.split('\n').length === 152); assert.ok(!r.filename.includes('PARTIAL'));
});
test('service: empty response for every chunk => no_data, no CSV, nothing fabricated', async () => {
  const r = await runDownload({ plan: planFor('1d', '2026-10-01', '2026-10-29'), instrument: inst, client: { fetchChunk: async () => ({}) } });
  assert.equal(r.status, 'no_data'); assert.equal(r.csv, null); assert.equal(r.report.candleCount, 0);
});
test('service: partial download is labelled PARTIAL and never "complete"', async () => {
  const plan = planFor('5m', '2026-08-01', '2026-10-29'); let n = 0;
  const client = { fetchChunk: async () => { if (++n === 2) throw new DhanError('TRANSIENT', 'Network error or timeout talking to Dhan.'); return F.intradayPayload('2026-08-03', 75); } };
  const r = await runDownload({ plan, instrument: inst, client });
  assert.equal(r.status, 'partial'); assert.equal(r.complete, false); assert.ok(r.filename.endsWith('_PARTIAL.csv')); assert.equal(r.report.requestsFailed, 1);
  assert.ok(r.report.warnings.some(w => w.startsWith('PARTIAL')));
});
test('service: auth error stops the job; remaining chunks are not_attempted; status failed', async () => {
  const plan = planFor('5m', '2026-05-01', '2026-10-29'); let n = 0;
  const r = await runDownload({ plan, instrument: inst, client: { fetchChunk: async () => { n++; throw new DhanError('AUTH', 'Dhan returned HTTP 401 (DH-901).'); } } });
  assert.equal(n, 1); assert.equal(r.status, 'failed'); assert.ok(r.report.chunks.slice(1).every(c => c.status === 'not_attempted'));
});
test('service: duplicate candles inside a response are dropped and reported', async () => {
  const p = F.dailyPayload(['2026-10-26', '2026-10-26', '2026-10-27']);
  const r = await runDownload({ plan: planFor('1d', '2026-10-26', '2026-10-27'), instrument: inst, client: { fetchChunk: async () => p } });
  assert.equal(r.report.candleCount, 2); assert.equal(r.report.validation.duplicatesDropped, 1);
});
test('service: malformed response becomes a failed chunk, not a crash', async () => {
  const r = await runDownload({ plan: planFor('1d', '2026-10-26', '2026-10-27'), instrument: inst, client: { fetchChunk: async () => ({ open: [1] }) } });
  assert.equal(r.status, 'failed'); assert.equal(r.report.chunks[0].kind, 'MALFORMED');
});

// ---- instruments
test('instrument master: only NSE equity EQ rows; derivative/BSE rows skipped; never hard-coded', () => {
  const m = parseScripMaster(F.SCRIP_MASTER_CSV);
  assert.equal(m.bySymbol.size, 2); assert.equal(m.bySymbol.get('TESTCO').securityId, '900001'); assert.ok(!m.bySymbol.has('BSEONLY'));
  const missing = loadInstruments(path.join(os.tmpdir(), 'does-not-exist-' + crypto.randomBytes(4).toString('hex') + '.csv')); assert.equal(missing.ok, false);
  const f = path.join(os.tmpdir(), 'scrip-' + crypto.randomBytes(4).toString('hex') + '.csv'); fs.writeFileSync(f, F.SCRIP_MASTER_CSV);
  const ok = loadInstruments(f); assert.ok(ok.ok && ok.count === 2 && ok.ageDays === 0); fs.unlinkSync(f);
  const src = fs.readFileSync(path.join(__dirname, '../src/dhanHistorical/instruments.js'), 'utf8'); assert.ok(!/fetch\(|https\.get|http\.get/.test(src));
});

// ---- job store
test('job store: per-user privacy, one running job, per-minute cap, expiry', () => {
  let t = 1000; const s = createJobStore({ limits: fastLimits, now: () => t });
  assert.ok(s.canStart('u1').ok); const j = s.create('u1', { chunks: [1] });
  assert.equal(s.get('u2', j.id), null); assert.ok(s.get('u1', j.id));
  assert.equal(s.canStart('u1').ok, false);                 // still running
  j.state = 'complete'; assert.ok(s.canStart('u1').ok);
  t += 700000; assert.equal(s.get('u1', j.id), null);       // expired
});

// ---- HTTP routes (auth, headers, partial reporting, secret never in response)
function startApp(opts) {
  const app = express();
  const fakeAuth = (req, res, next) => { const u = req.headers['x-test-user']; if (!u) return res.status(401).json({ error: 'Authentication required.' }); req.userId = u; next(); };
  const fakeAdmin = (req, res, next) => (req.headers['x-test-admin'] === 'yes' ? next() : res.status(403).json({ error: 'admin only' }));
  app.use('/api/dhan/historical', fakeAuth, fakeAdmin, createDhanHistoricalRouter(opts));
  return new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port })); });
}
const call = (port, method, p, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, res => {
    let buf = ''; res.on('data', d => { buf += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf }));
  }); req.on('error', reject); if (data) req.write(data); req.end();
});
const waitJob = async (port, id, hdr) => { for (let i = 0; i < 200; i++) { const r = await call(port, 'GET', `/api/dhan/historical/jobs/${id}`, { headers: hdr }); const j = JSON.parse(r.text); if (j.state !== 'running') return j; await new Promise(r => setTimeout(r, 10)); } throw new Error('job did not finish'); };
const U = { 'x-test-user': 'u1', 'x-test-admin': 'yes' };
const masterOk = () => parseScripMaster(F.SCRIP_MASTER_CSV) && { ok: true, ...(() => { const m = parseScripMaster(F.SCRIP_MASTER_CSV); return { bySymbol: m.bySymbol, count: m.bySymbol.size, fileModified: 'test', ageDays: 0, stale: false, source: 'test' }; })() };

test('routes: unauthenticated => 401, non-admin => 403', async () => {
  const { srv, port } = await startApp({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN }, loadInstrumentsImpl: masterOk });
  try {
    assert.equal((await call(port, 'GET', '/api/dhan/historical/status')).status, 401);
    assert.equal((await call(port, 'GET', '/api/dhan/historical/status', { headers: { 'x-test-user': 'u1' } })).status, 403);
  } finally { srv.close(); }
});
test('routes: status never exposes the token; no token => POST /jobs is 503', async () => {
  const { srv, port } = await startApp({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN, DHAN_CLIENT_ID: '1000000001' }, loadInstrumentsImpl: masterOk });
  const { srv: s2, port: p2 } = await startApp({ env: {}, loadInstrumentsImpl: masterOk });
  try {
    const r = await call(port, 'GET', '/api/dhan/historical/status', { headers: U });
    assert.equal(r.status, 200); assert.ok(!r.text.includes('FAKEFAKE') && !r.text.includes('1000000001')); assert.equal(JSON.parse(r.text).tokenConfigured, true);
    const n = await call(p2, 'POST', '/api/dhan/historical/jobs', { headers: U, body: { symbol: 'TESTCO', interval: '1d', from: '2026-10-01', to: '2026-10-02' } });
    assert.equal(n.status, 503);
  } finally { srv.close(); s2.close(); }
});
test('routes: invalid input => 400; unknown symbol => 404; missing instrument file => 503', async () => {
  const { srv, port } = await startApp({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN }, loadInstrumentsImpl: masterOk });
  const { srv: s2, port: p2 } = await startApp({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN }, loadInstrumentsImpl: () => ({ ok: false, reason: 'no file' }) });
  try {
    assert.equal((await call(port, 'POST', '/api/dhan/historical/jobs', { headers: U, body: { symbol: 'TESTCO', interval: '9m', from: '2026-10-01', to: '2026-10-02' } })).status, 400);
    assert.equal((await call(port, 'POST', '/api/dhan/historical/jobs', { headers: U, body: { symbol: 'NOPE', interval: '1d', from: '2026-01-01', to: '2026-01-31' } })).status, 404);
    assert.equal((await call(p2, 'POST', '/api/dhan/historical/jobs', { headers: U, body: { symbol: 'TESTCO', interval: '1d', from: '2026-01-01', to: '2026-01-31' } })).status, 503);
  } finally { srv.close(); s2.close(); }
});
test('routes: full flow with mocked Dhan => progress, report, CSV download headers, privacy between users', async () => {
  const calls = []; const fetchImpl = async (url, o) => { calls.push({ url, o }); return okRes(F.dailyPayload(['2026-10-01', '2026-10-05'])); };
  const { srv, port } = await startApp({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN }, loadInstrumentsImpl: masterOk, fetchImpl, clientFactory: o => createClient({ ...o, limits: fastLimits }) });
  try {
    const start = await call(port, 'POST', '/api/dhan/historical/jobs', { headers: U, body: { symbol: 'testco', interval: '1d', from: '2026-10-01', to: '2026-10-05' } });
    assert.equal(start.status, 202); const { jobId } = JSON.parse(start.text);
    const done = await waitJob(port, jobId, U);
    assert.equal(done.state, 'complete'); assert.equal(done.complete, true); assert.equal(done.report.candleCount, 2); assert.equal(done.report.requestedFrom, '2026-10-01');
    assert.ok(!JSON.stringify(done).includes('FAKEFAKE'));
    const csv = await call(port, 'GET', `/api/dhan/historical/jobs/${jobId}/csv`, { headers: U });
    assert.equal(csv.status, 200); assert.match(csv.headers['content-type'], /^text\/csv; charset=utf-8/);
    assert.match(csv.headers['content-disposition'], /^attachment; filename="dhan_TESTCO_1d_2026-10-01_2026-10-05\.csv"$/);
    assert.equal(csv.headers['x-dhan-complete'], 'true'); assert.equal(csv.headers['cache-control'], 'no-store'); assert.equal(csv.headers['x-content-type-options'], 'nosniff');
    assert.ok(csv.text.startsWith('symbol,security_id,'));
    assert.equal((await call(port, 'GET', `/api/dhan/historical/jobs/${jobId}/csv`, { headers: { 'x-test-user': 'u2', 'x-test-admin': 'yes' } })).status, 404);
    assert.ok(calls.every(c => c.url.startsWith('https://api.dhan.co/')));
  } finally { srv.close(); }
});
test('routes: partial result is reported partial and CSV is marked incomplete', async () => {
  let n = 0; const fetchImpl = async () => (++n >= 2 ? errRes(500, { errorCode: 'DH-908' }) : okRes(F.intradayPayload('2026-05-04', 75)));
  const { srv, port } = await startApp({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN }, loadInstrumentsImpl: masterOk, fetchImpl, clientFactory: o => createClient({ ...o, sleepImpl: noSleep, limits: { ...fastLimits, maxRetries: 1 } }) });
  try {
    const s = await call(port, 'POST', '/api/dhan/historical/jobs', { headers: U, body: { symbol: 'TESTCO', interval: '5m', from: '2026-05-01', to: '2026-10-29' } });
    const done = await waitJob(port, JSON.parse(s.text).jobId, U);
    assert.equal(done.state, 'partial'); assert.equal(done.complete, false);
    const csv = await call(port, 'GET', `/api/dhan/historical/jobs/${JSON.parse(s.text).jobId}/csv`, { headers: U });
    assert.equal(csv.headers['x-dhan-complete'], 'false'); assert.match(csv.headers['content-disposition'], /_PARTIAL\.csv/);
  } finally { srv.close(); }
});

// ---- V15 frozen guarantee + isolation
test('isolation: dhanHistorical never imports scoring/engine files; no frozen V15 file differs from main', () => {
  const dir = path.join(__dirname, '../src/dhanHistorical');
  const forbidden = /scannerEngine|scanMaterializer|accumulation\/(engine|config)|hiddenGems|ruleEngine|require\(['"]pg['"]\)/;
  for (const f of fs.readdirSync(dir)) assert.ok(!forbidden.test(fs.readFileSync(path.join(dir, f), 'utf8')), `${f} imports forbidden module`);
  const { spawnSync } = require('node:child_process');
  const root = path.join(__dirname, '..', '..');
  const git = spawnSync('git', ['rev-parse', '--verify', 'main'], { cwd: root });
  if (git.status === 0) {    // only meaningful inside a git checkout that has a main branch
    const frozen = ['accumulation/engine.js', 'accumulation/config.js', 'server/src/scannerEngine.js', 'server/src/scanMaterializer.js', 'backtest/REAL_1YEAR_BACKTEST_RESULT.json'];
    const d = spawnSync('git', ['diff', '--name-only', 'main', '--', ...frozen], { cwd: root });
    assert.equal(String(d.stdout).trim(), '', 'a frozen V15 file differs from main');
  }
});
test('security: source has no hard-coded token, no user-controlled URL, no NSE host', () => {
  const dir = path.join(__dirname, '../src/dhanHistorical');
  const all = fs.readdirSync(dir).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(all)); assert.ok(!new RegExp(['nse' + 'india', 'nse' + 'archives', 'nifty' + 'indices'].join('|'), 'i').test(all));
  assert.equal((all.match(/https:\/\/api\.dhan\.co/g) || []).length, 1);
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('ok   - ' + name); } catch (e) { console.error('FAIL - ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${queue.length} dhanHistorical tests passed`);
  process.exit(process.exitCode || 0);
})();
