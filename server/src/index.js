const path=require('node:path');
const express=require('express');
const {Pool}=require('pg');
const {evaluate}=require('./scannerEngine');
const {buildOiTrendBySymbolDate}=require('./scanMaterializer');
const {runQuery}=require('./ruleEngine/query');
const {runAlertPipeline}=require('./alerts/alertEngine');
const push=require('./alerts/providers/push');
const app=express(); app.disable('x-powered-by'); app.use(express.json({limit:'100kb'}));
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required');process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=require')?{rejectUnauthorized:false}:undefined,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
const watchlist=['ONGC','VBL','BSE','NMDC'],MAX_SYMBOLS=200,PERIOD_ROWS={'1D':1,'1W':5,'1M':22,'3M':66,'6M':132,'1Y':252},VALID_PERIODS=new Set(Object.keys(PERIOD_ROWS));
const normalizeSymbols=v=>[...new Set(String(v||'').split(',').map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z0-9&.-]{1,30}$/.test(s)))].slice(0,MAX_SYMBOLS);
const normalizePeriod=v=>VALID_PERIODS.has(String(v||'').toUpperCase())?String(v).toUpperCase():'1D';
const owner=req=>String(req.headers['x-vikram-user']||'anonymous').slice(0,200);
const rowFromMaterialized=r=>({symbol:r.symbol,tradeDate:r.trade_date,score:r.score,verdict:r.verdict,metrics:r.metrics,why:r.why,materialized:true,updatedAt:r.updated_at});
async function liveScan(symbols,period='1D'){
  if(!symbols.length)return[];
  const rowsNeeded=PERIOD_ROWS[period]+20;
  const q=await pool.query(`WITH ranked AS (SELECT c.*,ROW_NUMBER() OVER(PARTITION BY symbol ORDER BY trade_date DESC) rn FROM cm_eod c WHERE c.series='EQ' AND c.symbol=ANY($1)) SELECT * FROM ranked WHERE rn <= $2 ORDER BY symbol,trade_date`,[symbols,rowsNeeded]);
  const by=new Map();for(const r of q.rows){if(!by.has(r.symbol))by.set(r.symbol,[]);by.get(r.symbol).push(r);}
  const f=await pool.query(`SELECT symbol,trade_date,expiry,close,oi,change_oi,instrument_type,contract_name FROM futures_eod WHERE symbol=ANY($1) AND expiry>=trade_date ORDER BY symbol,trade_date DESC,expiry ASC`,[symbols]);
  const fm=new Map();for(const r of f.rows){const key=`${r.symbol}|${r.trade_date}`;if(!fm.has(key))fm.set(key,r);}
  const latestDates=[...new Set(q.rows.map(r=>String(r.trade_date).slice(0,10)))].sort().slice(-3);
  const trendRows=f.rows.filter(r=>latestDates.includes(String(r.trade_date).slice(0,10)));
  const trends=buildOiTrendBySymbolDate(trendRows);
  const supportQ=await pool.query(`SELECT DISTINCT symbol FROM futures_eod WHERE symbol=ANY($1) AND trade_date >= (SELECT MAX(trade_date) FROM cm_eod)-INTERVAL '120 days'`,[symbols]);
  const supported=new Set(supportQ.rows.map(r=>String(r.symbol).trim().toUpperCase()));
  return symbols.map(s=>{
    const history=(by.get(s)||[]).slice(-(PERIOD_ROWS[period]+20));
    const current=history.at(-1);
    const date=current?String(current.trade_date).slice(0,10):null;
    const exact=fm.get(`${s}|${date}`)||null;
    const futures=exact?{...exact,available:true,derivativesSupported:true,oiTrend3Day:trends.get(`${s}|${date}`)??null}:{available:false,derivativesSupported:supported.has(s),trade_date:date,oiTrend3Day:null};
    return evaluate(s,history,futures);
  });
}
async function scan(symbols,period='1D'){
  if(!symbols.length)return[];
  const table=period==='1D'?'scanner_results':'scanner_results_periods';
  const q=await pool.query(`SELECT * FROM ${table} WHERE symbol=ANY($1)${period==='1D'?'':' AND period=$2'}`,period==='1D'?[symbols]:[symbols,period]);
  const found=new Map(q.rows.map(r=>[r.symbol,rowFromMaterialized(r)]));
  const missing=symbols.filter(s=>!found.has(s));
  const live=missing.length?await liveScan(missing,period):[];
  const lm=new Map(live.map(r=>[r.symbol,r]));
  return symbols.map(s=>found.get(s)||lm.get(s)||evaluate(s,[],null));
}
app.get('/api/health',async(_req,res)=>{try{const[cm,fo,m]=await Promise.all([pool.query('SELECT MAX(trade_date) last_cm_date FROM cm_eod'),pool.query('SELECT MAX(trade_date) last_fo_date FROM futures_eod'),pool.query('SELECT COUNT(*)::int count,MAX(updated_at) updated_at FROM scanner_results')]);res.json({status:'ok',database:'connected',lastCmDate:cm.rows[0]?.last_cm_date||null,lastFoDate:fo.rows[0]?.last_fo_date||null,materializedSymbols:m.rows[0]?.count||0,materializedAt:m.rows[0]?.updated_at||null});}catch(e){res.status(503).json({status:'error',database:'unavailable',error:e.message});}});
app.get('/api/scanner/watchlist',async(req,res)=>{try{const period=normalizePeriod(req.query.period);res.json({symbols:watchlist,period,results:await scan(watchlist,period)});}catch(e){res.status(500).json({error:'Watchlist scan failed.',detail:e.message});}});
app.get('/api/scanner/scan',async(req,res)=>{try{const symbols=normalizeSymbols(req.query.symbols);if(!symbols.length)return res.status(400).json({error:'Provide at least one valid symbol.'});const period=normalizePeriod(req.query.period);res.json({results:await scan(symbols,period),period,asOf:new Date().toISOString()});}catch(e){res.status(500).json({error:'Scanner failed. No market data was fabricated.',detail:e.message});}});
app.get('/api/scanner/all',async(req,res)=>{try{const period=normalizePeriod(req.query.period);const q=await pool.query(`SELECT DISTINCT symbol FROM cm_eod WHERE series='EQ' ORDER BY symbol`);const symbols=q.rows.map(r=>r.symbol).slice(0,MAX_SYMBOLS);const results=await scan(symbols,period);res.json({results,count:results.length,period,asOf:new Date().toISOString()});}catch(e){res.status(500).json({error:'All-stock scanner failed. No market data was fabricated.',detail:e.message});}});
app.post('/api/scanner/query',async(req,res)=>{try{res.json(await runQuery(pool,req.body?.rule,{symbols:req.body?.symbols}));}catch(e){const status=Number(e.statusCode)||500;res.status(status).json({error:status===400?e.message:'Rule query failed. No market data was fabricated.'});}});
app.get('/api/scanner/saved',async(req,res)=>{try{const q=await pool.query('SELECT id,name,rule,created_at,updated_at FROM saved_scans WHERE owner_key=$1 ORDER BY updated_at DESC',[owner(req)]);res.json({scans:q.rows});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/scanner/saved',async(req,res)=>{try{const name=String(req.body?.name||'').trim().slice(0,120);if(!name||!req.body?.rule)return res.status(400).json({error:'name and rule are required'});const q=await pool.query('INSERT INTO saved_scans(owner_key,name,rule) VALUES($1,$2,$3) RETURNING id,name,rule,created_at,updated_at',[owner(req),name,req.body.rule]);res.status(201).json({scan:q.rows[0]});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/alerts/preferences',async(req,res)=>{try{const q=await pool.query('SELECT scanner_id,email_enabled,push_enabled,updated_at FROM alert_preferences WHERE owner_key=$1 ORDER BY scanner_id',[owner(req)]);res.json({preferences:q.rows});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/alerts/preferences',async(req,res)=>{try{const scannerId=String(req.body?.scannerId||'accumulation').slice(0,100);const q=await pool.query(`INSERT INTO alert_preferences(owner_key,scanner_id,email_enabled,push_enabled) VALUES($1,$2,$3,$4) ON CONFLICT(owner_key,scanner_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,push_enabled=EXCLUDED.push_enabled,updated_at=now() RETURNING *`,[owner(req),scannerId,!!req.body?.emailEnabled,!!req.body?.pushEnabled]);res.json({preference:q.rows[0]});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/alerts/history',async(req,res)=>{try{const q=await pool.query('SELECT * FROM alert_history WHERE owner_key=$1 ORDER BY created_at DESC LIMIT 200',[owner(req)]);res.json({history:q.rows});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/push/vapid-public-key',(_req,res)=>{if(!process.env.VAPID_PUBLIC_KEY)return res.status(503).json({error:'Push provider not configured.'});res.json({publicKey:process.env.VAPID_PUBLIC_KEY});});
app.post('/api/push/subscribe',async(req,res)=>{try{const s=req.body?.subscription;if(!s?.endpoint||!s?.keys?.p256dh||!s?.keys?.auth)return res.status(400).json({error:'Invalid push subscription.'});const q=await pool.query(`INSERT INTO push_subscriptions(owner_key,endpoint,p256dh,auth,invalidated_at) VALUES($1,$2,$3,$4,NULL) ON CONFLICT(endpoint) DO UPDATE SET owner_key=EXCLUDED.owner_key,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,invalidated_at=NULL RETURNING id`,[owner(req),s.endpoint,s.keys.p256dh,s.keys.auth]);res.status(201).json({id:q.rows[0].id});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/stock/:symbol',async(req,res)=>{try{const symbols=normalizeSymbols(req.params.symbol);if(symbols.length!==1)return res.status(400).json({error:'Invalid symbol.'});const period=normalizePeriod(req.query.period);const result=(await scan(symbols,period))[0];if(!result?.tradeDate)return res.status(404).json({error:`No verified EOD data for ${symbols[0]}.`});res.json({result,period});}catch(e){res.status(500).json({error:'Stock detail failed.',detail:e.message});}});
const publicRoot=path.resolve(__dirname,'../..');app.use(express.static(publicRoot,{extensions:['html'],index:'index.html'}));app.get('/scanner',(_req,res)=>res.sendFile(path.join(publicRoot,'scanner.html')));app.get('/',(_req,res)=>res.sendFile(path.join(publicRoot,'index.html')));
const port=Number(process.env.PORT)||3000;const server=app.listen(port,()=>console.log(`VIKRAM server listening on ${port}`));
const shutdown=signal=>{console.log(`${signal}: shutting down`);server.close(async()=>{await pool.end();process.exit(0);});};process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
