'use strict';
// Catch -> Outcome. Everything here is OUTCOME measurement on data AFTER the signal date; none of
// it is ever fed back into a decision. Excursions are close-based (the stored data has no
// intraday high/low), and are labelled so.

const HORIZONS = [1, 5, 20, 60, 120];
const round2 = x => Math.round(x * 100) / 100;

// history: one symbol's chronological rows. entryIndex: index of the first detection day.
function computeOutcome(history, entryIndex, entryClose) {
  const out = { referencePrice: entryClose, referenceDate: history[entryIndex].trade_date, horizons: {}, basis: 'CLOSE_TO_CLOSE' };
  for (const h of HORIZONS) {
    const exit = entryIndex + h;
    if (!(exit < history.length) || history[exit].close === null || !entryClose) {
      out.horizons[`${h}D`] = { status: 'INSUFFICIENT_FUTURE_DATA' };
      continue;
    }
    let peak = entryClose; let mfe = -Infinity; let mae = Infinity; let maxDrawdown = 0;
    for (let k = entryIndex + 1; k <= exit; k += 1) {
      const c = history[k].close;
      if (c === null) continue;
      mfe = Math.max(mfe, c / entryClose - 1);
      mae = Math.min(mae, c / entryClose - 1);
      peak = Math.max(peak, c);
      maxDrawdown = Math.min(maxDrawdown, c / peak - 1);
    }
    out.horizons[`${h}D`] = {
      status: 'COMPUTED', exitDate: history[exit].trade_date, exitClose: history[exit].close,
      returnPct: round2((history[exit].close / entryClose - 1) * 100),
      mfePct: round2(mfe * 100), maePct: round2(mae * 100), maxDrawdownPct: round2(maxDrawdown * 100)
    };
  }
  const last = history[history.length - 1];
  out.latestVerifiedPrice = last.close; out.latestVerifiedPriceDate = last.trade_date;
  out.latestChangePct = entryClose && last.close !== null ? round2((last.close / entryClose - 1) * 100) : null;
  return out;
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// outcomes: array of computeOutcome results. Win = return > 0 (same definition as the original
// report: winRate = wins / computed; unchanged and losses are both "not a win").
function summarizeHorizon(outcomes, h) {
  const key = `${h}D`;
  const cells = outcomes.map(o => o.horizons[key]);
  const computed = cells.filter(c => c.status === 'COMPUTED');
  const returns = computed.map(c => c.returnPct).sort((a, b) => a - b);
  const n = computed.length;
  const wins = computed.filter(c => c.returnPct > 0).length;
  const losses = computed.filter(c => c.returnPct < 0).length;
  const unchanged = computed.filter(c => c.returnPct === 0).length;
  const mean = arr => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  return {
    horizon: key, sampleSize: outcomes.length, computed: n, missing: outcomes.length - n,
    wins, losses, unchanged,
    winRatePct: n ? round2((wins / n) * 100) : null,
    lossRatePct: n ? round2((losses / n) * 100) : null,
    unchangedRatePct: n ? round2((unchanged / n) * 100) : null,
    avgReturnPct: mean(returns), medianReturnPct: n ? round2(median(returns)) : null,
    bestReturnPct: n ? returns[n - 1] : null, worstReturnPct: n ? returns[0] : null,
    avgMfePct: mean(computed.map(c => c.mfePct)), avgMaePct: mean(computed.map(c => c.maePct)),
    avgMaxDrawdownPct: mean(computed.map(c => c.maxDrawdownPct)),
    worstMaxDrawdownPct: n ? Math.min(...computed.map(c => c.maxDrawdownPct)) : null
  };
}

function summarizeAll(outcomes) {
  return Object.fromEntries(HORIZONS.map(h => [`${h}D`, summarizeHorizon(outcomes, h)]));
}

module.exports = { HORIZONS, computeOutcome, summarizeHorizon, summarizeAll };
