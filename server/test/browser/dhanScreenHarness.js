'use strict';
// Test harness for the browser test. Serves the real frontend files and the REAL Dhan router,
// but with a fake login and a MOCKED Dhan API returning SYNTHETIC candles (not real market data).
// Usage: HARNESS_MODE=complete|partial PORT=4555 node server/test/browser/dhanScreenHarness.js
const path = require('node:path'); const express = require('express');
const F = require('../fixtures/dhanSynthetic');
const { createDhanHistoricalRouter } = require('../../src/dhanHistorical/routes');
const { createClient } = require('../../src/dhanHistorical/client');
const { parseScripMaster } = require('../../src/dhanHistorical/instruments');
const mode = process.env.HARNESS_MODE || 'complete'; let calls = 0;
const m = parseScripMaster(F.SCRIP_MASTER_CSV);
const master = { ok: true, bySymbol: m.bySymbol, count: m.bySymbol.size, fileModified: 'synthetic-test', ageDays: 0, stale: false, source: 'synthetic' };
const fetchImpl = async (_u, o) => {
  calls++; const b = JSON.parse(o.body);
  if (mode === 'partial' && calls >= 2) return { status: 500, json: async () => ({ errorCode: 'DH-908' }) };
  const day = b.fromDate.slice(0, 10);
  const payload = b.interval ? F.intradayPayload(day <= '2026-05-04' ? '2026-05-04' : day, 75) : F.dailyPayload(['2026-10-26', '2026-10-27', '2026-10-28']);
  return { status: 200, json: async () => payload };
};
const app = express();
app.get('/__calls', (_q, r) => r.json({ calls }));
app.post('/api/auth/login', express.json(), (_q, r) => r.json({ token: 'test-token' }));
app.use('/api/dhan/historical', (req, res, next) => { if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ error: 'auth' }); req.userId = 'u1'; next(); },
  createDhanHistoricalRouter({ env: { DHAN_ACCESS_TOKEN: F.FAKE_TOKEN }, loadInstrumentsImpl: () => master, fetchImpl, clientFactory: o => createClient({ ...o, limits: { minGapMs: 0, timeoutMs: 1000, maxRetries: 0, retryBaseMs: 1 } }), log: () => {} }));
app.use(express.static(path.resolve(__dirname, '..', '..', '..')));
app.listen(Number(process.env.PORT) || 4555, '127.0.0.1', () => console.log('harness ready'));
