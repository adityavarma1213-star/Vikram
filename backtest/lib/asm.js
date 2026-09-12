'use strict';
// VIKRAM ASM (Accumulation Success Matrix) — validation/research module.
//
// ASM measures how ACCUMULATION CONFIRMED signals from the real VIKRAM engine
// (accumulation/engine.js, via ./engineAdapter.js, wired in by backtestRunner.js)
// actually behaved afterward. It operates only on chronological data already
// produced by detectSignalsAndForwardReturns() — it invents no new prices,
// dates, or signals of its own.
//
// ASM IS NOT A TRADING SIGNAL AND NOT A BUY ENGINE. It never feeds back into
// the scanner, alerts, or any live recommendation — it exists purely so a
// human can evaluate the historical track record of a signal that already
// fired, after the fact.
//
// This module adds three things detectSignalsAndForwardReturns() did not:
//   - explicit, immutable T0/P0 per signal (the detection date/price, copied
//     once and never recalculated).
//   - MFE / MAE (maximum favorable / adverse excursion) and max drawdown
//     within each horizon's holding window, computed from EOD close prices
//     only — no intraday high/low exists in this data. This is a disclosed
//     limitation (true intraday MFE/MAE would need intraday ticks), not a
//     fabricated approximation of something we don't have.
//   - benchmark-relative return, ONLY when a benchmark series is supplied.
//     With none supplied, every horizon's benchmark-relative field says
//     exactly 'NOT_AVAILABLE — no benchmark series provided', never a guess.

const HORIZONS = [1, 5, 20, 60, 120];

function computeExcursion(history, entryIndex, exitIndex, entryClose) {
  if (exitIndex <= entryIndex || !entryClose) return { mfePct: null, maePct: null, maxDrawdownPct: null };
  let mfePct = 0;
  let maePct = 0;
  let peak = entryClose;
  let maxDrawdownPct = 0;
  for (let j = entryIndex + 1; j <= exitIndex; j += 1) {
    const c = history[j] && history[j].close;
    if (c == null) continue;
    const excursionPct = ((c / entryClose) - 1) * 100;
    if (excursionPct > mfePct) mfePct = excursionPct;
    if (excursionPct < maePct) maePct = excursionPct;
    if (c > peak) peak = c;
    const drawdownFromPeakPct = ((c / peak) - 1) * 100;
    if (drawdownFromPeakPct < maxDrawdownPct) maxDrawdownPct = drawdownFromPeakPct;
  }
  return {
    mfePct: Math.round(mfePct * 100) / 100,
    maePct: Math.round(maePct * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100
  };
}

// benchmarkSeries: a Map (or plain object) of trade_date -> close price for a
// benchmark index. Only used if actually supplied — this module never invents
// or downloads a benchmark itself.
function benchmarkReturnFor(benchmarkSeries, entryDate, exitDate) {
  if (!benchmarkSeries) return null;
  const get = key => (benchmarkSeries.get ? benchmarkSeries.get(key) : benchmarkSeries[key]);
  const entry = get(entryDate);
  const exit = get(exitDate);
  if (entry == null || exit == null) return null;
  return Math.round(((exit / entry) - 1) * 10000) / 100;
}

// Extends one signal (as produced by detectSignalsAndForwardReturns) with
// immutable T0/P0 and, per computed horizon, MFE/MAE/drawdown/benchmark-
// relative return. `history` must be the same chronological array the signal
// was originally detected against, so `entryIndex` lines up correctly.
function enrichSignalWithAsm(signal, history, entryIndex, benchmarkSeries) {
  const T0 = signal.signalDate; // immutable: the exact session the signal fired — never recomputed
  const P0 = signal.entryClose; // immutable: the exact close price on T0 — never recomputed
  const asmHorizons = {};

  for (const h of HORIZONS) {
    const key = `${h}D`;
    const fr = signal.forwardReturns[key];
    if (!fr || fr.status !== 'COMPUTED') {
      asmHorizons[key] = {
        status: fr ? fr.status : 'INSUFFICIENT_FUTURE_DATA',
        returnPct: null, mfePct: null, maePct: null, maxDrawdownPct: null,
        benchmarkRelativeReturnPct: 'NOT_AVAILABLE'
      };
      continue;
    }
    const exitIndex = entryIndex + h;
    const { mfePct, maePct, maxDrawdownPct } = computeExcursion(history, entryIndex, exitIndex, P0);
    const benchmarkReturn = benchmarkReturnFor(benchmarkSeries, T0, fr.exitDate);
    asmHorizons[key] = {
      status: 'COMPUTED',
      returnPct: fr.returnPct,
      mfePct,
      maePct,
      maxDrawdownPct,
      benchmarkRelativeReturnPct: benchmarkReturn == null
        ? 'NOT_AVAILABLE — no benchmark series provided'
        : Math.round((fr.returnPct - benchmarkReturn) * 100) / 100
    };
  }

  return { symbol: signal.symbol, T0, P0, score: signal.score, horizons: asmHorizons };
}

// Runs ASM over every signal detectSignalsAndForwardReturns() found.
// `bySymbolHistory` MUST be the same history Map used to produce `signals`
// (the same object passed into detectSignalsAndForwardReturns), or indices
// will not line up and a signal is silently skipped rather than mismatched.
function buildAsm(signals, bySymbolHistory, benchmarkSeries = null) {
  const records = [];
  for (const signal of signals) {
    const history = bySymbolHistory.get ? bySymbolHistory.get(signal.symbol) : bySymbolHistory[signal.symbol];
    if (!history) continue;
    const entryIndex = history.findIndex(row => row.trade_date === signal.signalDate);
    if (entryIndex === -1) continue;
    records.push(enrichSignalWithAsm(signal, history, entryIndex, benchmarkSeries));
  }
  return {
    note: 'ASM (Accumulation Success Matrix) is a research/validation record of how past ACCUMULATION CONFIRMED signals performed. It is NOT a trading signal, NOT a recommendation, and must never be used as an automatic BUY trigger.',
    limitation: 'MFE/MAE/drawdown use EOD close prices only (no intraday high/low available in this data pipeline).',
    benchmarkProvided: !!benchmarkSeries,
    records
  };
}

module.exports = { buildAsm, enrichSignalWithAsm, computeExcursion, HORIZONS };
