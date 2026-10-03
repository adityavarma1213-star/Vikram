#!/usr/bin/env node
// Builds data/rsi-snapshot.json — the ONE canonical RSI dataset consumed by
// every scanner surface (Master/All Scanner, Accumulation Scanner,
// Opportunity Radar, Hidden Gems). Reads only verified NSE EOD CM history
// already on disk (data/market-history/*.json). Writes nothing into V15
// scoring/config — this is an additive, read-only-input build step.
'use strict';
const fs = require('fs');
const path = require('path');
const RSI = require('../js/rsiEngine.js');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
const OUT_FILE = path.join(ROOT, 'data', 'rsi-snapshot.json');

function loadDailyCloses() {
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // filenames are ISO dates, so lexicographic sort == chronological

  // symbol -> [{date, close}, ...] ascending
  const bySymbol = new Map();
  let lastDate = null;

  for (const file of files) {
    const full = path.join(HISTORY_DIR, file);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      continue; // corrupt/unreadable day: skip, do not fabricate a close
    }
    const date = parsed.tradeDate || file.replace('.json', '');
    const cm = Array.isArray(parsed.cm) ? parsed.cm : [];
    for (const row of cm) {
      if (!row || !row.symbol || typeof row.close !== 'number' || !Number.isFinite(row.close)) continue;
      if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
      bySymbol.get(row.symbol).push({ date, close: row.close });
    }
    lastDate = date;
  }
  return { bySymbol, lastDate };
}

function build() {
  const { bySymbol, lastDate } = loadDailyCloses();
  const out = {};
  for (const [symbol, bars] of bySymbol.entries()) {
    // bars arrive in file order (chronological, since filenames sort chronologically);
    // sort defensively in case of any out-of-order entries within a file set.
    bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    out[symbol] = RSI.computeCanonicalRsi(bars);
  }
  const snapshot = {
    status: 'ok',
    asOf: lastDate,
    generatedAt: new Date().toISOString(),
    source: 'Canonical RSI engine (js/rsiEngine.js) over verified NSE EOD CM history (data/market-history)',
    rsiPeriod: RSI.RSI_PERIOD,
    symbolCount: Object.keys(out).length,
    bySymbol: out
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot));
  console.log(`rsi-snapshot.json written: ${snapshot.symbolCount} symbols, asOf ${snapshot.asOf}`);
}

if (require.main === module) build();
module.exports = { loadDailyCloses, build };
