'use strict';
// Instrument (security ID) mapping. NOTHING is hard-coded here.
// Source of truth: Dhan's official compact scrip master CSV,
//   https://images.dhan.co/api-data/api-scrip-master.csv   (documented at
//   https://dhanhq.co/docs/v2/instruments/ ). The operator downloads it manually and points
//   DHAN_SCRIP_MASTER_PATH at it (default: server/data-local/api-scrip-master.csv, git-ignored).
// This module never fetches a URL. Freshness = the file's modified time, reported to the user.
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { SCRIP_MASTER_SOURCE } = require('./config');

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'data-local', 'api-scrip-master.csv');
const col = (row, names) => { for (const n of names) if (row[n] !== undefined) return String(row[n]).trim(); return ''; };

function parseScripMaster(text) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true });
  const bySymbol = new Map();
  let skipped = 0;
  for (const r of rows) {
    const exch = col(r, ['SEM_EXM_EXCH_ID', 'EXCH_ID']);
    const seg = col(r, ['SEM_SEGMENT', 'SEGMENT']);
    const instr = col(r, ['SEM_INSTRUMENT_NAME', 'INSTRUMENT']);
    const series = col(r, ['SEM_SERIES', 'SERIES']);
    const id = col(r, ['SEM_SMST_SECURITY_ID', 'SECURITY_ID']);
    const sym = col(r, ['SEM_TRADING_SYMBOL', 'SYMBOL_NAME']).toUpperCase();
    if (exch !== 'NSE' || seg !== 'E' || instr !== 'EQUITY' || (series && series !== 'EQ')) { skipped++; continue; }
    if (!/^\d{1,9}$/.test(id) || !/^[A-Z0-9&-]{1,30}$/.test(sym)) { skipped++; continue; }
    if (!bySymbol.has(sym)) bySymbol.set(sym, { symbol: sym, securityId: id, exchangeSegment: 'NSE_EQ', instrument: 'EQUITY', name: col(r, ['SEM_CUSTOM_SYMBOL', 'DISPLAY_NAME']) || sym });
  }
  return { bySymbol, totalRows: rows.length, skipped };
}

let cache = null;
function loadInstruments(filePath = process.env.DHAN_SCRIP_MASTER_PATH || DEFAULT_PATH) {
  let st;
  try { st = fs.statSync(filePath); } catch (_e) {
    return { ok: false, reason: 'Instrument file not found. Download the official Dhan scrip master and set DHAN_SCRIP_MASTER_PATH (see docs/DHAN_HISTORICAL_DOWNLOADER.md).' };
  }
  if (cache && cache.path === filePath && cache.mtimeMs === st.mtimeMs) return cache.value;
  let parsed;
  try { parsed = parseScripMaster(fs.readFileSync(filePath, 'utf8')); } catch (_e) {
    return { ok: false, reason: 'Instrument file could not be parsed as CSV.' };
  }
  if (!parsed.bySymbol.size) return { ok: false, reason: 'Instrument file has no NSE equity rows. Check the column names against Dhan docs.' };
  const ageDays = Math.floor((Date.now() - st.mtimeMs) / 86400000);
  const value = { ok: true, bySymbol: parsed.bySymbol, count: parsed.bySymbol.size, fileModified: new Date(st.mtimeMs).toISOString(), ageDays, stale: ageDays > 30,
    source: SCRIP_MASTER_SOURCE };
  cache = { path: filePath, mtimeMs: st.mtimeMs, value };
  return value;
}

function lookupSymbol(master, symbol) { return master.ok ? master.bySymbol.get(String(symbol).toUpperCase()) || null : null; }
function searchSymbols(master, q, limit = 20) {
  if (!master.ok) return [];
  const needle = String(q || '').toUpperCase().replace(/[^A-Z0-9&-]/g, '');
  if (needle.length < 1) return [];
  const out = [];
  for (const v of master.bySymbol.values()) { if (v.symbol.startsWith(needle)) { out.push(v); if (out.length >= limit) break; } }
  return out;
}

module.exports = { parseScripMaster, loadInstruments, lookupSymbol, searchSymbols, DEFAULT_PATH };
