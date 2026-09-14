'use strict';
// False Accumulation Detector.
//
// Takes an already-computed Accumulation DNA / SOAI result for a symbol and
// checks it against measurable non-directional explanations before letting
// it stand as a real accumulation signal. This module never accuses anyone
// of manipulation and never emits ACCUMULATION_CONFIRMED — confirming an
// accumulation call with certainty would require disclosure-level evidence
// (bulk/block deal filings, promoter disclosures) that does NOT exist in
// this dataset (verified: no bulk/block-deal fields anywhere in
// data/market-history/*.json). ACCUMULATION_LIKELY is the honest ceiling
// this engine can support with cash+F&O data alone.
//
// Checks performed (each individually disclosed as EVALUATED or
// DATA_INSUFFICIENT, never silently skipped):
//   1. Price discontinuity (reuses backtest/lib/corporateActions.js's
//      existing heuristic — does not duplicate that logic).
//   2. Futures rollover proximity (expiry within N calendar days of the
//      as-of date, using the REAL expiry field already in the F&O data).
//   3. Abnormal single-day volume spike within the window (self-relative
//      z-score, consistent with the method used elsewhere in this project).
//   4. Bulk/block-deal disambiguation — explicitly DATA_INSUFFICIENT: this
//      repository has no bulk/block-deal disclosure data at all, so this
//      check can never be evaluated as things stand, and that is reported
//      honestly rather than assumed clean.

const { detectPriceDiscontinuities } = require('./corporateActions');

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

// cmSeries: chronological array up to asOfDate. foSeries: same, for the same symbol.
function detectFalseAccumulation(cmSeries, foSeries, asOfDate, { rolloverProximityDays = 3, volumeSpikeWindow = 20 } = {}) {
  if (!Array.isArray(cmSeries) || cmSeries.length < 5) {
    return { verdict: 'DATA_INSUFFICIENT', reason: 'fewer than 5 trading days of CM history available up to as-of date', checks: {} };
  }

  const checks = {};

  // 1. Price discontinuity heuristic (delegates to existing corporateActions.js — no duplicate logic)
  const priceHistory = cmSeries.map(r => ({ trade_date: r.trade_date, close: r.close }));
  const discontinuities = detectPriceDiscontinuities(priceHistory);
  const recentDiscontinuity = discontinuities.find(d => daysBetween(d.date, asOfDate) >= 0 && daysBetween(d.date, asOfDate) <= volumeSpikeWindow);
  checks.priceDiscontinuity = recentDiscontinuity
    ? { status: 'FLAGGED', detail: recentDiscontinuity }
    : { status: 'CLEAR', detail: null };

  // 2. Futures rollover proximity — only evaluable where real F&O expiry data exists for this window
  if (Array.isArray(foSeries) && foSeries.length > 0) {
    const upcoming = foSeries.filter(r => r.expiry && daysBetween(asOfDate, r.expiry) >= 0 && daysBetween(asOfDate, r.expiry) <= rolloverProximityDays);
    checks.rolloverProximity = upcoming.length > 0
      ? { status: 'FLAGGED', detail: `${upcoming.length} contract(s) expiring within ${rolloverProximityDays} day(s) of ${asOfDate} — OI/volume shifts near expiry can reflect rollover mechanics rather than directional accumulation`, expiries: [...new Set(upcoming.map(r => r.expiry))] }
      : { status: 'CLEAR', detail: null };
  } else {
    checks.rolloverProximity = { status: 'DATA_INSUFFICIENT', detail: 'no F&O series available for this symbol/window' };
  }

  // 3. Abnormal single-day volume spike (self-relative, same method as SOAI/AccumulationDNA)
  const window = cmSeries.slice(-volumeSpikeWindow);
  const volumes = window.map(r => r.volume).filter(v => v != null);
  if (volumes.length >= 5) {
    const m = mean(volumes);
    const s = stdev(volumes);
    const maxVol = Math.max(...volumes);
    const z = s && s > 0 ? (maxVol - m) / s : null;
    checks.volumeSpike = z != null
      ? { status: z >= 3 ? 'FLAGGED' : 'CLEAR', detail: `max single-day volume in window is ${z.toFixed(2)} std. deviations above the window mean`, z }
      : { status: 'DATA_INSUFFICIENT', detail: 'zero-variance volume window' };
  } else {
    checks.volumeSpike = { status: 'DATA_INSUFFICIENT', detail: 'fewer than 5 volume observations in window' };
  }

  // 4. Bulk/block deal disambiguation — always DATA_INSUFFICIENT; disclosed, not assumed clean
  checks.bulkBlockDealDisambiguation = { status: 'DATA_INSUFFICIENT', detail: 'no bulk/block-deal disclosure data exists in this repository; a real accumulation signal co-occurring with a bulk/block deal cannot currently be distinguished here' };

  // --- verdict ---
  const flags = Object.values(checks).filter(c => c.status === 'FLAGGED');
  const dataInsufficientCount = Object.values(checks).filter(c => c.status === 'DATA_INSUFFICIENT').length;

  let verdict;
  if (checks.priceDiscontinuity.status === 'FLAGGED') {
    verdict = 'FALSE_ACCUMULATION_RISK';
  } else if (flags.length >= 2) {
    verdict = 'FALSE_ACCUMULATION_RISK';
  } else if (flags.length === 1) {
    verdict = 'ACCUMULATION_UNCERTAIN';
  } else if (dataInsufficientCount >= 3) {
    verdict = 'DATA_INSUFFICIENT';
  } else {
    // No disqualifiers found — this is the honest ceiling given available data (see module header).
    verdict = 'ACCUMULATION_LIKELY';
  }

  return {
    verdict,
    reason: `${flags.length} disqualifying check(s) flagged, ${dataInsufficientCount} check(s) could not be evaluated for lack of data`,
    checks,
    limitations: [
      'no bulk/block-deal disclosure data available — cannot rule out a disclosed deal as the real cause',
      'no promoter/insider disclosure data available',
      'ACCUMULATION_CONFIRMED is never emitted by this engine — it would require disclosure-level corroboration this dataset does not contain'
    ]
  };
}

module.exports = { detectFalseAccumulation };
