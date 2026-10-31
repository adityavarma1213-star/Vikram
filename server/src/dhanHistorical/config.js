'use strict';
// Dhan Historical Data constants. Every number here is tagged with how it was verified.
// Source: https://dhanhq.co/docs/v2/historical-data/ , https://dhanhq.co/docs/v2/ (rate limit),
//         https://dhanhq.co/docs/v2/instruments/ (checked 30 Oct 2026 via documentation read).
// This module is the ONLY place that knows the Dhan host. No user input ever reaches a URL.

const DHAN_API_HOST = 'https://api.dhan.co';            // fixed, never user-controlled
// Label only (never fetched by code): where the operator downloads the official instrument list.
const SCRIP_MASTER_SOURCE = 'https://images.dhan.co/api-data/api-scrip-master.csv (manual download)';

// Interval map. Add a new interval by adding ONE entry (e.g. '15m') -- client code is unchanged.
//   endpoint     : official path
//   body         : fields the official API wants for this interval
//   maxDaysPerRequest : VERIFIED for intraday (docs: "only 90 days of data can be polled at once").
//                       Daily has NO documented per-request limit -> we use a conservative
//                       365-day chunk, marked unverified.
//   chunkDays    : what we actually use (one day under the verified limit, so a boundary
//                  mistake can never exceed it)
//   maxHistoryYears: docs say intraday is available "for last 5 years"; daily "back upto the
//                  date of its inception".
const INTERVALS = {
  '1d': {
    label: 'Daily', endpoint: '/v2/charts/historical', apiInterval: null,
    maxDaysPerRequest: null, limitVerified: false, chunkDays: 365, maxHistoryYears: null,
    stepSeconds: 86400, dateFormat: 'date',
  },
  '5m': {
    label: '5-minute', endpoint: '/v2/charts/intraday', apiInterval: 5,
    maxDaysPerRequest: 90, limitVerified: true, chunkDays: 89, maxHistoryYears: 5,
    stepSeconds: 300, dateFormat: 'datetime',
  },
};

const SUPPORTED_SEGMENTS = ['NSE_EQ'];          // first version: NSE cash equity only
const SUPPORTED_INSTRUMENTS = { NSE_EQ: 'EQUITY' };

const LIMITS = {
  // Official: Data APIs 5 requests/second, 100000/day. We stay below: 4 req/sec.
  minGapMs: 260,
  timeoutMs: 20000,
  maxRetries: 3,                // bounded retries for transient failures only
  retryBaseMs: 500,
  maxChunksPerJob: 30,          // ~5y of 5-minute data = ~21 chunks of 89 days
  maxDailyYears: 30,
  maxRowsPerJob: 600000,
  jobTtlMs: 10 * 60 * 1000,
  maxJobsPerUser: 3,
  maxStartsPerMinutePerUser: 4,
};

module.exports = { DHAN_API_HOST, SCRIP_MASTER_SOURCE, INTERVALS, SUPPORTED_SEGMENTS, SUPPORTED_INSTRUMENTS, LIMITS };
