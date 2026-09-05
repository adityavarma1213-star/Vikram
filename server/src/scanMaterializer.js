const { evaluate, dateKey } = require('./scannerEngine');

const MATERIALIZE_LOOKBACK_DAYS = 60;

function buildScannerResults(historyBySymbol, futuresBySymbolDate) {
  const results = [];
  for (const [symbol, historyAll] of historyBySymbol.entries()) {
    const sorted = (historyAll || []).slice().sort((a, b) => (dateKey(a.trade_date) || '').localeCompare(dateKey(b.trade_date) || ''));
    const bounded = sorted.slice(-MATERIALIZE_LOOKBACK_DAYS);
    const current = bounded[bounded.length - 1];
    if (!current) continue;
    const futures = futuresBySymbolDate.get(`${symbol}|${dateKey(current.trade_date)}`) || null;
    results.push(evaluate(symbol, bounded, futures));
  }
  return results;
}

module.exports = { buildScannerResults, MATERIALIZE_LOOKBACK_DAYS };