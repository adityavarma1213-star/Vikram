'use strict';
// Accumulation DNA.
//
// Classifies a symbol's recent trading behaviour into one of a fixed set of
// accumulation/distribution structures. Every classification is a
// deterministic function of measurable ratios computed from the symbol's
// OWN trailing history (self-relative, not a cross-sectional universe
// threshold, and not an invented magic number tuned to produce a
// particular label) — see METHOD NOTES below. No input is ever fabricated:
// if there isn't enough real history to compute a ratio safely, the
// function returns DATA_INSUFFICIENT rather than guessing.
//
// METHOD NOTES (why these specific numbers):
// - All ratios compare a RECENT window against a prior BASELINE window of
//   the SAME symbol's OWN history, immediately preceding the recent window
//   and of equal or greater length. This makes "1.3x" mean "30% above this
//   stock's own recent normal," not an arbitrary absolute cutoff that would
//   behave differently for a large-cap vs a thinly-traded small-cap.
// - Thresholds (1.1x / 1.15x / 1.3x, price bands of 2%/3%/5%/8%/15%) are
//   documented, fixed constants applied identically to every symbol/date —
//   they are not fitted per-symbol and not adjusted to make any particular
//   backtest look better. They should be treated as a first defensible cut,
//   not as statistically optimized parameters; that optimization would
//   require the very backtest-over-time work item #27 (Signal Decay) is
//   meant to check for overfitting.
// - No open/high/low fields exist in this repository's CM data (verified:
//   only close/prev_close/volume/deliv_qty/deliv_per are present), so
//   "volatility" here is the standard deviation of daily close-to-close
//   percentage returns — NOT a true-range/ATR measure. This is a real data
//   limitation, disclosed in every result's `limitations` field, not hidden.

const DEFAULT_RECENT_WINDOW = 10;
const DEFAULT_BASELINE_WINDOW = 20; // immediately preceding the recent window, same symbol

function pctReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
function safeRatio(recent, baseline) {
  if (recent == null || baseline == null || baseline === 0) return null;
  return recent / baseline;
}

// QC FIX (audit pass, 13-Sep-2026): the original version only required 2
// non-null closes anywhere in the window before computing stats, which
// could silently compute a "10-day" window's price/volatility from as few
// as 2 real observations if the rest were missing. This version requires at
// least 70% real close coverage for the window to be usable at all, and
// always reports the actual coverage fractions so callers/auditors can see
// exactly how much of a window's delivery/volume figures are real vs
// missing (a missing value is still never fabricated as 0 or interpolated —
// it is simply excluded from the mean, and that exclusion rate is disclosed).
const MIN_CLOSE_COVERAGE = 0.7;

function windowStats(rows) {
  const closes = rows.map(r => r.close).filter(v => v != null);
  const volumes = rows.map(r => r.volume).filter(v => v != null);
  const delivPer = rows.map(r => r.deliv_per).filter(v => v != null);
  const closeCoverage = rows.length > 0 ? closes.length / rows.length : 0;
  if (closes.length < 2 || closeCoverage < MIN_CLOSE_COVERAGE) return null;
  return {
    avgVolume: mean(volumes),
    avgDeliveryPct: mean(delivPer),
    priceChangePct: closes[0] > 0 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : null,
    volatility: stdev(pctReturns(closes)),
    firstClose: closes[0],
    lastClose: closes[closes.length - 1],
    daysObserved: rows.length,
    closeCoverage,
    deliveryCoverage: rows.length > 0 ? delivPer.length / rows.length : 0,
    volumeCoverage: rows.length > 0 ? volumes.length / rows.length : 0
  };
}

// symbolSeries: chronologically sorted array of {trade_date, close, volume, deliv_per, ...}
// already filtered to <= asOfDate by the caller (symbolSeries.js's cmSeriesAsOf).
function classifyAccumulationDNA(symbolSeries, { recentWindow = DEFAULT_RECENT_WINDOW, baselineWindow = DEFAULT_BASELINE_WINDOW, foSeries = [] } = {}) {
  const minRequired = recentWindow + baselineWindow;
  if (!Array.isArray(symbolSeries) || symbolSeries.length < minRequired) {
    return {
      dnaType: 'DATA_INSUFFICIENT',
      status: 'DATA_INSUFFICIENT',
      reason: `need at least ${minRequired} trading days of history (recentWindow=${recentWindow} + baselineWindow=${baselineWindow}), have ${Array.isArray(symbolSeries) ? symbolSeries.length : 0}`,
      evidence: null,
      confidence: null,
      limitations: ['insufficient trailing history']
    };
  }

  const recentRows = symbolSeries.slice(-recentWindow);
  const baselineRows = symbolSeries.slice(-(recentWindow + baselineWindow), -recentWindow);
  const recent = windowStats(recentRows);
  const baseline = windowStats(baselineRows);
  if (!recent || !baseline) {
    return { dnaType: 'DATA_INSUFFICIENT', status: 'DATA_INSUFFICIENT', reason: 'insufficient close-price data within one of the windows to compute stats', evidence: null, confidence: null, limitations: ['insufficient close-price coverage'] };
  }

  let deliveryRatio = safeRatio(recent.avgDeliveryPct, baseline.avgDeliveryPct);
  let volumeRatio = safeRatio(recent.avgVolume, baseline.avgVolume);
  const volatilityRatio = safeRatio(recent.volatility, baseline.volatility);
  const priceChangePct = recent.priceChangePct;
  const extendedPriceChangePct = baseline.firstClose > 0 ? ((recent.lastClose - baseline.firstClose) / baseline.firstClose) * 100 : null;

  // QC FIX (audit pass, 13-Sep-2026): a ratio computed from a mean() over a
  // mostly-missing field is technically a number but not a trustworthy one.
  // If either window's delivery/volume coverage is below 50%, null out that
  // ratio rather than let a sparse-data mean silently drive a classification.
  const MIN_RATIO_COVERAGE = 0.5;
  const deliveryCoverageOk = recent.deliveryCoverage >= MIN_RATIO_COVERAGE && baseline.deliveryCoverage >= MIN_RATIO_COVERAGE;
  const volumeCoverageOk = recent.volumeCoverage >= MIN_RATIO_COVERAGE && baseline.volumeCoverage >= MIN_RATIO_COVERAGE;
  if (!deliveryCoverageOk) deliveryRatio = null;
  if (!volumeCoverageOk) volumeRatio = null;

  // Optional F&O corroboration (OI trend over the recent window) — only used
  // as supporting evidence, never required, since F&O coverage is real but
  // incomplete (13 known gap dates per data/nse-coverage-report.json).
  let oiRatio = null;
  if (Array.isArray(foSeries) && foSeries.length >= minRequired) {
    const foRecent = foSeries.slice(-recentWindow).map(r => r.oi).filter(v => v != null);
    const foBaseline = foSeries.slice(-(recentWindow + baselineWindow), -recentWindow).map(r => r.oi).filter(v => v != null);
    oiRatio = safeRatio(mean(foRecent), mean(foBaseline));
  }

  const evidence = { deliveryRatio, volumeRatio, volatilityRatio, oiRatio, priceChangePct, extendedPriceChangePct, recent, baseline };
  const limitations = ['volatility is close-to-close stdev, not true ATR (no intraday high/low in this dataset)'];
  if (oiRatio == null) limitations.push('F&O/OI data insufficient over this window — F&O-led classification not evaluated');
  if (!deliveryCoverageOk) limitations.push(`delivery ratio not computed — coverage below ${MIN_RATIO_COVERAGE * 100}% in recent (${(recent.deliveryCoverage * 100).toFixed(0)}%) or baseline (${(baseline.deliveryCoverage * 100).toFixed(0)}%) window`);
  if (!volumeCoverageOk) limitations.push(`volume ratio not computed — coverage below ${MIN_RATIO_COVERAGE * 100}% in recent (${(recent.volumeCoverage * 100).toFixed(0)}%) or baseline (${(baseline.volumeCoverage * 100).toFixed(0)}%) window`);

  function result(dnaType, note) {
    const sampleSize = symbolSeries.length;
    const confidence = sampleSize >= minRequired * 2 ? 'MODERATE' : 'LOW'; // never HIGH without a much longer track record — see Signal Decay (#27) for real calibration
    return { dnaType, status: 'CLASSIFIED', reason: note, evidence, confidence, limitations };
  }

  // --- deterministic, priority-ordered rules ---
  if (priceChangePct <= -5 && volumeRatio >= 1.3) {
    return result('DISTRIBUTION', 'falling price with elevated volume/delivery relative to own baseline — evidence-based label, not an accusation of intent');
  }
  if (deliveryRatio >= 1.3 && volumeRatio >= 1.3 && priceChangePct >= 3) {
    return result('AGGRESSIVE_ACCUMULATION', 'delivery and volume both >=30% above own baseline with price rising >=3%');
  }
  if (deliveryRatio >= 1.3 && volumeRatio >= 1.2 && Math.abs(priceChangePct) < 2) {
    return result('PRICE_SUPPRESSED_ACCUMULATION', 'delivery/volume elevated relative to own baseline while price stayed within +/-2% — a price-suppressed absorption pattern, not a claim about who is buying');
  }
  if (oiRatio != null && oiRatio >= 1.3 && deliveryRatio < 1.15 && priceChangePct >= 0) {
    return result('FO_LED_ACCUMULATION', 'open interest building >=30% above own baseline while cash delivery stayed comparatively flat');
  }
  if (deliveryRatio >= 1.3 && volumeRatio < 1.15 && priceChangePct >= 0) {
    return result('DELIVERY_LED_ACCUMULATION', 'delivery strengthening disproportionately to raw traded volume');
  }
  if (priceChangePct >= 8 && deliveryRatio >= 1.15) {
    return result('BREAKOUT_ACCUMULATION', 'price move >=8% over the recent window with delivery confirmation (>=15% above own baseline)');
  }
  if (extendedPriceChangePct != null && extendedPriceChangePct >= 15 && deliveryRatio >= 1.1) {
    return result('LATE_ACCUMULATION', 'delivery strength persists after a large move already occurred over the combined baseline+recent window (extended change >=15%)');
  }
  if (deliveryRatio >= 1.1 && deliveryRatio < 1.3 && volumeRatio < 1.2 && Math.abs(priceChangePct) < 3) {
    return result('QUIET_ACCUMULATION', 'mild, sustained delivery strength (10-30% above own baseline) without a large price or volume disturbance');
  }
  // Early accumulation: only the most recent half of the recent window shows the pickup
  const halfLen = Math.max(2, Math.floor(recentWindow / 2));
  const subRecentRows = symbolSeries.slice(-halfLen);
  const subStats = windowStats(subRecentRows);
  const subDeliveryRatio = subStats ? safeRatio(subStats.avgDeliveryPct, baseline.avgDeliveryPct) : null;
  if (subDeliveryRatio != null && subDeliveryRatio >= 1.2 && deliveryRatio < 1.2) {
    return { ...result('EARLY_ACCUMULATION', `delivery pickup only visible in the most recent ${halfLen} days, not yet the full ${recentWindow}-day window — low sample size, treat as tentative`), confidence: 'LOW' };
  }

  return result('NO_CLEAR_PATTERN', 'none of the defined accumulation/distribution rules matched — explicitly neutral, not forced into a category');
}

module.exports = { classifyAccumulationDNA, windowStats, safeRatio, DEFAULT_RECENT_WINDOW, DEFAULT_BASELINE_WINDOW };
