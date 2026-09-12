// AUDIT FOLLOW-UP (§2): nseDownloader.js previously made a single, unbounded
// fetch() per candidate URL — no timeout, no retry, no backoff. This module
// adds all three, with an explicit, disclosed retry classification so a
// transient failure and a genuinely terminal one are never treated the same
// way:
//
//   RETRYABLE   — network error (DNS/connect/reset), request timeout, HTTP
//                 429 (rate limited), HTTP 5xx (server error). Retried with
//                 exponential backoff up to maxRetries, then reported as a
//                 TERMINAL failure — never retried forever.
//   NOT_RETRYABLE_404 — HTTP 404. Very likely means "not a trading day" or
//                 "this URL family doesn't exist for this date/era", not a
//                 transient problem. Retrying it would waste time across a
//                 1,300+ date run for no benefit. Reported immediately.
//   BLOCKED     — HTTP 403. Per requirement #11, a block is never retried
//                 and never silently bypassed — it is reported and the
//                 caller decides whether to stop the whole run.

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function classify(errorOrResponse) {
  if (errorOrResponse && errorOrResponse.name === 'AbortError') return 'RETRYABLE_TIMEOUT';
  if (errorOrResponse && errorOrResponse.isNetworkError) return 'RETRYABLE_NETWORK_ERROR';
  if (errorOrResponse && typeof errorOrResponse.status === 'number') {
    const status = errorOrResponse.status;
    if (status === 403) return 'BLOCKED';
    if (status === 404) return 'NOT_RETRYABLE_404';
    if (status === 429) return 'RETRYABLE_RATE_LIMITED';
    if (status >= 500) return 'RETRYABLE_SERVER_ERROR';
    if (!errorOrResponse.ok) return 'NOT_RETRYABLE_OTHER_HTTP';
  }
  return 'RETRYABLE_UNKNOWN_ERROR';
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Fetches a URL with a bounded connect+request timeout (via AbortController)
// and bounded exponential-backoff retry for classified-retryable outcomes
// only. Returns { response } on eventual success, or throws an error with
// `.classification`, `.attempts`, and (for HTTP outcomes) `.status` set, so
// the caller always knows exactly why it gave up and how many times it tried.
async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    fetchImpl = fetch
  } = config;

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) return { response, attempts: attempt };

      const classification = classify(response);
      if (classification === 'BLOCKED' || classification === 'NOT_RETRYABLE_404' || classification === 'NOT_RETRYABLE_OTHER_HTTP') {
        const err = new Error(`Terminal HTTP ${response.status} for ${url} (${classification}, no retry)`);
        err.classification = classification; err.status = response.status; err.response = response; err.attempts = attempt;
        throw err;
      }
      // Retryable HTTP outcome (429 / 5xx) — fall through to backoff below.
      lastError = new Error(`Retryable HTTP ${response.status} for ${url} (${classification})`);
      lastError.classification = classification; lastError.status = response.status; lastError.attempts = attempt;
    } catch (error) {
      clearTimeout(timer);
      if (error.classification) { lastError = error; if (error.classification === 'BLOCKED' || error.classification.startsWith('NOT_RETRYABLE')) throw error; }
      else {
        error.isNetworkError = error.name !== 'AbortError';
        error.classification = classify(error);
        error.attempts = attempt;
        lastError = error;
      }
    }

    if (attempt <= maxRetries) {
      const delay = baseDelayMs * (2 ** (attempt - 1));
      await sleep(delay);
    }
  }

  const finalErr = new Error(`TERMINAL FAILURE after ${maxRetries + 1} attempt(s) for ${url}: ${lastError.message}`);
  finalErr.classification = lastError.classification;
  finalErr.status = lastError.status;
  finalErr.attempts = lastError.attempts;
  finalErr.cause = lastError;
  throw finalErr;
}

module.exports = { fetchWithRetry, classify, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY_MS };
