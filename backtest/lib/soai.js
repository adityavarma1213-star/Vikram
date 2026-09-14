'use strict';
// SOAI — Stealth Order Absorption Index.
//
// Measures how much delivery-based trading activity occurred relative to
// how little the price actually moved, self-relative to the same symbol's
// own trailing history. High SOAI = a lot of real (delivered, not just
// traded) supply/demand appears to have been absorbed without moving price
// much. This module NEVER asserts who did the absorbing or why — it reports
// a measurable ratio and an evidence-based descriptive label only.
//
// FORMULA (documented, deterministic, reproducible):
//   dailyRangeProxy(day) = abs(close - prev_close)      [a CLOSE-TO-CLOSE RANGE
//     PROXY — explicitly NOT true ATR/true range, which needs intraday
//     high/low. This dataset has no high/low field anywhere (verified across
//     all CM records), so a real ATR cannot be computed here, full stop.
//     This proxy moves in the same direction as ATR for a single-session
//     move but is strictly narrower (it cannot see an intraday high/low that
//     both revert to near the previous close). Disclosed in every result's
//     `limitations` field, never called "ATR" anywhere in this module.
//   soaiRaw(window) = sum(deliv_qty over window, valid days only) /
//                     (sum(dailyRangeProxy over window, valid days only) + 1)
//     (+1 in the denominator only to avoid division by zero on a
//     zero-movement window — does not otherwise affect the ratio's scale
//     for any window with real price movement.)
//     MISSING-DATA HANDLING (QC pass, 13-Sep-2026): a day whose close is
//     missing is excluded from both sums for that pair (never fabricated).
//     A day whose deliv_qty is missing is never silently treated as zero —
//     if more than 20% of in-range days are missing delivery data, the
//     whole window returns null (insufficient) rather than a value that
//     would understate real absorption.
//   soaiZ = (soaiRaw(recentWindow) - mean(soaiRaw over trailing baseline windows))
//           / stdev(soaiRaw over trailing baseline windows)
//     i.e. a z-score of the current window's absorption ratio against this
//     SAME symbol's own recent history of that ratio — never a cross-stock
//     comparison, which would conflate share-count/float differences with
//     genuine absorption. This module never asserts that an elevated soaiZ
//     proves institutional or "secret" buying — see the evidence-only
//     labels below.
//
// No-look-ahead: baseline windows are all strictly prior to the recent
// window; nothing here ever uses a future trading day.

function dailyRangeProxy(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    const curr = rows[i].close;
    if (prev != null && curr != null) out.push(Math.abs(curr - prev));
  }
  return out;
}

// QC FIX (audit pass, 13-Sep-2026): the original version summed deliv_qty for
// EVERY day-index 1..end regardless of whether that day's close was valid,
// while the range total only summed pairs with valid closes — a missing
// close could silently misalign the two sums. This version walks both in
// lockstep over the same pairs, and additionally refuses to silently treat
// a missing deliv_qty as zero: if more than 20% of the in-range days are
// missing delivery data, the window is reported as insufficient rather than
// understating real absorption with a zero substitution.
function soaiRawForWindow(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  let totalRange = 0;
  let totalDeliv = 0;
  let pairCount = 0;
  let missingDelivCount = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const prevClose = rows[i - 1].close;
    const currClose = rows[i].close;
    if (prevClose == null || currClose == null) continue; // missing close values: skip this pair entirely, do not fabricate a range
    pairCount += 1;
    totalRange += Math.abs(currClose - prevClose);
    const deliv = rows[i].deliv_qty;
    if (deliv == null) { missingDelivCount += 1; continue; } // missing delivery values: do not silently treat as 0
    totalDeliv += deliv;
  }
  if (pairCount === 0) return null; // e.g. all closes missing in this window
  if (missingDelivCount / pairCount > 0.2) return null; // too much missing delivery data to trust the ratio
  return totalDeliv / (totalRange + 1); // zero-movement windows: totalRange can legitimately be 0; +1 only guards that division, does not distort windows with real movement
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

// symbolSeries: chronological array up to and including asOfDate (caller's responsibility, e.g. via symbolSeries.cmSeriesAsOf).
function computeSOAI(symbolSeries, { windowSize = 10, baselineWindows = 5 } = {}) {
  const minRequired = windowSize * (baselineWindows + 1);
  if (!Array.isArray(symbolSeries) || symbolSeries.length < minRequired) {
    return {
      status: 'DATA_INSUFFICIENT',
      reason: `need at least ${minRequired} trading days (windowSize=${windowSize} x (baselineWindows=${baselineWindows}+1 recent)), have ${Array.isArray(symbolSeries) ? symbolSeries.length : 0}`,
      soaiZ: null, label: null, evidence: null
    };
  }

  const recentRows = symbolSeries.slice(-windowSize);
  const recentRaw = soaiRawForWindow(recentRows);

  const baselineRaws = [];
  for (let w = 1; w <= baselineWindows; w += 1) {
    const start = -(windowSize * (w + 1));
    const end = -(windowSize * w);
    const rows = symbolSeries.slice(start, end);
    const raw = soaiRawForWindow(rows);
    if (raw != null) baselineRaws.push(raw);
  }
  if (recentRaw == null || baselineRaws.length < 2) {
    return { status: 'DATA_INSUFFICIENT', reason: 'insufficient valid (non-gap) windows to compute a baseline distribution', soaiZ: null, label: null, evidence: null };
  }

  const baselineMean = mean(baselineRaws);
  const baselineStdev = stdev(baselineRaws);
  const soaiZ = baselineStdev && baselineStdev > 0 ? (recentRaw - baselineMean) / baselineStdev : null;

  const priceChangePct = recentRows[0].close > 0 ? ((recentRows[recentRows.length - 1].close - recentRows[0].close) / recentRows[0].close) * 100 : null;

  let label = 'INSUFFICIENT_SIGNAL';
  let note = 'z-score not computable (zero-variance baseline) — not enough distinct history to interpret';
  if (soaiZ != null) {
    if (soaiZ >= 2 && Math.abs(priceChangePct) < 2) {
      label = 'PRICE_SUPPRESSED_ABSORPTION_PATTERN';
      note = `absorption ratio ${soaiZ.toFixed(2)} std. deviations above this symbol's own trailing baseline, while price moved only ${priceChangePct.toFixed(2)}% — evidence of controlled absorption, not a claim about who is absorbing it`;
    } else if (soaiZ >= 2) {
      label = 'ELEVATED_ABSORPTION_WITH_PRICE_PARTICIPATION';
      note = `absorption ratio ${soaiZ.toFixed(2)} std. deviations above baseline, alongside a ${priceChangePct.toFixed(2)}% price move — elevated but not price-suppressed`;
    } else if (soaiZ <= -1) {
      label = 'BELOW_NORMAL_ABSORPTION';
      note = `absorption ratio ${soaiZ.toFixed(2)} std. deviations below this symbol's own trailing baseline`;
    } else {
      label = 'NORMAL_RANGE';
      note = `absorption ratio within +/-1 std. deviation of this symbol's own trailing baseline (z=${soaiZ.toFixed(2)})`;
    }
  }

  return {
    status: 'CALCULATED',
    soaiZ,
    soaiRaw: recentRaw,
    label,
    reason: note,
    evidence: { recentRaw, baselineMean, baselineStdev, baselineWindowCount: baselineRaws.length, priceChangePct },
    limitations: ['dailyRangeProxy is a close-to-close range proxy: abs(close - prev_close). It is NOT true intraday ATR (no high/low field exists anywhere in this dataset, verified) — treat SOAI as an evidence-based absorption ratio, not a volatility-calibrated index.']
  };
}

module.exports = { computeSOAI, soaiRawForWindow, dailyRangeProxy };
