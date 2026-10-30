'use strict';
const crypto = require('node:crypto');
const { INTERVALS, LIMITS } = require('./config');
const { createClient, DhanError } = require('./client');
const { parseCandles, validateCandles, coverage } = require('./validate');
const { toCsv, csvFilename } = require('./csv');
const { redact } = require('./redact');
const { istStamp } = require('./dates');

// Runs one download plan. Never fabricates candles. Never substitutes another provider.
async function runDownload({ plan, instrument, client, onProgress = () => {}, limits = LIMITS }) {
  const chunkReports = []; const all = []; let aborted = null; let rawRows = 0;
  const agg = { received: 0, duplicatesDropped: 0, invalidDropped: 0, outOfRangeDropped: 0, invalidExamples: [] };
  for (let i = 0; i < plan.chunks.length; i++) {
    const ch = plan.chunks[i];
    if (aborted) { chunkReports.push({ ...ch, status: 'not_attempted', reason: aborted.reason }); continue; }
    onProgress({ chunksDone: i, chunksTotal: plan.chunks.length, currentFrom: ch.from, currentTo: ch.to });
    try {
      const raw = await client.fetchChunk({ instrument, intervalKey: plan.intervalKey, from: ch.from, to: ch.to });
      const isEmptyObj = raw && typeof raw === 'object' && !Object.keys(raw).length;
      const rows = isEmptyObj ? [] : parseCandles(raw);
      rawRows += rows.length;
      const { candles, report } = validateCandles(rows, { interval: plan.intervalKey, from: ch.from, to: ch.to });
      for (const k of ['received', 'duplicatesDropped', 'invalidDropped', 'outOfRangeDropped']) agg[k] += report[k];
      for (const e of report.invalidExamples) if (agg.invalidExamples.length < 5) agg.invalidExamples.push(e);
      all.push(...candles);
      chunkReports.push({ ...ch, status: candles.length ? 'ok' : 'empty', candles: candles.length });
      if (all.length > limits.maxRowsPerJob) { aborted = { reason: 'Row limit reached for one download.' }; }
    } catch (e) {
      const kind = e instanceof DhanError ? e.kind : 'MALFORMED';
      const msg = e instanceof DhanError ? e.message : redact('Response could not be understood: ' + e.message);
      chunkReports.push({ ...ch, status: 'failed', kind, reason: msg });
      // Problems that will repeat for every chunk stop the job; others only fail this chunk.
      if (['AUTH', 'SUBSCRIPTION', 'NOT_CONFIGURED', 'INPUT', 'RATE_LIMIT'].includes(kind)) aborted = { reason: `Stopped after ${kind} error.` };
    }
  }
  // Merge across chunks: de-duplicate again (chunk edges) and sort.
  const seen = new Set(); const merged = [];
  for (const c of all.sort((a, b) => a.ts - b.ts)) { if (seen.has(c.ts)) { agg.duplicatesDropped++; continue; } seen.add(c.ts); merged.push(c); }

  const failed = chunkReports.filter(c => c.status === 'failed' || c.status === 'not_attempted');
  const empty = chunkReports.filter(c => c.status === 'empty');
  let status;
  if (failed.length === 0 && merged.length > 0) status = 'complete';
  else if (failed.length === 0 && merged.length === 0) status = 'no_data';
  else if (merged.length > 0) status = 'partial';
  else status = 'failed';

  const warnings = [];
  if (status === 'partial') warnings.push(`PARTIAL: ${failed.length} of ${chunkReports.length} requests did not succeed. Do not treat this file as complete.`);
  if (empty.length) warnings.push(`${empty.length} request period(s) returned no candles (could be holidays or no listing yet).`);
  if (agg.duplicatesDropped) warnings.push(`${agg.duplicatesDropped} duplicate candle(s) were dropped.`);
  if (agg.invalidDropped) warnings.push(`${agg.invalidDropped} invalid candle(s) were dropped (not repaired). Examples: ${agg.invalidExamples.join('; ')}`);
  if (agg.outOfRangeDropped) warnings.push(`${agg.outOfRangeDropped} candle(s) outside the requested dates were dropped.`);

  const cov = coverage(merged, { interval: plan.intervalKey, from: plan.from, to: plan.to });
  if (cov.weekdaysWithoutData > 0) warnings.push(`${cov.weekdaysWithoutData} weekday(s) in the range have no candles (may be exchange holidays).`);
  if (plan.intervalKey === '5m' && cov.intradayDaysWithFewerThan75Bars) warnings.push(`${cov.intradayDaysWithFewerThan75Bars} day(s) have fewer than 75 five-minute bars.`);

  const complete = status === 'complete';
  const csv = merged.length ? toCsv(merged, { symbol: plan.symbol, securityId: instrument.securityId, exchangeSegment: plan.exchangeSegment, interval: plan.intervalKey }) : null;
  return {
    status, complete,
    report: {
      symbol: plan.symbol, interval: plan.intervalKey, intervalLabel: INTERVALS[plan.intervalKey].label, exchangeSegment: plan.exchangeSegment,
      requestedFrom: plan.from, requestedTo: plan.to,
      requestsTotal: chunkReports.length, requestsOk: chunkReports.filter(c => c.status === 'ok' || c.status === 'empty').length, requestsFailed: failed.length,
      candleCount: merged.length, actualFrom: merged.length ? istStamp(merged[0].ts) : null, actualTo: merged.length ? istStamp(merged[merged.length - 1].ts) : null,
      timezone: 'IST (UTC+05:30)', validation: { ...agg, kept: merged.length }, coverage: cov, chunks: chunkReports, warnings,
    },
    csv, filename: csv ? csvFilename({ symbol: plan.symbol, interval: plan.intervalKey, from: plan.from, to: plan.to, complete }) : null,
  };
}

// In-memory job store: private per user, auto-expiring, never written to disk or database.
function createJobStore({ limits = LIMITS, now = () => Date.now() } = {}) {
  const jobs = new Map(); const startLog = new Map();
  const sweep = () => { for (const [id, j] of jobs) if (now() - j.createdAt > limits.jobTtlMs) jobs.delete(id); };
  // No timers/background work: expired jobs are swept lazily on every access.
  return {
    canStart(userId) {
      sweep();
      const mine = [...jobs.values()].filter(j => j.userId === userId);
      if (mine.filter(j => j.state === 'running').length >= 1) return { ok: false, reason: 'You already have a download running. Wait for it to finish.' };
      if (mine.length >= limits.maxJobsPerUser) return { ok: false, reason: 'Too many stored downloads. Wait for older ones to expire (10 minutes).' };
      const recent = (startLog.get(userId) || []).filter(t => now() - t < 60000);
      if (recent.length >= limits.maxStartsPerMinutePerUser) return { ok: false, reason: 'Too many download requests. Try again in a minute.' };
      recent.push(now()); startLog.set(userId, recent);
      return { ok: true };
    },
    create(userId, plan) {
      const id = crypto.randomBytes(16).toString('hex');
      const job = { id, userId: String(userId), createdAt: now(), state: 'running', progress: { chunksDone: 0, chunksTotal: plan.chunks.length }, result: null, error: null };
      jobs.set(id, job); return job;
    },
    get(userId, id) { sweep(); const j = jobs.get(String(id)); return j && j.userId === String(userId) && now() - j.createdAt <= limits.jobTtlMs ? j : null; },
    _size: () => jobs.size,
  };
}

module.exports = { runDownload, createJobStore };
