// Direct NSE acquisition removed. This module only materializes scanner output from data already stored in PostgreSQL.
const { Pool } = require('pg');
const { formatYmd } = require('./istDate');
const { buildScannerResults, buildPeriodResults, buildOiTrendBySymbolDate, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');
const { buildDetectionMap } = require('./detectionHistory');
const accumulationEngine = require('../../accumulation/engine');
const { runAlertPipeline } = require('./alerts/alertEngine');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized:false } : undefined });

async function materializeScannerResults(){
  const symbolsQ=await pool.query(`SELECT DISTINCT symbol FROM cm_eod WHERE series='EQ'`);
  const symbols=symbolsQ.rows.map(r=>r.symbol).filter(Boolean);if(!symbols.length)return 0;
  const historyQ=await pool.query(`SELECT symbol,trade_date,close,last_price,prev_close,volume,deliv_qty,deliv_per,turnover FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY symbol ORDER BY trade_date DESC) rn FROM cm_eod WHERE symbol=ANY($1) AND series='EQ') ranked WHERE rn <= $2 ORDER BY symbol,trade_date`,[symbols,MATERIALIZE_LOOKBACK_DAYS]);
  const historyBySymbol=new Map();for(const r of historyQ.rows){if(!historyBySymbol.has(r.symbol))historyBySymbol.set(r.symbol,[]);historyBySymbol.get(r.symbol).push({...r,trade_date:formatYmd(new Date(r.trade_date))});}
  const futuresQ=await pool.query(`SELECT symbol,trade_date,expiry,oi,change_oi FROM futures_eod WHERE symbol=ANY($1) AND expiry>=trade_date ORDER BY symbol,trade_date,expiry`,[symbols]);
  const futuresBySymbolDate=new Map();for(const r of futuresQ.rows){const key=`${r.symbol}|${formatYmd(new Date(r.trade_date))}`;if(!futuresBySymbolDate.has(key))futuresBySymbolDate.set(key,{...r,trade_date:formatYmd(new Date(r.trade_date))});}
  const oiTrendBySymbolDate=buildOiTrendBySymbolDate(futuresQ.rows);

  // Any verified F&O history in the recent evidence window establishes derivative support.
  // Do not require the historical contract to remain unexpired on the current date: that
  // would misclassify a stock whose current-day F&O row is missing as cash-only.
  const derivativesQ=await pool.query(`
    SELECT DISTINCT symbol
    FROM futures_eod
    WHERE symbol=ANY($1)
      AND trade_date >= (SELECT MAX(trade_date) FROM cm_eod) - INTERVAL '120 days'
  `,[symbols]);
  const derivativesSymbols=new Set(derivativesQ.rows.map(r=>String(r.symbol||'').trim().toUpperCase()).filter(Boolean));
  const results=buildScannerResults(historyBySymbol,futuresBySymbolDate,derivativesSymbols,oiTrendBySymbolDate);
  const periods=buildPeriodResults(historyBySymbol,futuresBySymbolDate,derivativesSymbols,oiTrendBySymbolDate);
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const r of results){await client.query(`INSERT INTO scanner_results(symbol,trade_date,score,verdict,metrics,why,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(symbol) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,updated_at=now()`,[r.symbol,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why)]);}for(const rows of Object.values(periods)){for(const r of rows){await client.query(`INSERT INTO scanner_results_periods(symbol,period,trade_date,score,verdict,metrics,why,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(symbol,period) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,updated_at=now()`,[r.symbol,r.period,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why)]);}}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

  try { const alertSummary = await runAlertPipeline(pool, 'accumulation', results); console.log(`ALERTS new=${alertSummary.newMatches} sent=${alertSummary.sent} failed=${alertSummary.failed}`); } catch (error) { console.error('Alert pipeline failed after materialization:', error.message); }
  return results.length;
}

module.exports = { materializeScannerResults };
