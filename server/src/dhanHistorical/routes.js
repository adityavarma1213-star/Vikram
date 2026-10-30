'use strict';
const express = require('express');
const { INTERVALS, LIMITS } = require('./config');
const { validateRequest } = require('./request');
const { loadInstruments, lookupSymbol, searchSymbols } = require('./instruments');
const { createClient } = require('./client');
const { runDownload, createJobStore } = require('./service');
const { redact } = require('./redact');

// Mounted by index.js behind requireAuth + requireAdmin. Credentials come from the server
// environment only (DHAN_ACCESS_TOKEN, optional DHAN_CLIENT_ID) and are never sent to the browser.
function createDhanHistoricalRouter({ env = process.env, fetchImpl, loadInstrumentsImpl = loadInstruments, jobStore = createJobStore(), clientFactory = createClient, log = console.error } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '2kb' }));
  const secrets = () => [env.DHAN_ACCESS_TOKEN, env.DHAN_CLIENT_ID];
  const safeLog = m => log(redact(m, secrets()));
  const noStore = (res) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); };

  router.get('/status', (_req, res) => {
    noStore(res);
    const master = loadInstrumentsImpl();
    res.json({
      tokenConfigured: Boolean(env.DHAN_ACCESS_TOKEN),
      instrumentMaster: master.ok ? { ok: true, count: master.count, fileModified: master.fileModified, ageDays: master.ageDays, stale: master.stale, source: master.source } : { ok: false, reason: master.reason },
      intervals: Object.entries(INTERVALS).map(([key, c]) => ({ key, label: c.label, maxDaysPerRequest: c.maxDaysPerRequest, limitVerified: c.limitVerified, chunkDays: c.chunkDays, maxHistoryYears: c.maxHistoryYears })),
      limits: { maxChunksPerJob: LIMITS.maxChunksPerJob, maxRowsPerJob: LIMITS.maxRowsPerJob },
      liveAccess: 'Requires a paid Dhan Data API subscription and a valid 24-hour access token. Not verified from this code.',
    });
  });

  router.get('/instruments', (req, res) => {
    noStore(res);
    const master = loadInstrumentsImpl();
    if (!master.ok) return res.status(503).json({ error: master.reason });
    res.json({ results: searchSymbols(master, req.query.q, 20).map(i => ({ symbol: i.symbol, name: i.name })) });
  });

  router.post('/jobs', (req, res) => {
    noStore(res);
    const userId = String(req.userId);
    if (!env.DHAN_ACCESS_TOKEN) return res.status(503).json({ error: 'Dhan access token is not configured on this server. Live downloads are unavailable.' });
    const v = validateRequest(req.body);
    if (!v.ok) return res.status(400).json({ error: 'Invalid request.', details: v.errors });
    const master = loadInstrumentsImpl();
    if (!master.ok) return res.status(503).json({ error: master.reason });
    const instrument = lookupSymbol(master, v.plan.symbol);
    if (!instrument) return res.status(404).json({ error: `Symbol ${v.plan.symbol} was not found in the official Dhan instrument list for NSE equity.` });
    const gate = jobStore.canStart(userId);
    if (!gate.ok) return res.status(429).json({ error: gate.reason });

    const job = jobStore.create(userId, v.plan);
    const client = clientFactory({ accessToken: env.DHAN_ACCESS_TOKEN, clientId: env.DHAN_CLIENT_ID, fetchImpl, log: safeLog });
    runDownload({ plan: v.plan, instrument, client, onProgress: p => { job.progress = p; } })
      .then(r => { job.result = r; job.progress = { chunksDone: r.report.requestsTotal, chunksTotal: r.report.requestsTotal }; job.state = r.status; })
      .catch(e => { job.state = 'failed'; job.error = redact('Download failed unexpectedly: ' + e.message, secrets()); safeLog(job.error); });
    res.status(202).json({ jobId: job.id, chunksTotal: v.plan.chunks.length });
  });

  router.get('/jobs/:id', (req, res) => {
    noStore(res);
    const job = jobStore.get(req.userId, req.params.id);
    if (!job) return res.status(404).json({ error: 'Download not found or expired.' });
    res.json({ state: job.state, progress: job.progress, error: job.error, report: job.result ? job.result.report : null, csvAvailable: Boolean(job.result && job.result.csv), complete: Boolean(job.result && job.result.complete) });
  });

  router.get('/jobs/:id/csv', (req, res) => {
    noStore(res);
    const job = jobStore.get(req.userId, req.params.id);
    if (!job || !job.result || !job.result.csv) return res.status(404).json({ error: 'No file available for this download.' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${job.result.filename}"`);
    res.setHeader('X-Dhan-Complete', String(job.result.complete));
    res.send(job.result.csv);
  });

  return router;
}

module.exports = { createDhanHistoricalRouter };
