/*
 * Canonical bridge from the historical backtest to VIKRAM's real
 * accumulation engine. This file deliberately contains no substitute
 * strategy. It maps historical rows into the same input shape consumed by
 * accumulation/engine.js.
 */

const { evaluate } = require('../../accumulation/engine');

function evaluateVikramSignal({ symbol, history, current, futures }) {
  const result = evaluate({ symbol, history, current, futures });
  return {
    symbol: result.symbol,
    tradeDate: result.tradeDate,
    score: result.score,
    verdict: result.verdict,
    metrics: result.metrics,
    confirmation: result.confirmation,
    why: result.why,
  };
}

module.exports = { evaluateVikramSignal };
