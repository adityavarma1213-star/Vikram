'use strict';
// Sector lookup.
//
// js/companyDatabase.js is real, documented data (see its own header:
// updated 17-Jul-2026 from an actual NSE bhavcopy for the price fields), but
// it is a browser file (`window.VIKRAM_COMPANY_DATABASE = ...`) and covers
// only a HANDFUL of tickers — verified: 5 entries. We do not `require()` or
// `eval()` it (it references `window`, which doesn't exist in Node, and
// executing arbitrary project JS as a side effect of a data lookup is bad
// practice regardless). Instead this does a narrow, safe text extraction of
// just the ticker/sector pairs.
//
// This is disclosed as SPARSE everywhere it's used: any symbol not in this
// tiny set returns null, and callers must treat that as
// "sector unknown for this symbol", not "no sector."

const fs = require('fs');
const path = require('path');

function loadSectorMap(filePath = path.join(__dirname, '..', '..', 'js', 'companyDatabase.js')) {
  const map = new Map();
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch (e) { return map; }

  // Matches each `"TICKER": { ... sector: "Sector Name" ... }` block loosely,
  // by finding a ticker key followed eventually by a sector field before the
  // next ticker key. Deliberately simple/conservative: if the file's shape
  // changes enough that this stops matching, it fails safe (returns fewer
  // entries), never crashes and never fabricates a sector.
  const tickerBlockRe = /"([A-Z0-9&.\-]+)":\s*\{([^}]*)\}/g;
  let m;
  while ((m = tickerBlockRe.exec(text)) !== null) {
    const ticker = m[1];
    const block = m[2];
    const sectorMatch = block.match(/sector:\s*"([^"]+)"/);
    if (sectorMatch) map.set(ticker.toUpperCase(), sectorMatch[1]);
  }
  return map;
}

module.exports = { loadSectorMap };
