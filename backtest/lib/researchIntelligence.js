'use strict';
// VIKRAM Canonical Research Intelligence — the missing join layer identified by the
// forensic audit (see FORENSIC_INTEGRATION_REPORT.md at repo root).
//
// PROBLEM THIS SOLVES:
//   backtest/lib/asm.js already produces real, computed ASM records — one per historical
//   ACCUMULATION CONFIRMED detection EVENT, with real forward-return/MFE/MAE/drawdown
//   outcomes. But that is a flat list of individual past events. Neither Hidden Gems
//   (hiddenGems/engine.js) nor Opportunity Radar (js/opportunityRadar.js) had any way to
//   ask "how has THIS symbol's signal actually performed historically?" — there was no
//   per-symbol rollup, so the two live/current-signal modules and the two
//   historical/backtest modules were computed correctly but never joined.
//
// WHAT THIS MODULE DOES:
//   Groups the real ASM records by symbol and, per forward-return horizon, computes
//   real sample counts, win rate, median/average return, and average MFE/MAE/drawdown —
//   entirely from numbers ASM already computed from real NSE data. Invents nothing.
//   A symbol/horizon with zero COMPUTED outcomes gets an explicit INSUFFICIENT_SAMPLE
//   record with every numeric field null, never a guessed number.
//
// CONFIDENCE TIERS are a documented, intentionally simple sample-size heuristic — NOT
// fitted/optimized against outcomes (that would be overfitting a threshold to this one
// dataset). They exist only so a consumer can tell "68% win rate over 3 events" apart
// from "68% win rate over 40 events" at a glance.
//
// This module is pure (no disk I/O) so it is trivially unit-testable with synthetic
// fixtures; backtest/scripts/buildResearchIntelligence.js and backtestRunner.js are the
// two real callers that supply real ASM output and write the canonical artifact
// (data/researchIntelligence.json).

const HORIZONS = [1, 5, 20, 60, 120];
const CONFIDENCE_THRESHOLDS = Object.freeze({ HIGH: 30, MEDIUM: 15, LOW: 5 }); // min computedCount

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const value = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(value * 100) / 100;
}

function mean(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function confidenceTier(computedCount) {
  if (computedCount >= CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
  if (computedCount >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (computedCount >= CONFIDENCE_THRESHOLDS.LOW) return 'LOW';
  return 'INSUFFICIENT_SAMPLE';
}

// asm: the { note, limitation, benchmarkProvided, records } object produced by
// backtest/lib/asm.js's buildAsm(). Never mutated.
function buildResearchIntelligence(asm) {
  const records = asm && Array.isArray(asm.records) ? asm.records : [];
  const bySymbol = new Map();
  for (const rec of records) {
    if (!rec || !rec.symbol) continue;
    if (!bySymbol.has(rec.symbol)) bySymbol.set(rec.symbol, []);
    bySymbol.get(rec.symbol).push(rec);
  }

  const symbols = {};
  for (const [symbol, recs] of bySymbol.entries()) {
    const horizons = {};
    for (const h of HORIZONS) {
      const key = `${h}D`;
      const computed = recs
        .map(r => (r.horizons ? r.horizons[key] : null))
        .filter(v => v && v.status === 'COMPUTED' && Number.isFinite(v.returnPct));
      const computedCount = computed.length;

      if (!computedCount) {
        horizons[key] = {
          status: 'INSUFFICIENT_SAMPLE',
          sampleCount: recs.length,
          computedCount: 0,
          successRatePct: null,
          medianReturnPct: null,
          avgReturnPct: null,
          avgMfePct: null,
          avgMaePct: null,
          avgMaxDrawdownPct: null,
          confidence: 'INSUFFICIENT_SAMPLE'
        };
        continue;
      }

      const returns = computed.map(v => v.returnPct);
      const successCount = returns.filter(r => r > 0).length;
      horizons[key] = {
        status: 'COMPUTED',
        sampleCount: recs.length,
        computedCount,
        successRatePct: Math.round((successCount / computedCount) * 10000) / 100,
        medianReturnPct: median(returns),
        avgReturnPct: mean(returns),
        avgMfePct: mean(computed.map(v => v.mfePct).filter(Number.isFinite)),
        avgMaePct: mean(computed.map(v => v.maePct).filter(Number.isFinite)),
        avgMaxDrawdownPct: mean(computed.map(v => v.maxDrawdownPct).filter(Number.isFinite)),
        confidence: confidenceTier(computedCount)
      };
    }

    const dates = recs.map(r => r.T0).filter(Boolean).sort();
    symbols[symbol] = {
      symbol,
      totalHistoricalEvents: recs.length,
      firstSignalDate: dates[0] || null,
      lastSignalDate: dates[dates.length - 1] || null,
      horizons
    };
  }

  return {
    note: 'Canonical Research Intelligence: a per-symbol rollup of real ASM (Accumulation ' +
      'Success Matrix) outcomes already computed from real NSE data. This is evidence of how ' +
      'this exact signal behaved historically for this exact symbol — it is NOT a trading ' +
      'signal, NOT a recommendation, and NOT a guarantee of future performance.',
    limitation: asm && asm.limitation ? asm.limitation : null,
    confidenceThresholds: CONFIDENCE_THRESHOLDS,
    horizonsCovered: HORIZONS.map(h => `${h}D`),
    symbolCount: Object.keys(symbols).length,
    symbols
  };
}

module.exports = { buildResearchIntelligence, confidenceTier, median, mean, CONFIDENCE_THRESHOLDS, HORIZONS };
