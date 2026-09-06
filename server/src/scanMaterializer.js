const { evaluate, dateKey, CFG } = require('./scannerEngine');

// Keep enough daily history for a full one-year analysis plus indicator warm-up.
const MATERIALIZE_LOOKBACK_DAYS = 370;

const PERIODS = [
  { key: '1D', label: '1 Day', rows: 1 },
  { key: '1W', label: '1 Week', rows: 5 },
  { key: '1M', label: '1 Month', rows: 22 },
  { key: '3M', label: '3 Months', rows: 66 },
  { key: '6M', label: '6 Months', rows: 132 },
  { key: '1Y', label: '1 Year', rows: 252 }
];

function sortHistory(historyAll) {
  return (historyAll || []).slice().sort((a, b) =>
    (dateKey(a.trade_date) || '').localeCompare(dateKey(b.trade_date) || '')
  );
}

function buildResult(symbol, rows, futuresBySymbolDate) {
  const bounded = rows.slice(-MATERIALIZE_LOOKBACK_DAYS);
  const current = bounded[bounded.length - 1];
  if (!current) return null;
  const futures = futuresBySymbolDate.get(`${symbol}|${dateKey(current.trade_date)}`) || null;
  return evaluate(symbol, bounded, futures);
}

function buildScannerResults(historyBySymbol, futuresBySymbolDate) {
  const results = [];
  for (const [symbol, historyAll] of historyBySymbol.entries()) {
    const sorted = sortHistory(historyAll);
    const result = buildResult(symbol, sorted, futuresBySymbolDate);
    if (result) results.push(result);
  }
  return results;
}

function buildPeriodResults(historyBySymbol, futuresBySymbolDate) {
  const periods = Object.fromEntries(PERIODS.map(p => [p.key, []]));

  for (const [symbol, historyAll] of historyBySymbol.entries()) {
    const sorted = sortHistory(historyAll);
    if (!sorted.length) continue;

    for (const period of PERIODS) {
      // Keep the period plus a warm-up buffer so relative volume, delivery trend,
      // and OBV remain mathematically meaningful even for 1D/1W selections.
      const warmup = Math.max(CFG.historyDays, CFG.obvLookback, CFG.deliveryTrendLookback);
      const rows = sorted.slice(-(period.rows + warmup));
      const result = buildResult(symbol, rows, futuresBySymbolDate);
      if (result) {
        result.period = period.key;
        result.periodLabel = period.label;
        result.periodRows = Math.min(period.rows, sorted.length);
        periods[period.key].push(result);
      }
    }
  }

  return periods;
}

module.exports = {
  buildScannerResults,
  buildPeriodResults,
  MATERIALIZE_LOOKBACK_DAYS,
  PERIODS
};
