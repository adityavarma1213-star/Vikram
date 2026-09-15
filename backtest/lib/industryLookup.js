'use strict';
// Industry lookup.
//
// Sibling to `sectorLookup.js` (unmodified, protected, completed file) —
// deliberately a SEPARATE new file rather than an edit to that one, per the
// "do not modify completed engines unnecessarily" rule. Same real,
// disclosed data source (`js/companyDatabase.js`), same narrow, safe text
// extraction (never `require()`/`eval()`'d), same sparse-coverage
// disclosure: verified 5 tickers total.

const fs = require('fs');
const path = require('path');

function loadIndustryMap(filePath = path.join(__dirname, '..', '..', 'js', 'companyDatabase.js')) {
  const map = new Map();
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch (e) { return map; }

  const tickerBlockRe = /"([A-Z0-9&.\-]+)":\s*\{([^}]*)\}/g;
  let m;
  while ((m = tickerBlockRe.exec(text)) !== null) {
    const ticker = m[1];
    const block = m[2];
    const industryMatch = block.match(/industry:\s*"([^"]+)"/);
    if (industryMatch) map.set(ticker.toUpperCase(), industryMatch[1]);
  }
  return map;
}

module.exports = { loadIndustryMap };
