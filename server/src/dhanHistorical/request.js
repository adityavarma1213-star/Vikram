'use strict';
const { INTERVALS, SUPPORTED_SEGMENTS, LIMITS } = require('./config');
const { isValidDateStr, diffDays, addDays, todayIst } = require('./dates');
const { chunkRange } = require('./chunker');

// Validates user input and returns a clean plan. Only whitelisted fields are read.
function validateRequest(body, { now = Date.now() } = {}) {
  const errors = [];
  const b = body && typeof body === 'object' ? body : {};
  const symbol = typeof b.symbol === 'string' ? b.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9&-]{1,30}$/.test(symbol)) errors.push('symbol must be 1-30 letters/digits (A-Z, 0-9, & or -).');
  const intervalKey = String(b.interval || '');
  const cfg = INTERVALS[intervalKey];
  if (!cfg) errors.push(`interval must be one of: ${Object.keys(INTERVALS).join(', ')}.`);
  const exchangeSegment = b.exchangeSegment === undefined ? 'NSE_EQ' : String(b.exchangeSegment);
  if (!SUPPORTED_SEGMENTS.includes(exchangeSegment)) errors.push(`exchangeSegment must be one of: ${SUPPORTED_SEGMENTS.join(', ')}.`);
  const today = todayIst(now);
  if (!isValidDateStr(b.from)) errors.push('from must be a real date in YYYY-MM-DD format.');
  if (!isValidDateStr(b.to)) errors.push('to must be a real date in YYYY-MM-DD format.');
  let chunks = [];
  if (!errors.length) {
    if (diffDays(b.from, b.to) < 0) errors.push('from must not be after to.');
    if (diffDays(today, b.to) > 0) errors.push(`to must not be in the future (today in IST is ${today}).`);
    if (cfg.maxHistoryYears) {
      const earliest = addDays(today, -365 * cfg.maxHistoryYears);
      if (diffDays(earliest, b.from) < 0) errors.push(`${cfg.label} data is documented for the last ${cfg.maxHistoryYears} years only (earliest ${earliest}).`);
    } else if (diffDays(b.from, b.to) > 365 * LIMITS.maxDailyYears) {
      errors.push(`Daily range is limited to ${LIMITS.maxDailyYears} years per download.`);
    }
  }
  if (!errors.length) {
    chunks = chunkRange(b.from, b.to, cfg.chunkDays);
    if (chunks.length > LIMITS.maxChunksPerJob) errors.push(`Range needs ${chunks.length} requests; the limit is ${LIMITS.maxChunksPerJob}. Choose a shorter range.`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: { symbol, intervalKey, exchangeSegment, from: b.from, to: b.to, chunks } };
}

module.exports = { validateRequest };
