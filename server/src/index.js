const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { evaluate } = require('./scannerEngine');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const watchlist = ['ONGC', 'VBL', 'BSE', 'NMDC'];
const MAX_SYMBOLS = 200;

function normalizeSymbols(value) {
  return [...new Set(String(value || '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9&.-]{1,30}$/.test(s)))].slice(0, MAX_SYMBOLS);
}

async function loadScanData(symbols) {
  if (!symbols.length) return new Map();

  const cm = await pool.query(`
    WITH ranked AS (
      SELECT c.*, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn
      FROM cm_eod c
      WHERE c.series = 'EQ' AND c.symbol = ANY($1)
    )
    SELECT * FROM ranked WHERE rn <= 21 ORDER BY symbol, trade_date
  `, [symbols]);

  const bySymbol = new Map();
  for (const row of cm.rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }

  const latestDates = [...bySymbol.entries()].map(([symbol, rows]) => [symbol, rows[rows.length - 1].trade_date]);
  if (!latestDates.length) return bySymbol;

  const latestDate = latestDates.reduce((max, [, date]) => date > max ? date : max, latestDates[0][1]);
  const futures = await pool.query(`
    SELECT DISTINCT ON (f.symbol) f.symbol, f.trade_date, f.expiry, f.close, f.oi, f.change_oi,
           f.instrument_type, f.contract_name
    FROM futures_eod f
    JOIN (
      SELECT symbol, MAX(trade_date) AS trade_date
      FROM cm_eod
      WHERE series = 'EQ' AND symbol = ANY($1)
      GROUP BY symbol
    ) latest ON latest.symbol = f.symbol AND latest.trade_date = f.trade_date
    WHERE f.expiry >= f.trade_date
    ORDER BY f.symbol, f.expiry ASC
  `, [symbols]);

  const futuresBySymbol = new Map(futures.rows.map(row => [row.symbol, row]));
  return { bySymbol, futuresBySymbol, latestDate };
}

async function scan(symbols) {
  const data = await loadScanData(symbols);
  const bySymbol = data.bySymbol || new Map();
  const futuresBySymbol = data.futuresBySymbol || new Map();
  return symbols.map(symbol => evaluate(symbol, bySymbol.get(symbol) || [], futuresBySymbol.get(symbol) || null));
}

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT MAX(trade_date) AS last_cm_date,
             (SELECT MAX(trade_date) FROM futures_eod) AS last_fo_date
      FROM cm_eod
    `);
    const row = result.rows[0] || {};
    res.json({
      status: 'ok',
      database: 'connected',
      lastCmDate: row.last_cm_date,
      lastFoDate: row.last_fo_date
    });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable', error: error.message });
  }
});

app.get('/api/scanner/watchlist', (_req, res) => res.json({ symbols: watchlist }));

app.get('/api/scanner/scan', async (req, res) => {
  try {
    const symbols = normalizeSymbols(req.query.symbols);
    if (!symbols.length) return res.status(400).json({ error: 'Provide at least one valid symbol.' });
    const results = await scan(symbols);
    res.json({ results, asOf: new Date().toISOString() });
  } catch (error) {
    console.error('Scan failed:', error);
    res.status(500).json({ error: 'Scanner failed. No market data was fabricated.', detail: error.message });
  }
});

app.get('/api/scanner/all', async (_req, res) => {
  try {
    const universe = await pool.query(`SELECT DISTINCT symbol FROM cm_eod WHERE series='EQ' ORDER BY symbol`);
    const symbols = universe.rows.map(row => row.symbol).filter(Boolean);
    const results = await scan(symbols);
    res.json({ results, count: results.length, asOf: new Date().toISOString() });
  } catch (error) {
    console.error('All-stock scan failed:', error);
    res.status(500).json({ error: 'All-stock scanner failed. No market data was fabricated.', detail: error.message });
  }
});

app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const symbols = normalizeSymbols(req.params.symbol);
    if (symbols.length !== 1) return res.status(400).json({ error: 'Invalid symbol.' });
    const symbol = symbols[0];
    const data = await loadScanData([symbol]);
    const history = data.bySymbol.get(symbol) || [];
    if (!history.length) return res.status(404).json({ error: `No verified EOD data for ${symbol}.` });
    res.json({ result: evaluate(symbol, history, data.futuresBySymbol.get(symbol) || null) });
  } catch (error) {
    console.error('Stock detail failed:', error);
    res.status(500).json({ error: 'Stock detail failed.', detail: error.message });
  }
});

const publicRoot = path.resolve(__dirname, '../..');
app.use(express.static(publicRoot, { extensions: ['html'], index: 'index.html' }));
app.get('/scanner', (_req, res) => res.sendFile(path.join(publicRoot, 'accumulation.html')));
app.get('/', (_req, res) => res.sendFile(path.join(publicRoot, 'index.html')));

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`VIKRAM server listening on ${port}`));

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
