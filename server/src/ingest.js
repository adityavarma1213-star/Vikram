const { Pool } = require('pg');
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
  // Detection History (Blueprint §F/§9): same canonical calculator used by the static-snapshot
  // path (server/src/detectionHistory.js) — wired into the live Postgres path here for the first
  // time, so the live API can expose detection history too, not only the static snapshot. This
  // is purely additive: it reads the same real history already fetched above and does not touch
  // authentication, ingestion validation, or the race-condition fix.
  const detectionMap=buildDetectionMap(historyBySymbol,futuresBySymbolDate,derivativesSymbols,results,accumulationEngine.evaluate);
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const r of results){const detection=detectionMap.get(String(r.symbol||'').toUpperCase())||null;await client.query(`INSERT INTO scanner_results(symbol,trade_date,score,verdict,metrics,why,detection,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(symbol) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,detection=EXCLUDED.detection,updated_at=now()`,[r.symbol,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why),JSON.stringify(detection)]);}for(const rows of Object.values(periods)){for(const r of rows){await client.query(`INSERT INTO scanner_results_periods(symbol,period,trade_date,score,verdict,metrics,why,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(symbol,period) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,updated_at=now()`,[r.symbol,r.period,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why)]);}}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

  try { const alertSummary = await runAlertPipeline(pool, 'accumulation', results); console.log(`ALERTS new=${alertSummary.newMatches} sent=${alertSummary.sent} failed=${alertSummary.failed}`); } catch (error) { console.error('Alert pipeline failed after materialization:', error.message); }
  return results.length;
}

// Real, database-backed concurrency lock (Postgres advisory lock — no schema migration needed).
// pg_try_advisory_lock is non-blocking: it returns immediately with true/false rather than
// queuing, which is exactly what "reject a second concurrent run instead of queuing it" needs.
// A fixed, arbitrary 63-bit key identifies "the NSE ingestion job" specifically; it does not
// collide with any other advisory lock use elsewhere in this codebase (there is none).
//
// IMPORTANT: advisory locks are scoped to a single Postgres SESSION (physical connection), not to
// the logical `pool`. Acquiring via one pool.query() call and releasing via another can silently
// land on two DIFFERENT pooled connections — the "release" would then unlock nothing, and the
// original lock would stay held until that connection is later recycled/closed. So the lock is
// acquired and released on ONE dedicated client held for the entire runIncrementalIngest call,
// exactly like ingestCm/ingestFo already do for their transactions.
const INGESTION_LOCK_KEY = 583920147; // arbitrary constant, unique to this job
async function recordSystemRun(status, reason){
  try{ await pool.query(`INSERT INTO ingestion_runs(segment,trade_date,status,error) VALUES('SYSTEM',NULL,$1,$2)`,[status,reason]); }
  catch(e){ console.error('Failed to record system ingestion_runs row:',e.message); }
}

// Extracted from the original main() below so both the CLI entrypoint and the new
// POST /api/admin/ingest/run route (server/src/index.js) share the exact same real acquisition
// logic — same backward search window, same real ingestCm/ingestFo/materializeScannerResults
// calls, same skip-on-not-yet-published behavior. No ingestion, validation, or scoring logic was
// changed by this extraction — only the return value changed, from console.log+return to a
// structured result object the API route can report back to the browser honestly.
module.exports={materializeScannerResults};
