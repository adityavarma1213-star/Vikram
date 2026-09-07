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

function buildOiTrendBySymbolDate(futuresRows) {
  const grouped = new Map();
  for (const row of futuresRows || []) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    const date = dateKey(row.trade_date);
    const oi = Number(row.oi);
    if (!symbol || !date || !Number.isFinite(oi)) continue;
    if (!grouped.has(symbol)) grouped.set(symbol, []);
    grouped.get(symbol).push({ date, oi });
  }

  const trends = new Map();
  for (const [symbol, rows] of grouped.entries()) {
    const deduped = new Map(rows.map(r => [r.date, r]));
    const ordered = [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 2; i < ordered.length; i += 1) {
      const current = ordered[i];
      const prior = ordered[i - 2];
      trends.set(`${symbol}|${current.date}`, current.oi - prior.oi);
    }
  }
  return trends;
}

function buildResult(symbol, rows, futuresBySymbolDate, derivativesSymbols = new Set(), oiTrendBySymbolDate = new Map()) {
  const bounded = rows.slice(-MATERIALIZE_LOOKBACK_DAYS);
  const current = bounded[bounded.length - 1];
  if (!current) return null;
  const key = `${symbol}|${dateKey(current.trade_date)}`;
  const exactFutures = futuresBySymbolDate.get(key) || null;
  const trend = oiTrendBySymbolDate.get(key);
  // Database futures rows are already verified evidence; explicitly mark them as available
  // for the canonical engine so exact-date OI is not silently treated as cash-only.
  const futures = exactFutures
    ? { ...exactFutures, available: true, derivativesSupported: true, oiTrend3Day: Number.isFinite(trend) ? trend : null }
    : (derivativesSymbols.has(symbol)
      ? { available: false, derivativesSupported: true, trade_date: dateKey(current.trade_date), oiTrend3Day: null }
      : { available: false, derivativesSupported: false, trade_date: dateKey(current.trade_date), oiTrend3Day: null });
  return evaluate(symbol, bounded, futures);
}

function buildScannerResults(historyBySymbol, futuresBySymbolDate, derivativesSymbols = new Set(), oiTrendBySymbolDate = new Map()) {
  const results = [];
  for (const [symbol, historyAll] of historyBySymbol.entries()) {
    const sorted = sortHistory(historyAll);
    const result = buildResult(symbol, sorted, futuresBySymbolDate, derivativesSymbols, oiTrendBySymbolDate);
    if (result) results.push(result);
  }
  return results;
}

function buildPeriodResults(historyBySymbol, futuresBySymbolDate, derivativesSymbols = new Set(), oiTrendBySymbolDate = new Map()) {
  const periods = Object.fromEntries(PERIODS.map(p => [p.key, []]));

  for (const [symbol, historyAll] of historyBySymbol.entries()) {
    const sorted = sortHistory(historyAll);
    if (!sorted.length) continue;

    for (const period of PERIODS) {
      const warmup = Math.max(CFG.historyDays, CFG.obvLookback, CFG.deliveryTrendLookback);
      const rows = sorted.slice(-(period.rows + warmup));
      const result = buildResult(symbol, rows, futuresBySymbolDate, derivativesSymbols, oiTrendBySymbolDate);
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
  buildOiTrendBySymbolDate,
  MATERIALIZE_LOOKBACK_DAYS,
  PERIODS
};
