/*
 * VIKRAM Allocation / Position-Sizing Foundation
 *
 * This is a calculation utility, not a portfolio recommendation engine.
 * No strategy-specific allocation percentages are frozen here.
 * Callers must provide their own approved capital/risk constraints.
 */

function finite(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

function calculatePositionSize({ capital, riskPct, entryPrice, stopPrice, maxAllocationPct = null }) {
  if (![capital, riskPct, entryPrice, stopPrice].every(finite)) {
    return { status: 'DATA INSUFFICIENT', shares: null, allocationPct: null, allocationValue: null, riskValue: null };
  }
  const c = Number(capital);
  const risk = Number(riskPct);
  const entry = Number(entryPrice);
  const stop = Number(stopPrice);
  if (c <= 0 || risk <= 0 || entry <= 0 || stop <= 0 || stop >= entry) {
    return { status: 'INVALID INPUT', shares: null, allocationPct: null, allocationValue: null, riskValue: null };
  }

  const riskValue = c * (risk / 100);
  const riskPerShare = entry - stop;
  let shares = Math.floor(riskValue / riskPerShare);
  if (finite(maxAllocationPct) && Number(maxAllocationPct) > 0) {
    const capShares = Math.floor((c * Number(maxAllocationPct) / 100) / entry);
    shares = Math.min(shares, capShares);
  }
  const allocationValue = shares * entry;
  return {
    status: 'CALCULATED',
    shares,
    allocationValue,
    allocationPct: (allocationValue / c) * 100,
    riskValue,
    riskPerShare,
  };
}

module.exports = { calculatePositionSize };
