const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');
const { toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact } = require('./istDate');
const { buildScannerResults, buildPeriodResults, buildOiTrendBySymbolDate, MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');
const { runAlertPipeline } = require('./alerts/alertEngine');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized:false } : undefined });
const HOME='https://www.nseindia.com';
const HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36','Accept':'*/*','Accept-Language':'en-US,en;q=0.9','Referer':HOME+'/'};
async function get(url){const r=await fetch(url,{headers:HEADERS});if(!r.ok)throw new Error(`NSE ${r.status} for ${url}`);return Buffer.from(await r.arrayBuffer());}
function clean(v){return v===undefined||v===null||String(v).trim()===''?null:String(v).trim();}
function num(v){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:null;}
function parseCsv(buf){return parse(buf.toString('utf8').replace(/^\uFEFF/,''),{columns:true,skip_empty_lines:true,trim:true,relax_column_count:true});}

async function ingestCm(date){
  const url=`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${formatDdMmYyyy(date)}.csv`;
  const rows=parseCsv(await get(url)).filter(r=>clean(r.SERIES)==='EQ');
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const r of rows){await client.query(`INSERT INTO cm_eod(symbol,trade_date,series,prev_close,open,high,low,last_price,close,avg_price,volume,deliv_qty,deliv_per,turnover,no_of_trades) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(symbol,trade_date) DO UPDATE SET prev_close=EXCLUDED.prev_close,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,last_price=EXCLUDED.last_price,close=EXCLUDED.close,avg_price=EXCLUDED.avg_price,volume=EXCLUDED.volume,deliv_qty=EXCLUDED.deliv_qty,deliv_per=EXCLUDED.deliv_per,turnover=EXCLUDED.turnover,no_of_trades=EXCLUDED.no_of_trades`,[clean(r.SYMBOL),formatYmd(date),clean(r.SERIES),num(r.PREV_CLOSE),num(r.OPEN_PRICE),num(r.HIGH_PRICE),num(r.LOW_PRICE),num(r.LAST_PRICE),num(r.CLOSE_PRICE),num(r.AVG_PRICE),num(r.TTL_TRD_QNTY),num(r.DELIV_QTY),num(r.DELIV_PER),num(r.TURNOVER_LACS),num(r.NO_OF_TRADES)]);}await client.query(`INSERT INTO ingestion_runs(segment,trade_date,status,row_count,schema_version) VALUES('CM',$1,'success',$2,'cm-full-v1-turnover-lacs')`,[formatYmd(date),rows.length]);await client.query('COMMIT');return rows.length;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

async function ingestFo(date){
  const url=`https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${formatYmdCompact(date)}_F_0000.csv.zip`;
  const zip=await unzipper.Open.buffer(await get(url));
  const file=zip.files.find(f=>/\.csv$/i.test(f.path));if(!file)throw new Error('No CSV found in NSE F&O archive');
  const rows=parseCsv(await file.buffer());
  const futures=rows.filter(r=>clean(r.Sgmt)==='FO'&&clean(r.FinInstrmTp)==='STF'&&clean(r.OptnTp)==='XX');
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const r of futures){const symbol=clean(r.TckrSymb),expiry=clean(r.XpryDt);if(!symbol||!expiry)continue;await client.query(`INSERT INTO futures_eod(symbol,trade_date,expiry,close,oi,change_oi,instrument_type,contract_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(symbol,trade_date,expiry) DO UPDATE SET close=EXCLUDED.close,oi=EXCLUDED.oi,change_oi=EXCLUDED.change_oi,instrument_type=EXCLUDED.instrument_type,contract_name=EXCLUDED.contract_name`,[symbol,formatYmd(date),expiry,num(r.ClsPric),num(r.OpnIntrst),num(r.ChngInOpnIntrst),clean(r.FinInstrmTp),clean(r.FinInstrmNm)]);}await client.query(`INSERT INTO ingestion_runs(segment,trade_date,status,row_count,schema_version) VALUES('FO',$1,'success',$2,'fo-udiff-v1')`,[formatYmd(date),futures.length]);await client.query('COMMIT');return futures.length;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
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
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const r of results){await client.query(`INSERT INTO scanner_results(symbol,trade_date,score,verdict,metrics,why,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(symbol) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,updated_at=now()`,[r.symbol,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why)]);}for(const rows of Object.values(periods)){for(const r of rows){await client.query(`INSERT INTO scanner_results_periods(symbol,period,trade_date,score,verdict,metrics,why,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(symbol,period) DO UPDATE SET trade_date=EXCLUDED.trade_date,score=EXCLUDED.score,verdict=EXCLUDED.verdict,metrics=EXCLUDED.metrics,why=EXCLUDED.why,updated_at=now()`,[r.symbol,r.period,r.tradeDate,r.score,r.verdict,JSON.stringify(r.metrics),JSON.stringify(r.why)]);}}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

  try { const alertSummary = await runAlertPipeline(pool, 'accumulation', results); console.log(`ALERTS new=${alertSummary.newMatches} sent=${alertSummary.sent} failed=${alertSummary.failed}`); } catch (error) { console.error('Alert pipeline failed after materialization:', error.message); }
  return results.length;
}

async function main(){
  const anchor=toIstCalendarDate();
  const SEARCH_WINDOW_DAYS=10;
  for(let i=0;i<SEARCH_WINDOW_DAYS;i++){const x=addDays(anchor,-i);try{const cm=await ingestCm(x);const fo=await ingestFo(x);console.log(`INGESTED ${formatYmd(x)} CM=${cm} FO=${fo}`);const materialized=await materializeScannerResults();console.log(`MATERIALIZED scanner_results for ${materialized} symbol(s)`);return;}catch(e){console.log(`SKIP ${formatYmd(x)}: ${e.message}`);}}
  throw new Error(`No recent NSE trading-day file was available in the last ${SEARCH_WINDOW_DAYS} calendar days.`);
}

if(require.main===module)main().then(()=>pool.end()).catch(e=>{console.error(e);pool.end();process.exit(1)});
module.exports={ingestCm,ingestFo,materializeScannerResults};
