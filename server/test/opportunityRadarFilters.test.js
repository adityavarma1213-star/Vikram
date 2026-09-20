'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// DOM contract: every user-facing Opportunity Radar filter must exist exactly once.
for (const id of ['universeFilter', 'verdictFilter', 'scoreFilter', 'sortSelect', 'tableSearch']) {
  const count = (index.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  assert.equal(count, 1, id + ' must exist exactly once');
}

// Universe options are the real supported universe choices.
for (const option of ['All Stocks', 'Nifty 50', 'Nifty 200', 'Nifty 500']) {
  assert.ok(index.includes('>' + option + '</option>'), 'missing universe option: ' + option);
}

// Verdict options must match the real four-value scanner enum; no obsolete Quiet Absorption option.
for (const option of ['All Verdicts', 'Confirmed', 'Starting', 'Unconfirmed / Mixed', 'Distribution']) {
  assert.ok(index.includes('>' + option + '</option>'), 'missing verdict option: ' + option);
}
assert.equal(index.includes('>Quiet Absorption</option>'), false, 'obsolete Quiet Absorption option must not return');

// Score and sort options must correspond to implemented filter/sort keys.
for (const option of ['Any', '≥ 75', '≥ 55', '≥ 50', 'Score – High to Low', 'Score – Low to High', 'Price – High to Low', 'Price – Low to High', 'Volume – High to Low', 'Delivery – High to Low', 'Stock – A to Z']) {
  assert.ok(index.includes('>' + option + '</option>'), 'missing control option: ' + option);
}

// Interaction contract: filter changes re-render the verified row set; sort and search are wired separately.
assert.ok(index.includes("[universe,verdict,score].forEach(el => el.addEventListener('change'"));
assert.ok(index.includes("sortSelect.addEventListener('change'"));
assert.ok(index.includes("tableSearch) tableSearch.addEventListener('input'"));
assert.ok(index.includes("clearScannerFilters"));
assert.ok(index.includes("data-quick-filter"));

// Forensic UI finding: native selects must remain real, visible, pointer-enabled controls.
// The prior absolute/near-transparent select hitbox was browser-fragile and is prohibited here.
const filterCssStart = index.indexOf('.radar-filter-chip select{');
assert.ok(filterCssStart >= 0, 'radar filter select CSS must exist');
const filterCss = index.slice(filterCssStart, filterCssStart + 700);
assert.ok(filterCss.includes('position:relative'), 'filter select must use normal flow positioning');
assert.ok(filterCss.includes('pointer-events:auto'), 'filter select must accept pointer events');
assert.ok(filterCss.includes('opacity:1'), 'filter select must remain visible');
assert.equal(filterCss.includes('position:absolute'), false, 'filter select must not use fragile absolute hitbox');
assert.equal(filterCss.includes('opacity:.02'), false, 'filter select must not use fragile transparent hitbox');

// The scanner logic must use exact universe membership and separate text filtering from sorting.
assert.ok(index.includes('window.VikramUniverseMembership.matchesUniverse'));
assert.ok(index.includes('window.VikramTableControls.filterRows') || index.includes('filterRows ? filterRows'));
assert.ok(index.includes('sortRows(textFiltered, sortState.key, sortState.direction)'));

console.log('opportunityRadarFilters.test.js: PASS');
