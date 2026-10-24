// Direct NSE acquisition removed. Stored-data materialization only.
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
  const historyQ=await pool.query(`SELECT symbol,trade_date,close,last_price,prev_close,volume,deliv_qty,deliv_per FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY symbol ORDER BY trade_date DESC) rn FROM cm_eod WHERE symbol=ANY($1) AND series='EQ') ranked WHERE rn <= $2 ORDER BY symbol,trade_date`,[symbols,MATERIALIZE_LOOKBACK_DAYS]);
  const historyBySymbol=new Map();
  for(const r of historyQ.rows){if(!historyBySymbol.has(r.symbol))historyBySymbol.set(r.symbol,[]);historyBySymbol.get(r.symbol).push({...r,trade_date:formatYmd(new Date(r.trade_date))});}
  const futuresQ=await pool.query(`SELECT DISTINCT ON(symbol,trade_date) symbol,trade_date,oi,change_oi FROM futures_eod WHERE symbol=ANY($1) AND expiry>=trade_date ORDER BY symbol,trade_date,expiry`,[symbols]);
  const futuresBySymbolDate=new Map(futuresQ.rows.map(r=>[`${r.symbol}|${formatYmd(new Date(r.trade_date))}`,{...r,trade_date:formatYmd(new Date(r.trade_date))}]));
  const results=buildScannerResults(historyBySymbol,futuresBySymbolDate);
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const r of results){await client.query(`INSERT INTO scanner_results(symbol,trade_date,score,verdict,metrics,why,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(symbol) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,updated_at=now()`,[r.symbol,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why)]);}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return results.length;
}

module.exports = { materializeScannerResults };
