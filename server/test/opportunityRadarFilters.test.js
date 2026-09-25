'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// ============================================================================================
// Opportunity Radar filter architecture, as of the 2026-09-22 redesign:
//   - the separate Verdict/Score/Sort trigger+menu bar above the table is GONE (by explicit,
//     later instruction: "click a header, filter/sort options open, not a separate bar");
//   - Universe moved from that bar to a pill group;
//   - every interactive table header opens ONE shared menu (COLUMN_MENUS/openColMenu), reusing
//     the SAME canonical <select> state universe/verdict/score/sort always had.
// This file supersedes its own previous version, which asserted the retired chip/trigger/menu
// architecture (setupRadarFilterMenu, radar-filter-trigger, a per-control #<id>Trigger/#<id>Menu
// pair, and the old desynced `sortState` variable that the sort-fix round before this one
// deliberately removed in favor of reading #sortSelect.value directly). Those checks are replaced
// below with checks against the current, actual DOM contract.
// ============================================================================================

// DOM contract: every canonical filter/sort <select> still exists exactly once (hidden, but the
// single source of truth -- unchanged by the redesign, since Universe/Verdict/Score/Sort all still
// need ONE place holding "what is currently selected").
for (const id of ['universeFilter', 'verdictFilter', 'scoreFilter', 'sortSelect', 'tableSearch']) {
  const count = (index.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  assert.equal(count, 1, id + ' must exist exactly once');
}

// Universe options are the real, verified universe choices only (Point 5: no invented/faked
// membership -- NIFTY 100/Next 50/Midcap/Smallcap/Microcap/Total Market/F&O/Cash are NOT offered).
for (const option of ['All Stocks', 'Nifty 50', 'Nifty 200', 'Nifty 500']) {
  assert.ok(index.includes('>' + option + '</option>'), 'missing universe option: ' + option);
}
for (const bogus of ['Nifty 100', 'Nifty Next 50', 'Midcap 150', 'Smallcap 250', 'Microcap 250', 'Total Market']) {
  assert.equal(index.includes('>' + bogus + '</option>'), false, bogus + ' has no verified membership source and must not be offered');
}

// Verdict options must match the real four-value scanner enum; no obsolete Quiet Absorption option.
for (const option of ['All Verdicts', 'Confirmed', 'Starting', 'Unconfirmed / Mixed', 'Distribution']) {
  assert.ok(index.includes('>' + option + '</option>'), 'missing verdict option: ' + option);
}
assert.equal(index.includes('>Quiet Absorption</option>'), false, 'obsolete Quiet Absorption option must not return');

// Score and sort options must correspond to implemented filter/sort keys (existing thresholds
// only -- no invented score/price/etc. buckets).
for (const option of ['Any', '\u2265 75', '\u2265 55', '\u2265 50', 'Score \u2013 High to Low', 'Score \u2013 Low to High', 'Price \u2013 High to Low', 'Price \u2013 Low to High', 'Volume \u2013 High to Low', 'Delivery \u2013 High to Low', 'Stock \u2013 A to Z']) {
  assert.ok(index.includes('>' + option + '</option>'), 'missing control option: ' + option);
}

// Interaction contract: filter changes re-render the verified row set; sort and search are wired
// separately, exactly as before the redesign (only the VISIBLE trigger for these changed, not this
// underlying wiring).
assert.ok(index.includes("[universe, verdict, score].forEach(el => el.addEventListener('change'") || index.includes("[universe,verdict,score].forEach(el => el.addEventListener('change'"));
assert.ok(index.includes("sortSelect.addEventListener('change'"));
assert.ok(index.includes("tableSearch) tableSearch.addEventListener('input'"));
assert.ok(index.includes("clearScannerFilters"));
// data-quick-filter matches no element on this page (dead code carried over from a shared
// selector pattern used elsewhere) -- harmless, intentionally not wired to anything here.
assert.ok(index.includes("data-quick-filter"));

// ---- Retired architecture must NOT be present (the old bar, not merely hidden) ----
for (const id of ['universeFilterTrigger', 'verdictFilterTrigger', 'scoreFilterTrigger', 'sortSelectTrigger', 'universeFilterMenu', 'verdictFilterMenu', 'scoreFilterMenu', 'sortSelectMenu']) {
  assert.equal(index.includes('id="' + id + '"'), false, id + ' is retired \u2014 that control now lives in a table-header menu, not a separate trigger/menu pair');
}
assert.equal(index.includes('class="radar-filter-trigger"'), false, 'the old visible filter-trigger buttons are retired');
assert.equal(index.includes('setupRadarFilterMenu('), false, 'the old chip-anchored menu builder is retired, replaced by the single shared column-menu (openColMenu/COLUMN_MENUS)');
assert.equal(/\bsortState\.(key|direction)\b/.test(index), false, 'the old desynced sortState variable must not exist \u2014 sort key/direction are read directly from #sortSelect.value every render()');

// ---- Current architecture: one shared column-menu system ----
assert.ok(index.includes('const COLUMN_MENUS'), 'a single COLUMN_MENUS config must define every interactive header');
assert.ok(index.includes('function openColMenu(th, key)'), 'one shared menu-open implementation for every header');
assert.ok(index.includes("colMenuOpts[i].onSelect();") && index.includes('tablePage = 1;') && index.includes('closeColMenu();') && index.includes('render();'), 'selecting a menu option must update state, reset to page 1, close the menu, and re-render');
assert.ok(index.includes('radar-filter-option'), 'menu options must be real buttons (reused class from the pre-redesign menus)');
assert.ok(index.includes('radar-universe-pill'), 'Universe must be a pill group (blueprint-specified UX), not a trigger+menu chip');

const nativeCssStart = index.indexOf('.radar-native-select{');
assert.ok(nativeCssStart >= 0, 'canonical native select CSS must exist');
const nativeCss = index.slice(nativeCssStart, nativeCssStart + 500);
assert.ok(nativeCss.includes('pointer-events:none'), 'hidden canonical select must not steal pointer events');
assert.ok(nativeCss.includes('opacity:0'), 'hidden canonical select must not be visible');

// The scanner logic must use exact universe membership and separate text filtering from sorting.
// Verdict matching must be normalization-tolerant at the UI boundary; the engine enum itself is unchanged.
assert.ok(index.includes('normalizeVerdictFilterValue'), 'verdict filter normalization helper must exist');
assert.ok(index.includes('verdictMatches(r.verdict, v)'), 'render must use normalized verdict matching');
assert.ok(index.includes("replace(/\\\\s+/g, ' ')") || index.includes("replace(/\\s+/g, ' ')"), 'verdict normalization must collapse whitespace');

assert.ok(index.includes('window.VikramUniverseMembership.matchesUniverse'));
assert.ok(index.includes('window.VikramTableControls.filterRows') || index.includes('filterRows ? filterRows'));
assert.ok(index.includes('sortRows(textFiltered, sortKey, sortDirection)'), 'sort must read the key/direction derived from #sortSelect.value this render(), not a cached variable');

console.log('opportunityRadarFilters.test.js: PASS');
