const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { evaluate } = require('./scannerEngine');
const { runQuery } = require('./ruleEngine/query');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
const watchlist = ['ONGC', 'VBL', 'BSE', 'NMDC'];
const MAX_SYMBOLS = 200;
const PERIOD_ROWS = { '1D': 1, '1W': 5, '1M': 22, '3M': 66, '6M': 132, '1Y': 252 };
const VALID_PERIODS = new Set(Object.keys(PERIOD_ROWS));
function normalizeSymbols(value) { return [...new Set(String(value || '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9&.-]{1,30}$/.test(s)))].slice(0, MAX_SYMBOLS); }
function normalizePeriod(value) { return VALID_PERIODS.has(String(value || '').toUpperCase()) ? String(value).toUpperCase() : '1D'; }
function rowFromMaterialized(row) { return { symbol: row.symbol, tradeDate: row.trade_date, score: row.score, verdict: row.verdict, metrics: row.metrics, why: row.why, materialized: true, updatedAt: row.updated_at }; }
async function liveScan(symbols, period = '1D') {
  if (!symbols.length) return [];
  const rowsNeeded = PERIOD_ROWS[period] + 20;
  const q = await pool.query(`WITH ranked AS (SELECT c.*, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn FROM cm_eod c WHERE c.series='EQ' AND c.symbol=ANY($1)) SELECT * FROM ranked WHERE rn <= $2 ORDER BY symbol, trade_date`, [symbols, rowsNeeded]);
  const by = new Map(); for (const row of q.rows) { if (!by.has(row.symbol)) by.set(row.symbol, []); by.get(row.symbol).push(row); }
  const f = await pool.query(`SELECT DISTINCT ON (symbol) symbol, trade_date, expiry, close, oi, change_oi, instrument_type, contract_name FROM futures_eod WHERE symbol=ANY($1) AND expiry >= trade_date ORDER BY symbol, trade_date DESC, expiry ASC`, [symbols]);
  const fm = new Map(f.rows.map(row => [row.symbol, row]));
  return symbols.map(symbol => evaluate(symbol, (by.get(symbol) || []).slice(-(PERIOD_ROWS[period] + 20)), fm.get(symbol) || null));
}
async function scan(symbols, period = '1D') {
  if (period !== '1D') return liveScan(symbols, period);
  const q = await pool.query(`SELECT * FROM scanner_results WHERE symbol=ANY($1)`, [symbols]);
  const found = new Map(q.rows.map(row => [row.symbol, rowFromMaterialized(row)]));
  const missing = symbols.filter(symbol => !found.has(symbol)); const live = missing.length ? await liveScan(missing, period) : [];
  const liveMap = new Map(live.map(row => [row.symbol, row])); return symbols.map(symbol => found.get(symbol) || liveMap.get(symbol) || evaluate(symbol, [], null));
}
app.get('/api/health', async (_req, res) => { try { const [cm, fo, materialized] = await Promise.all([pool.query(`SELECT MAX(trade_date) AS last_cm_date FROM cm_eod`), pool.query(`SELECT MAX(trade_date) AS last_fo_date FROM futures_eod`), pool.query(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS updated_at FROM scanner_results`)]); res.json({ status:'ok', database:'connected', lastCmDate:cm.rows[0]?.last_cm_date||null, lastFoDate:fo.rows[0]?.last_fo_date||null, materializedSymbols:materialized.rows[0]?.count||0, materializedAt:materialized.rows[0]?.updated_at||null }); } catch(error) { res.status(503).json({status:'error',database:'unavailable',error:error.message}); } });
app.get('/api/scanner/watchlist', async (req,res)=>{ try { const period=normalizePeriod(req.query.period); res.json({symbols:watchlist,period,results:await scan(watchlist,period)}); } catch(error) { res.status(500).json({error:'Watchlist scan failed.',detail:error.message}); } });
app.get('/api/scanner/scan', async (req,res)=>{ try { const symbols=normalizeSymbols(req.query.symbols); if(!symbols.length)return res.status(400).json({error:'Provide at least one valid symbol.'}); const period=normalizePeriod(req.query.period); res.json({results:await scan(symbols,period),period,asOf:new Date().toISOString()}); } catch(error) { console.error('Scan failed:',error); res.status(500).json({error:'Scanner failed. No market data was fabricated.',detail:error.message}); } });
app.get('/api/scanner/all', async (req,res)=>{ try { const period=normalizePeriod(req.query.period); const q=await pool.query(`SELECT DISTINCT symbol FROM cm_eod WHERE series='EQ' ORDER BY symbol`); const symbols=q.rows.map(row=>row.symbol).slice(0,MAX_SYMBOLS); const results=await scan(symbols,period); res.json({results,count:results.length,period,asOf:new Date().toISOString()}); } catch(error) { console.error('All-stock scan failed:',error); res.status(500).json({error:'All-stock scanner failed. No market data was fabricated.',detail:error.message}); } });
app.post('/api/scanner/query', async (req,res)=>{ try { const result=await runQuery(pool,req.body?.rule,{symbols:req.body?.symbols}); res.json(result); } catch(error) { const status=Number(error.statusCode)||500; res.status(status).json({error:status===400?error.message:'Rule query failed. No market data was fabricated.'}); } });
app.get('/api/stock/:symbol', async (req,res)=>{ try { const symbols=normalizeSymbols(req.params.symbol); if(symbols.length!==1)return res.status(400).json({error:'Invalid symbol.'}); const symbol=symbols[0]; const period=normalizePeriod(req.query.period); const result=(await liveScan([symbol],period))[0]; if(!result||!result.tradeDate)return res.status(404).json({error:`No verified EOD data for ${symbol}.`}); res.json({result,period}); } catch(error) { console.error('Stock detail failed:',error); res.status(500).json({error:'Stock detail failed.',detail:error.message}); } });
const publicRoot=path.resolve(__dirname,'../..'); app.use(express.static(publicRoot,{extensions:['html'],index:'index.html'})); app.get('/scanner',(_req,res)=>res.sendFile(path.join(publicRoot,'accumulation.html'))); app.get('/',(_req,res)=>res.sendFile(path.join(publicRoot,'index.html')));
const port=Number(process.env.PORT)||3000; const server=app.listen(port,()=>console.log(`VIKRAM server listening on ${port}`));
async function shutdown(signal){console.log(`${signal}: shutting down`);server.close(async()=>{await pool.end();process.exit(0);});}
process.on('SIGTERM',()=>shutdown('SIGTERM')); process.on('SIGINT',()=>shutdown('SIGINT'));