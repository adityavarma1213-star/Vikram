'use strict';
const { evaluateRule, validateRule } = require('./ruleEvaluator');

const MAX_RESULTS = 5000;
const MAX_HISTORY_ROWS = 320;

function normalizeSymbols(value) {
  if (value === undefined || value === null || value === '') return null;
  const values = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(values.map(v => String(v).trim().toUpperCase()).filter(v => /^[A-Z0-9&.-]{1,30}$/.test(v)))].slice(0, MAX_RESULTS);
}

async function runQuery(pool, rule, options = {}) {
  const validation = validateRule(rule);
  if (!validation.valid) { const error = new Error(validation.error); error.statusCode = 400; throw error; }
  const symbols = normalizeSymbols(options.symbols);
  const params = symbols ? [symbols, MAX_HISTORY_ROWS] : [MAX_HISTORY_ROWS];
  const where = symbols ? 'WHERE symbol=ANY($1) AND series=\'EQ\'' : "WHERE series='EQ'";
  const q = await pool.query(`
    WITH ranked AS (
      SELECT c.*, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn
      FROM cm_eod c ${where}
    )
    SELECT * FROM ranked WHERE rn <= $${symbols ? 2 : 1} ORDER BY symbol, trade_date
  `, params);
  const bySymbol = new Map();
  for (const row of q.rows) { if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []); bySymbol.get(row.symbol).push(row); }
  const matches = [];
  for (const [symbol, history] of bySymbol) {
    const latest = history[history.length - 1] || {};
    const evaluation = evaluateRule(rule, latest, history);
    if (evaluation.result === true) matches.push({ symbol, tradeDate: latest.trade_date, match: true, explanation: evaluation.reason });
    if (matches.length >= MAX_RESULTS) break;
  }
  return { matches, count: matches.length, scannedSymbols: bySymbol.size, dataStatus: 'EOD VERIFIED' };
}

module.exports = { runQuery, normalizeSymbols };
