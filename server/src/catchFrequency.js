'use strict';
// V15 Catch Frequency: daily / weekly / monthly aggregates built from per-session records.
//
// Input record (one per expected session):
//   { date, status, scanned, starting, confirmed, confirmedSymbols[] }
// where status is one of the explicit session statuses (VERIFIED_CONFIRMATIONS,
// VERIFIED_ZERO_CONFIRMATIONS, VERIFIED_SCAN, PARTIAL_SCAN, DATA_INSUFFICIENT, SCAN_FAILED,
// NOT_RUN, MISSING_SNAPSHOT).
//
// Rules:
//   - Only sessions with a VERIFIED_* status contribute to counts and rates.
//   - A rate whose denominator is unavailable is the string "DATA_INSUFFICIENT", never 0.
//   - A session that is not verified is listed with its status; it is never counted as zero.

const VERIFIED = new Set(['VERIFIED_CONFIRMATIONS', 'VERIFIED_ZERO_CONFIRMATIONS', 'VERIFIED_SCAN']);
const INSUFFICIENT = 'DATA_INSUFFICIENT';

const isVerified = status => VERIFIED.has(status);
const rate = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 100 : INSUFFICIENT);

// ISO week key (Monday-based) from YYYY-MM-DD, no timezone dependence.
function isoWeekKey(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const monthKey = date => date.slice(0, 7);

function buildDaily(records) {
  const ordered = records.slice().sort((a, b) => a.date.localeCompare(b.date));
  let previousConfirmed = null; // symbols confirmed on the previous VERIFIED session
  return ordered.map(r => {
    if (!isVerified(r.status)) {
      previousConfirmed = null; // a gap breaks the streak chain; repeats cannot be established across it
      return { date: r.date, status: r.status, scanned: null, starting: null, confirmed: null, newDetections: null, repeats: null, confirmationRatePct: INSUFFICIENT, dataQuality: r.status };
    }
    const symbols = r.confirmedSymbols || [];
    const repeats = previousConfirmed ? symbols.filter(s => previousConfirmed.has(s)).length : null;
    previousConfirmed = new Set(symbols);
    return {
      date: r.date, status: r.status, scanned: r.scanned, starting: r.starting, confirmed: r.confirmed,
      newDetections: repeats === null ? INSUFFICIENT : r.confirmed - repeats,
      repeats: repeats === null ? INSUFFICIENT : repeats,
      confirmationRatePct: rate(r.confirmed, r.scanned), dataQuality: 'OK'
    };
  });
}

function aggregate(records, keyFn) {
  const groups = new Map();
  for (const r of records.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const k = keyFn(r.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const rows = [];
  let previousAvg = null;
  for (const [key, recs] of groups.entries()) {
    const ok = recs.filter(r => isVerified(r.status));
    const scanned = ok.reduce((a, r) => a + (r.scanned || 0), 0);
    const starting = ok.reduce((a, r) => a + (r.starting || 0), 0);
    const confirmed = ok.reduce((a, r) => a + (r.confirmed || 0), 0);
    const unique = new Set(ok.flatMap(r => r.confirmedSymbols || [])).size;
    const avg = ok.length ? Math.round((confirmed / ok.length) * 100) / 100 : INSUFFICIENT;
    let trend = INSUFFICIENT;
    if (avg !== INSUFFICIENT && previousAvg !== null && previousAvg !== INSUFFICIENT) trend = avg > previousAvg ? 'UP' : avg < previousAvg ? 'DOWN' : 'FLAT';
    previousAvg = avg;
    rows.push({
      period: key, sessions: recs.length, verifiedSessions: ok.length, unverifiedSessions: recs.length - ok.length,
      scanned: ok.length ? scanned : INSUFFICIENT, starting: ok.length ? starting : INSUFFICIENT, confirmed: ok.length ? confirmed : INSUFFICIENT,
      uniqueConfirmed: ok.length ? unique : INSUFFICIENT, repeats: ok.length ? confirmed - unique : INSUFFICIENT,
      avgConfirmedPerSession: avg, confirmationRatePct: ok.length ? rate(confirmed, scanned) : INSUFFICIENT, trend,
      dataQuality: ok.length === recs.length ? 'COMPLETE' : `PARTIAL (${ok.length} of ${recs.length} sessions verified)`
    });
  }
  return rows;
}

function buildCatchFrequency(records) {
  return { daily: buildDaily(records), weekly: aggregate(records, isoWeekKey), monthly: aggregate(records, monthKey) };
}

module.exports = { VERIFIED, INSUFFICIENT, isVerified, isoWeekKey, monthKey, buildCatchFrequency, buildDaily, aggregate };
