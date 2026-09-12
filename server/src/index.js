const path=require('node:path');
const express=require('express');
const {Pool}=require('pg');
const {evaluate}=require('./scannerEngine');
const {buildOiTrendBySymbolDate}=require('./scanMaterializer');
const {runQuery}=require('./ruleEngine/query');
const {runAlertPipeline}=require('./alerts/alertEngine');
const push=require('./alerts/providers/push');
const {hashPassword,verifyPassword,sign,requireAuth,normalizeEmail,validCredentials}=require('./auth');
const {liveMarketDataStatus}=require('./liveData/gate');
const {TokenManager}=require('./liveData/tokenManager');
const liveTokenManager=new TokenManager();
const app=express(); app.disable('x-powered-by'); app.use(express.json({limit:'100kb'}));
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required');process.exit(1);}
if(!process.env.AUTH_SECRET||process.env.AUTH_SECRET.length<16){console.error('AUTH_SECRET is required (>=16 chars) to run the server securely');process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=require')?{rejectUnauthorized:false}:undefined,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
const requireAuthMw=requireAuth(pool); // DB-aware: also checks token_version so logout revokes tokens immediately
// #6 remediation: MAX_SYMBOLS=200 used to do double duty as both (a) a sane cap on how many
// symbols one ad-hoc `?symbols=` query string may request, and (b) — via
// `.slice(0,MAX_SYMBOLS)` in /api/scanner/all below — a hard ceiling on how much of the NSE
// universe the "full universe" endpoint could ever return, even though thousands of symbols
// exist in cm_eod. (b) was the actual production blocker: the provider/query-string limit for a
// single ad-hoc request has nothing to do with how many symbols the full-universe scan may cover.
// These are now two independent constants: MAX_QUERY_SYMBOLS still bounds one ad-hoc request
// (protects against a pathological query string), while /api/scanner/all processes the entire
// distinct universe in controlled batches (SCAN_BATCH_SIZE) with per-batch failure isolation —
// no cap on total symbols processed.
const watchlist=['ONGC','VBL','BSE','NMDC'],MAX_QUERY_SYMBOLS=200,SCAN_BATCH_SIZE=250,PERIOD_ROWS={'1D':1,'1W':5,'1M':22,'3M':66,'6M':132,'1Y':252},VALID_PERIODS=new Set(Object.keys(PERIOD_ROWS));
const normalizeSymbols=v=>[...new Set(String(v||'').split(',').map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z0-9&.-]{1,30}$/.test(s)))].slice(0,MAX_QUERY_SYMBOLS);
function chunk(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
// Process the full symbol universe in bounded batches so memory stays controlled and a failure
// in one batch (e.g. a transient DB hiccup) doesn't abort symbols in other batches; each failed
// batch's symbols fall back to an explicit not-scanned placeholder rather than being silently
// dropped or fabricated.
async function scanUniverse(symbols,period){
  const batches=chunk(symbols,SCAN_BATCH_SIZE);
  const results=[];
  for(const batch of batches){
    try{
      results.push(...await scan(batch,period));
    }catch(e){
      console.error(`scanUniverse: batch of ${batch.length} symbol(s) failed: ${e.message}`);
      for(const s of batch)results.push({symbol:s,tradeDate:null,score:null,verdict:'DATA N/A',metrics:{},why:[`Scan failed for this batch: ${e.message}`],materialized:false});
    }
  }
  return results;
}
const normalizePeriod=v=>VALID_PERIODS.has(String(v||'').toUpperCase())?String(v).toUpperCase():'1D';
// Identity for private, per-user data is ALWAYS the server-verified req.userId set by requireAuth
// (see ./auth.js) — never a client-supplied header. req.userId is only present after requireAuth
// has verified a signed session token, so this cannot be spoofed by a forged request header.
const owner=req=>String(req.userId);
const rowFromMaterialized=r=>({symbol:r.symbol,tradeDate:r.trade_date,score:r.score,verdict:r.verdict,metrics:r.metrics,why:r.why,detection:r.detection||null,materialized:true,updatedAt:r.updated_at});
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
app.get('/api/health',async(_req,res)=>{try{const[cm,fo,m]=await Promise.all([pool.query('SELECT MAX(trade_date) last_cm_date FROM cm_eod'),pool.query('SELECT MAX(trade_date) last_fo_date FROM futures_eod'),pool.query('SELECT COUNT(*)::int count,MAX(updated_at) updated_at FROM scanner_results')]);res.json({status:'ok',database:'connected',lastCmDate:cm.rows[0]?.last_cm_date||null,lastFoDate:fo.rows[0]?.last_fo_date||null,materializedSymbols:m.rows[0]?.count||0,materializedAt:m.rows[0]?.updated_at||null,liveMarketData:liveMarketDataStatus(liveTokenManager)});}catch(e){res.status(503).json({status:'error',database:'unavailable',error:e.message});}});
app.get('/api/scanner/watchlist',async(req,res)=>{try{const period=normalizePeriod(req.query.period);res.json({symbols:watchlist,period,results:await scan(watchlist,period)});}catch(e){res.status(500).json({error:'Watchlist scan failed.',detail:e.message});}});
app.get('/api/scanner/scan',async(req,res)=>{try{const symbols=normalizeSymbols(req.query.symbols);if(!symbols.length)return res.status(400).json({error:'Provide at least one valid symbol.'});const period=normalizePeriod(req.query.period);res.json({results:await scan(symbols,period),period,asOf:new Date().toISOString()});}catch(e){res.status(500).json({error:'Scanner failed. No market data was fabricated.',detail:e.message});}});
app.get('/api/scanner/all',async(req,res)=>{try{const period=normalizePeriod(req.query.period);const q=await pool.query(`SELECT DISTINCT symbol FROM cm_eod WHERE series='EQ' ORDER BY symbol`);const symbols=q.rows.map(r=>r.symbol);const results=await scanUniverse(symbols,period);res.json({results,count:results.length,universeSize:symbols.length,period,asOf:new Date().toISOString()});}catch(e){res.status(500).json({error:'All-stock scanner failed. No market data was fabricated.',detail:e.message});}});
// Hidden Gems (Blueprint §13-§14) — RESEARCH-ONLY endpoint. Every threshold is provisional and
// unvalidated (see hiddenGems/config.js); this is a keep-this-honest boundary, not a production
// signal. institutionalData/newsData are always null here because no real feed is connected yet
// (never fabricated) — most results will genuinely read DATA_INSUFFICIENT as a result, which is
// the correct, honest behavior, not a bug.
app.get('/api/hidden-gems',async(req,res)=>{try{
  const hiddenGems=require('../../hiddenGems/engine');
  const confirmedQ=await pool.query(`SELECT symbol FROM scanner_results WHERE verdict='ACCUMULATION CONFIRMED' ORDER BY symbol LIMIT 500`);
  const symbols=confirmedQ.rows.map(r=>r.symbol);
  if(!symbols.length)return res.json({researchOnly:true,validated:false,configVersion:require('../../hiddenGems/config').configVersion,results:[],note:'No ACCUMULATION CONFIRMED symbols are currently materialized.'});
  const q=await pool.query(`WITH ranked AS (SELECT c.*,ROW_NUMBER() OVER(PARTITION BY symbol ORDER BY trade_date DESC) rn FROM cm_eod c WHERE c.series='EQ' AND c.symbol=ANY($1)) SELECT * FROM ranked WHERE rn <= 40 ORDER BY symbol,trade_date`,[symbols]);
  const bySymbol=new Map();for(const r of q.rows){if(!bySymbol.has(r.symbol))bySymbol.set(r.symbol,[]);bySymbol.get(r.symbol).push(r);}
  const results=symbols.map(symbol=>{
    const history=bySymbol.get(symbol)||[];
    if(!history.length)return {symbol,classification:'DATA_INSUFFICIENT',reason:'No history available.'};
    const current=history.at(-1);
    // institutionalData and newsData are always null: no real feed is connected. This is the
    // honest state, not a placeholder to be silently filled in later.
    return hiddenGems.evaluate({symbol,history,current,futures:{available:false,derivativesSupported:false,trade_date:current.trade_date},institutionalData:null,newsData:null});
  });
  res.json({researchOnly:true,validated:false,configVersion:results[0]?.configVersion||null,universeSize:symbols.length,results,asOf:new Date().toISOString()});
}catch(e){res.status(500).json({error:'Hidden Gems research pass failed. No classification was fabricated.',detail:e.message});}});
app.post('/api/scanner/query',async(req,res)=>{try{res.json(await runQuery(pool,req.body?.rule,{symbols:req.body?.symbols}));}catch(e){const status=Number(e.statusCode)||500;res.status(status).json({error:status===400?e.message:'Rule query failed. No market data was fabricated.'});}});
// --- Authentication (public routes: anyone may attempt to register/login) ---
app.post('/api/auth/register',async(req,res)=>{try{const email=normalizeEmail(req.body?.email);const password=req.body?.password;if(!validCredentials(email,password))return res.status(400).json({error:'Valid email and password (>=8 chars) are required.'});const existing=await pool.query('SELECT id FROM users WHERE email=$1',[email]);if(existing.rowCount)return res.status(409).json({error:'An account with that email already exists.'});const q=await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,token_version',[email,hashPassword(password)]);res.status(201).json({token:sign(q.rows[0].id,q.rows[0].token_version),user:{id:q.rows[0].id,email:q.rows[0].email}});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/auth/login',async(req,res)=>{try{const email=normalizeEmail(req.body?.email);const password=req.body?.password;const q=await pool.query('SELECT id,email,password_hash,token_version FROM users WHERE email=$1',[email]);const user=q.rows[0];const ok=user&&verifyPassword(password,user.password_hash);if(!ok)return res.status(401).json({error:'Invalid email or password.'});res.json({token:sign(user.id,user.token_version),user:{id:user.id,email:user.email}});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/auth/me',requireAuthMw,async(req,res)=>{try{const q=await pool.query('SELECT id,email FROM users WHERE id=$1',[req.userId]);if(!q.rowCount)return res.status(401).json({error:'Authentication required.'});res.json({user:q.rows[0]});}catch(e){res.status(500).json({error:e.message});}});
// #10 follow-up: logout immediately invalidates every previously issued token for this user (see requireAuth in ./auth.js), not just the client that called this.
app.post('/api/auth/logout',requireAuthMw,async(req,res)=>{try{await pool.query('UPDATE users SET token_version=token_version+1 WHERE id=$1',[req.userId]);res.json({loggedOut:true});}catch(e){res.status(500).json({error:e.message});}});

// --- Private, per-user routes: require a valid server-verified session (see ./auth.js) ---
app.get('/api/scanner/saved',requireAuthMw,async(req,res)=>{try{const q=await pool.query('SELECT id,name,rule,created_at,updated_at FROM saved_scans WHERE owner_key=$1 ORDER BY updated_at DESC',[owner(req)]);res.json({scans:q.rows});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/scanner/saved',requireAuthMw,async(req,res)=>{try{const name=String(req.body?.name||'').trim().slice(0,120);if(!name||!req.body?.rule)return res.status(400).json({error:'name and rule are required'});const q=await pool.query('INSERT INTO saved_scans(owner_key,name,rule) VALUES($1,$2,$3) RETURNING id,name,rule,created_at,updated_at',[owner(req),name,req.body.rule]);res.status(201).json({scan:q.rows[0]});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/alerts/preferences',requireAuthMw,async(req,res)=>{try{const q=await pool.query('SELECT scanner_id,email_enabled,push_enabled,updated_at FROM alert_preferences WHERE owner_key=$1 ORDER BY scanner_id',[owner(req)]);res.json({preferences:q.rows});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/alerts/preferences',requireAuthMw,async(req,res)=>{try{const scannerId=String(req.body?.scannerId||'accumulation').slice(0,100);const q=await pool.query(`INSERT INTO alert_preferences(owner_key,scanner_id,email_enabled,push_enabled) VALUES($1,$2,$3,$4) ON CONFLICT(owner_key,scanner_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,push_enabled=EXCLUDED.push_enabled,updated_at=now() RETURNING *`,[owner(req),scannerId,!!req.body?.emailEnabled,!!req.body?.pushEnabled]);res.json({preference:q.rows[0]});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/alerts/history',requireAuthMw,async(req,res)=>{try{const q=await pool.query('SELECT * FROM alert_history WHERE owner_key=$1 ORDER BY created_at DESC LIMIT 200',[owner(req)]);res.json({history:q.rows});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/push/vapid-public-key',(_req,res)=>{if(!process.env.VAPID_PUBLIC_KEY)return res.status(503).json({error:'Push provider not configured.'});res.json({publicKey:process.env.VAPID_PUBLIC_KEY});});
app.post('/api/push/subscribe',requireAuthMw,async(req,res)=>{try{const s=req.body?.subscription;if(!s?.endpoint||!s?.keys?.p256dh||!s?.keys?.auth)return res.status(400).json({error:'Invalid push subscription.'});const q=await pool.query(`INSERT INTO push_subscriptions(owner_key,endpoint,p256dh,auth,invalidated_at) VALUES($1,$2,$3,$4,NULL) ON CONFLICT(endpoint) DO UPDATE SET owner_key=EXCLUDED.owner_key,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,invalidated_at=NULL RETURNING id`,[owner(req),s.endpoint,s.keys.p256dh,s.keys.auth]);res.status(201).json({id:q.rows[0].id});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/stock/:symbol',async(req,res)=>{try{const symbols=normalizeSymbols(req.params.symbol);if(symbols.length!==1)return res.status(400).json({error:'Invalid symbol.'});const period=normalizePeriod(req.query.period);const result=(await scan(symbols,period))[0];if(!result?.tradeDate)return res.status(404).json({error:`No verified EOD data for ${symbols[0]}.`});res.json({result,period});}catch(e){res.status(500).json({error:'Stock detail failed.',detail:e.message});}});
const publicRoot=path.resolve(__dirname,'../..');app.use(express.static(publicRoot,{extensions:['html'],index:'index.html'}));app.get('/scanner',(_req,res)=>res.sendFile(path.join(publicRoot,'scanner.html')));app.get('/',(_req,res)=>res.sendFile(path.join(publicRoot,'index.html')));
const port=Number(process.env.PORT)||3000;const server=app.listen(port,()=>console.log(`VIKRAM server listening on ${port}`));
const shutdown=signal=>{console.log(`${signal}: shutting down`);server.close(async()=>{await pool.end();process.exit(0);});};process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
