const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');
const { toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact } = require('./istDate');
const { buildScannerResults, buildPeriodResults, buildOiTrendBySymbolDate, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');
const { buildDetectionMap } = require('./detectionHistory');
const accumulationEngine = require('../../accumulation/engine');
const { runAlertPipeline } = require('./alerts/alertEngine');
const { classifyCmRow, classifyFoRow, validateBatch } = require('./ingestValidation');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized:false } : undefined });
const HOME='https://www.nseindia.com';
const HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36','Accept':'*/*','Accept-Language':'en-US,en;q=0.9','Referer':HOME+'/'};
async function get(url){const r=await fetch(url,{headers:HEADERS});if(!r.ok)throw new Error(`NSE ${r.status} for ${url}`);return Buffer.from(await r.arrayBuffer());}
function clean(v){return v===undefined||v===null||String(v).trim()===''?null:String(v).trim();}
function num(v){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:null;}
function parseCsv(buf){return parse(buf.toString('utf8').replace(/^\uFEFF/,''),{columns:true,skip_empty_lines:true,trim:true,relax_column_count:true});}

// #8 remediation: raw rows are classified by ingestValidation.js BEFORE they are trusted. Only
// VALID rows are inserted; MISSING/MALFORMED/INVALID/DUPLICATE rows are excluded and counted, and
// that count + a per-status breakdown is recorded on the ingestion_runs row so bad upstream data
// is visible rather than silently becoming (or silently disappearing from) scanner evidence.
async function ingestCm(date){
  const url=`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${formatDdMmYyyy(date)}.csv`;
  const ymd=formatYmd(date);
  const rawRows=parseCsv(await get(url)).filter(r=>clean(r.SERIES)==='EQ');
  const { valid: rows, invalid, summary } = validateBatch(rawRows, classifyCmRow, ymd, row => row.SYMBOL);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const r of rows){
      await client.query(`INSERT INTO cm_eod(symbol,trade_date,series,prev_close,open,high,low,last_price,close,avg_price,volume,deliv_qty,deliv_per,turnover,no_of_trades) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(symbol,trade_date) DO UPDATE SET prev_close=EXCLUDED.prev_close,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,last_price=EXCLUDED.last_price,close=EXCLUDED.close,avg_price=EXCLUDED.avg_price,volume=EXCLUDED.volume,deliv_qty=EXCLUDED.deliv_qty,deliv_per=EXCLUDED.deliv_per,turnover=EXCLUDED.turnover,no_of_trades=EXCLUDED.no_of_trades`,
        [r.SYMBOL,ymd,r.SERIES,r.PREV_CLOSE,r.OPEN_PRICE,r.HIGH_PRICE,r.LOW_PRICE,r.LAST_PRICE,r.CLOSE_PRICE,r.AVG_PRICE,r.TTL_TRD_QNTY,r.DELIV_QTY,r.DELIV_PER,r.TURNOVER_LACS,r.NO_OF_TRADES]);
    }
    if(invalid.length)console.warn(`CM ${ymd}: rejected ${invalid.length} invalid row(s)`,summary);
    await client.query(`INSERT INTO ingestion_runs(segment,trade_date,status,row_count,invalid_count,validation_summary,schema_version) VALUES('CM',$1,'success',$2,$3,$4,'cm-full-v1-turnover-lacs')`,[ymd,rows.length,invalid.length,JSON.stringify(summary)]);
    await client.query('COMMIT');
    return rows.length;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

async function ingestFo(date){
  const url=`https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`;
  const ymd=formatYmd(date);
  const zip=await unzipper.Open.buffer(await get(url));
  const file=zip.files.find(f=>/\.csv$/i.test(f.path));if(!file)throw new Error('No CSV found in NSE F&O archive');
  const rawRows=parseCsv(await file.buffer()).filter(r=>clean(r.Sgmt)==='FO'&&clean(r.FinInstrmTp)==='STF'&&clean(r.OptnTp)==='XX');
  const { valid: futures, invalid, summary } = validateBatch(rawRows, classifyFoRow, ymd, row => `${row.TckrSymb}|${row.XpryDt}`);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const r of futures){
      await client.query(`INSERT INTO futures_eod(symbol,trade_date,expiry,close,oi,change_oi,instrument_type,contract_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(symbol,trade_date,expiry) DO UPDATE SET close=EXCLUDED.close,oi=EXCLUDED.oi,change_oi=EXCLUDED.change_oi,instrument_type=EXCLUDED.instrument_type,contract_name=EXCLUDED.contract_name`,
        [r.TckrSymb,ymd,r.XpryDt,r.ClsPric,r.OpnIntrst,r.ChngInOpnIntrst,r.FinInstrmTp,r.FinInstrmNm]);
    }
    if(invalid.length)console.warn(`FO ${ymd}: rejected ${invalid.length} invalid row(s)`,summary);
    await client.query(`INSERT INTO ingestion_runs(segment,trade_date,status,row_count,invalid_count,validation_summary,schema_version) VALUES('FO',$1,'success',$2,$3,$4,'fo-udiff-v1')`,[ymd,futures.length,invalid.length,JSON.stringify(summary)]);
    await client.query('COMMIT');
    return futures.length;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

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
async function runIncrementalIngest({ searchWindowDays = 10 } = {}) {
  const lockClient = await pool.connect();
  try {
    const lockQ = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked',[INGESTION_LOCK_KEY]);
    if (!lockQ.rows[0]?.locked) {
      await recordSystemRun('blocked', 'INGESTION_ALREADY_RUNNING');
      return { status: 'BLOCKED', reason: 'INGESTION_ALREADY_RUNNING', attempts: [] };
    }
    try {
      const anchor = toIstCalendarDate();
      const attempts = [];
      for (let i = 0; i < searchWindowDays; i += 1) {
        const x = addDays(anchor, -i);
        const ymd = formatYmd(x);
        try {
          const cm = await ingestCm(x);
          const fo = await ingestFo(x);
          const materialized = await materializeScannerResults();
          attempts.push({ date: ymd, status: 'INGESTED', cmRows: cm, foRows: fo, materializedSymbols: materialized });
          return { status: 'SUCCESS', ingestedDate: ymd, cmRows: cm, foRows: fo, materializedSymbols: materialized, attempts };
        } catch (e) {
          attempts.push({ date: ymd, status: 'SKIPPED', reason: e.message });
        }
      }
      const reason = `No recent NSE trading-day file was available in the last ${searchWindowDays} calendar days.`;
      await recordSystemRun('no_new_data', reason);
      return { status: 'NO_NEW_DATA', reason, attempts };
    } catch (e) {
      await recordSystemRun('failed', e.message);
      return { status: 'FAILED', reason: e.message, attempts: [] };
    } finally {
      try { await lockClient.query('SELECT pg_advisory_unlock($1)',[INGESTION_LOCK_KEY]); }
      catch(e){ console.error('Failed to release ingestion lock:',e.message); }
    }
  } finally {
    lockClient.release();
  }
}

async function main(){
  const result = await runIncrementalIngest();
  if (result.status === 'SUCCESS') {
    console.log(`INGESTED ${result.ingestedDate} CM=${result.cmRows} FO=${result.foRows}`);
    console.log(`MATERIALIZED scanner_results for ${result.materializedSymbols} symbol(s)`);
    return;
  }
  for (const a of result.attempts) console.log(`SKIP ${a.date}: ${a.reason}`);
  throw new Error(result.reason);
}

if(require.main===module)main().then(()=>pool.end()).catch(e=>{console.error(e);pool.end();process.exit(1)});
module.exports={ingestCm,ingestFo,materializeScannerResults,runIncrementalIngest};
