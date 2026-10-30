'use strict';
const { DHAN_API_HOST, INTERVALS, LIMITS } = require('./config');
const { redact } = require('./redact');
const { addDays } = require('./dates');

class DhanError extends Error { constructor(kind, message, extra = {}) { super(message); this.name = 'DhanError'; this.kind = kind; Object.assign(this, extra); } }
// kinds: AUTH, SUBSCRIPTION, RATE_LIMIT, INPUT, DATA, TRANSIENT, MALFORMED, NOT_CONFIGURED

// Verified against https://dhanhq.co/docs/v2/annexure/ (Trading API Error + Data API Error tables).
const AUTH_CODES = new Set(['DH-901', '807', '808', '809', '810']);
const SUBSCRIPTION_CODES = new Set(['DH-902', '806']);
const RATE_CODES = new Set(['DH-904', '805']);
const INPUT_CODES = new Set(['DH-905', '811', '812', '813', '814']);
const DATA_CODES = new Set(['DH-907']);
const TRANSIENT_CODES = new Set(['DH-908', 'DH-909', 'DH-910', '800']);

function classify(status, body) {
  const code = String((body && body.errorCode) || '');
  if (AUTH_CODES.has(code) || status === 401) return 'AUTH';
  if (SUBSCRIPTION_CODES.has(code)) return 'SUBSCRIPTION';
  if (RATE_CODES.has(code) || status === 429) return 'RATE_LIMIT';
  if (INPUT_CODES.has(code)) return 'INPUT';
  if (DATA_CODES.has(code)) return 'DATA';
  if (TRANSIENT_CODES.has(code) || status >= 500) return 'TRANSIENT';
  if (status === 403) return 'AUTH';
  return 'INPUT';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function createClient({ accessToken, clientId, fetchImpl = globalThis.fetch, sleepImpl = sleep, limits = LIMITS, log = () => {} } = {}) {
  const secrets = [accessToken, clientId];
  let lastCall = 0;
  const safeLog = m => log(redact(m, secrets));

  async function throttle() {
    const wait = lastCall + limits.minGapMs - Date.now();
    if (wait > 0) await sleepImpl(wait);
    lastCall = Date.now();
  }

  function buildRequest({ instrument, intervalKey, from, to }) {
    const cfg = INTERVALS[intervalKey];
    if (!cfg) throw new DhanError('INPUT', 'Unsupported interval.');
    const body = { securityId: String(instrument.securityId), exchangeSegment: instrument.exchangeSegment, instrument: instrument.instrument, oi: false };
    if (cfg.apiInterval) { body.interval = String(cfg.apiInterval); body.fromDate = `${from} 09:15:00`; body.toDate = `${to} 15:30:00`; }
    else { body.fromDate = from; body.toDate = addDays(to, 1); }   // daily toDate is NON-inclusive per docs
    return { url: DHAN_API_HOST + cfg.endpoint, body };               // host is a constant, never user input
  }

  async function fetchChunk(args) {
    if (!accessToken) throw new DhanError('NOT_CONFIGURED', 'Dhan access token is not configured on the server.');
    const { url, body } = buildRequest(args);
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'access-token': accessToken };
    if (clientId) headers['client-id'] = clientId;
    let attempt = 0;
    for (;;) {
      attempt++;
      await throttle();
      let status = 0, json = null, networkFail = false;
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), limits.timeoutMs);
      try {
        const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal, redirect: 'error' });
        status = res.status;
        try { json = await res.json(); } catch (_e) { json = null; }
      } catch (_e) { networkFail = true; } finally { clearTimeout(timer); }

      if (!networkFail && status >= 200 && status < 300) {
        if (json === null) throw new DhanError('MALFORMED', 'Dhan returned a response that is not valid JSON.');
        return json;
      }
      const kind = networkFail ? 'TRANSIENT' : classify(status, json);
      const retryable = kind === 'TRANSIENT' || kind === 'RATE_LIMIT';
      const code = json && json.errorCode ? json.errorCode : null;
      const msg = networkFail ? 'Network error or timeout talking to Dhan.' : `Dhan returned HTTP ${status}${code ? ' (' + code + ')' : ''}.`;
      if (retryable && attempt <= limits.maxRetries) {
        const delay = limits.retryBaseMs * 2 ** (attempt - 1) * (kind === 'RATE_LIMIT' ? 2 : 1);
        safeLog(`dhan retry ${attempt}/${limits.maxRetries} after ${delay}ms: ${msg}`);
        await sleepImpl(delay); continue;
      }
      throw new DhanError(kind, redact(msg, secrets), { status, code, attempts: attempt });
    }
  }
  return { fetchChunk, buildRequest };
}

module.exports = { createClient, DhanError, classify };
