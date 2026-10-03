// VIKRAM — Canonical RSI Engine
// ============================================================================
// ONE calculation/data layer for RSI, shared by every scanner surface
// (Master/All Scanner, Accumulation Scanner, Opportunity Radar, Hidden Gems).
//
// RSI here is INFORMATIONAL / RESEARCH-FILTER ONLY. Nothing in this file is
// read by, or feeds into, V15 scoring, confirmation gates, or thresholds
// (accumulation/engine.js, accumulation/config.js, js/frameworkEngine.js).
//
// Works in both the browser (window.VIKRAM_RSI_ENGINE) and Node (module.exports)
// so the same math produces the snapshot (scripts/buildRsiSnapshot.js) and
// runs again, identically, for anything computed on the fly client-side.
// ============================================================================
(function (root) {
  'use strict';

  var RSI_PERIOD = 14;
  var FLAT_TOLERANCE = 0.0; // documented: RSI direction uses a zero tolerance —
  // current === previous (after rounding to the same precision the value is
  // stored/displayed at) is FLAT; any other difference is RISING or FALLING.

  function isFiniteNum(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  // Wilder's RSI(14). Returns an array the same length as `closes`, with
  // `null` for every index that does not yet have enough history (the first
  // `period` values, or any index downstream of a gap in the input).
  function rsiSeries(closes, period) {
    period = period || RSI_PERIOD;
    var n = closes.length;
    var out = new Array(n).fill(null);
    if (n <= period) return out;

    var gains = 0, losses = 0;
    for (var i = 1; i <= period; i += 1) {
      var d = closes[i] - closes[i - 1];
      gains += Math.max(d, 0);
      losses += Math.max(-d, 0);
    }
    var avgGain = gains / period;
    var avgLoss = losses / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (var j = period + 1; j < n; j += 1) {
      var delta = closes[j] - closes[j - 1];
      avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
      out[j] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  // current > previous -> RISING, current < previous -> FALLING, else FLAT.
  // Both inputs must be finite numbers; missing data must never reach here
  // (callers must check for null first) and must never produce RISING/FALLING/FLAT.
  function direction(current, previous) {
    if (!isFiniteNum(current) || !isFiniteNum(previous)) return null;
    var delta = current - previous;
    if (Math.abs(delta) <= FLAT_TOLERANCE) return 'FLAT';
    return delta > 0 ? 'RISING' : 'FALLING';
  }

  // RSI zone bucket. Missing data must never land in a zone.
  function zone(value) {
    if (!isFiniteNum(value)) return null;
    if (value < 30) return 'OVERSOLD';
    if (value < 50) return 'WEAK_RECOVERY';
    if (value < 70) return 'POSITIVE_MOMENTUM';
    return 'OVERBOUGHT';
  }

  // Group an ascending-by-date array of {date:'YYYY-MM-DD', close:Number}
  // bars into weekly bars (ISO week, Mon-Sun), each bar = the LAST trading
  // day's close within that week. The final group is dropped unless the
  // dataset's last bar's week is itself the last FULL week represented,
  // i.e. we always drop a week that is still "in progress" relative to the
  // last available daily bar — we only know a week is finished once the
  // data moves on to a later week.
  function isoWeekKey(dateStr) {
    var d = new Date(dateStr + 'T00:00:00Z');
    var day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    var monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - day);
    return monday.toISOString().slice(0, 10); // Monday of that week, as key
  }

  function monthKey(dateStr) {
    return dateStr.slice(0, 7); // YYYY-MM
  }

  function resample(bars, keyFn) {
    var groups = [];
    var map = {};
    for (var i = 0; i < bars.length; i += 1) {
      var bar = bars[i];
      var key = keyFn(bar.date);
      if (!map[key]) {
        map[key] = { key: key, date: bar.date, close: bar.close };
        groups.push(map[key]);
      } else {
        // Keep overwriting with the latest bar seen in this period — groups
        // are built from an ascending-date input, so the last write per key
        // is always that period's last trading day.
        map[key].date = bar.date;
        map[key].close = bar.close;
      }
    }
    // Drop the final group: we cannot know it is a COMPLETED period without
    // a later bar proving the period has rolled over. This is the
    // "completed candles only" rule for weekly/monthly RSI.
    if (groups.length > 0) groups.pop();
    return groups;
  }

  function weeklyBars(dailyBars) { return resample(dailyBars, isoWeekKey); }
  function monthlyBars(dailyBars) { return resample(dailyBars, monthKey); }

  // Build the {value, direction, zone} triple for one timeframe from a
  // chronological bars array (daily/weekly/monthly, already trimmed to
  // completed candles for weekly/monthly).
  function timeframeResult(bars, period) {
    if (!bars || bars.length <= (period || RSI_PERIOD)) {
      return { value: null, direction: null, zone: null, asOf: bars && bars.length ? bars[bars.length - 1].date : null };
    }
    var closes = bars.map(function (b) { return b.close; });
    var series = rsiSeries(closes, period);
    var current = series[series.length - 1];
    var previous = series[series.length - 2];
    // Round FIRST, then derive direction/zone from the SAME rounded value that gets
    // displayed/stored — otherwise a value that rounds to exactly a zone boundary (e.g.
    // 29.996 -> displayed as 30.00) can be zoned OVERSOLD while showing 30.00, a
    // value/zone mismatch. Direction likewise compares the two values a user actually sees.
    var roundedCurrent = isFiniteNum(current) ? Math.round(current * 100) / 100 : null;
    var roundedPrevious = isFiniteNum(previous) ? Math.round(previous * 100) / 100 : null;
    return {
      value: roundedCurrent,
      direction: roundedCurrent !== null && roundedPrevious !== null ? direction(roundedCurrent, roundedPrevious) : null,
      zone: zone(roundedCurrent),
      asOf: bars[bars.length - 1].date
    };
  }

  // Full canonical RSI object for one symbol from its ascending-by-date
  // daily {date, close} series. Used identically by the snapshot builder
  // (Node) and, if ever needed, by the browser.
  function computeCanonicalRsi(dailyBars) {
    var daily = timeframeResult(dailyBars, RSI_PERIOD);
    var weekly = timeframeResult(weeklyBars(dailyBars), RSI_PERIOD);
    var monthly = timeframeResult(monthlyBars(dailyBars), RSI_PERIOD);
    return { daily: daily, weekly: weekly, monthly: monthly };
  }

  var api = {
    RSI_PERIOD: RSI_PERIOD,
    rsiSeries: rsiSeries,
    direction: direction,
    zone: zone,
    weeklyBars: weeklyBars,
    monthlyBars: monthlyBars,
    timeframeResult: timeframeResult,
    computeCanonicalRsi: computeCanonicalRsi
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.VIKRAM_RSI_ENGINE = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
