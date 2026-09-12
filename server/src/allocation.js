'use strict';
// Position sizing / allocation — CALCULATION FRAMEWORK ONLY.
//
// This is transparent, deterministic risk-based-sizing ARITHMETIC given inputs the user actually
// supplies (capital, risk tolerance, entry, stop). It is explicitly NOT a validated investment
// methodology, NOT a recommendation, and NOT connected to any backtest-derived "optimal" risk
// percentage — no such validated number exists yet (Blueprint §19: "Do not freeze portfolio
// policy before research supports it"). Every function here refuses to compute a result from
// missing/invalid inputs rather than guessing a default.

function isPositiveFinite(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

// capital: total capital available. riskPct: percent of capital willing to risk on this one
// trade (e.g. 1 for 1%) — supplied by the user, never defaulted by this module. entry/stop: real
// prices the user provides (never fetched or fabricated here).
function positionSize({ capital, riskPct, entry, stop }) {
  if (!isPositiveFinite(capital) || !isPositiveFinite(riskPct) || !isPositiveFinite(entry) || !isPositiveFinite(stop)) {
    return { status: 'INSUFFICIENT_INPUT', reason: 'capital, riskPct, entry, and stop must all be supplied as positive numbers.' };
  }
  if (stop >= entry) {
    return { status: 'INVALID_INPUT', reason: 'stop must be below entry for a long position sizing calculation (this module does not yet support short-side sizing).' };
  }
  const riskAmount = capital * (riskPct / 100);
  const riskPerShare = entry - stop;
  const shares = Math.floor(riskAmount / riskPerShare);
  const positionValue = shares * entry;
  return {
    status: 'COMPUTED',
    riskAmount: Math.round(riskAmount * 100) / 100,
    riskPerShare: Math.round(riskPerShare * 100) / 100,
    shares,
    positionValue: Math.round(positionValue * 100) / 100,
    positionPctOfCapital: Math.round((positionValue / capital) * 10000) / 100,
    isMethodologyValidated: false,
    note: 'This is a deterministic risk-based sizing calculation from the inputs you supplied. It is not a recommendation and has not been backtested as a portfolio methodology.'
  };
}

// Applies an OPTIONAL maximum-allocation cap the user supplies (e.g. never put more than 10% of
// capital in one position, regardless of what the risk-based calc above suggests). Never invents
// a default cap.
function applyMaxAllocationCap(sizingResult, { capital, maxAllocationPct }) {
  if (sizingResult.status !== 'COMPUTED') return sizingResult;
  if (!isPositiveFinite(maxAllocationPct)) return { ...sizingResult, maxAllocationCapApplied: false };
  const maxValue = capital * (maxAllocationPct / 100);
  if (sizingResult.positionValue <= maxValue) return { ...sizingResult, maxAllocationCapApplied: false };
  const cappedShares = Math.floor(maxValue / (sizingResult.positionValue / sizingResult.shares));
  return {
    ...sizingResult,
    shares: cappedShares,
    positionValue: Math.round(cappedShares * (sizingResult.positionValue / sizingResult.shares) * 100) / 100,
    maxAllocationCapApplied: true,
    reason: `Risk-based size exceeded the ${maxAllocationPct}% maximum-allocation cap you set; reduced to fit.`
  };
}

module.exports = { positionSize, applyMaxAllocationCap };
