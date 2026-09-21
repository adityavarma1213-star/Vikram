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

// Forensic UI finding: the deployed page must not depend on a browser-native select hitbox.
// Visible deterministic buttons own the click target; canonical selects remain as state controls.
for (const id of ['universeFilterTrigger', 'verdictFilterTrigger', 'scoreFilterTrigger', 'sortSelectTrigger']) {
  assert.equal((index.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' trigger must exist exactly once');
}
for (const id of ['universeFilterMenu', 'verdictFilterMenu', 'scoreFilterMenu', 'sortSelectMenu']) {
  assert.equal((index.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' menu must exist exactly once');
}
assert.ok(index.includes('class="radar-filter-trigger"'), 'visible filter triggers must be real buttons');
assert.ok(index.includes('class="radar-filter-menu"'), 'filter menus must be present');
assert.ok(index.includes('setupRadarFilterMenu('), 'custom filter menu setup must be wired');
assert.ok(index.includes('select.value = option.dataset.value;'), 'custom menu must update canonical select state');
assert.ok(index.includes('tablePage = 1;\n        render();'), 'custom menu selection must directly re-render the canonical filtered rows');
const nativeCssStart = index.indexOf('.radar-native-select{');
assert.ok(nativeCssStart >= 0, 'canonical native select CSS must exist');
const nativeCss = index.slice(nativeCssStart, nativeCssStart + 500);
assert.ok(nativeCss.includes('pointer-events:none'), 'hidden canonical select must not steal pointer events');
assert.ok(nativeCss.includes('opacity:0'), 'hidden canonical select must not be visible');
assert.ok(index.includes('radar-filter-option'), 'menu options must be real buttons');

// The scanner logic must use exact universe membership and separate text filtering from sorting.
// Verdict matching must be normalization-tolerant at the UI boundary; the engine enum itself is unchanged.
assert.ok(index.includes('normalizeVerdictFilterValue'), 'verdict filter normalization helper must exist');
assert.ok(index.includes('verdictMatches(r.verdict, v)'), 'render must use normalized verdict matching');
assert.ok(index.includes("replace(/\\\\s+/g, ' ')") || index.includes("replace(/\\s+/g, ' ')"), 'verdict normalization must collapse whitespace');

assert.ok(index.includes('window.VikramUniverseMembership.matchesUniverse'));
assert.ok(index.includes('window.VikramTableControls.filterRows') || index.includes('filterRows ? filterRows'));
assert.ok(index.includes('sortRows(textFiltered, sortState.key, sortState.direction)'));

console.log('opportunityRadarFilters.test.js: PASS');
