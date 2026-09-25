'use strict';
// Regression guard for the Opportunity Radar table redesign (2026-09-22): the separate Verdict/
// Score/Sort filter bar is gone; every interactive column header opens a menu (filter and/or sort
// options) instead of acting immediately on click; Universe is a pill group; four new filters
// (OBV Trend, Volume Breakout, High Delivery, OI Build-up) reuse existing thresholds rather than
// inventing new ones. Supersedes the previous version of this file, which asserted the OLD
// click-immediately-sorts architecture (function activateHeaderSort) that this redesign replaces
// by explicit, later instruction. Pure static analysis: no browser, no dependencies. Browser-level
// proof is tests/e2e/radar-column-menus.e2e.py (not run in CI).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const index = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const opportunityRadarSrc = fs.readFileSync(path.join(__dirname, '../../js/opportunityRadar.js'), 'utf8');

// ---- The old separate filter bar must be gone entirely, not merely hidden ----
assert.equal(index.includes('radar-filter-bar'), false, 'the old separate Verdict/Score/Sort filter bar must be removed, not hidden');
assert.equal(index.includes('radar-filter-chip'), false, 'no leftover chip markup/CSS for the old bar');
assert.equal(index.includes('verdictFilterTrigger'), false, 'no leftover Verdict trigger button');
assert.equal(index.includes('scoreFilterTrigger'), false, 'no leftover Score trigger button');
assert.equal(index.includes('sortSelectTrigger'), false, 'no leftover Sort trigger button');
assert.equal(index.includes('setupRadarFilterMenu'), false, 'the old chip-anchored menu builder must be fully retired, not left dormant');
assert.equal(index.includes('function activateHeaderSort'), false, 'the OLD click-immediately-sorts behavior must not exist \u2014 clicking a header must open a menu first');

// ---- Column headers are the ONE canonical interactive surface, backed by the SAME selects ----
assert.ok(index.includes('const COLUMN_MENUS'), 'a single COLUMN_MENUS config must define every interactive header');
assert.ok(index.includes('function openColMenu(th, key)') && index.includes('function closeColMenu()'), 'one shared open/close implementation for every header menu');
assert.ok(/id="radarColumnMenu"|colMenuEl\.id = 'radarColumnMenu'/.test(index), 'exactly one shared menu element, not one per column');
for (const [key, selectId] of [['verdict', 'verdictFilter'], ['score', 'scoreFilter']]) {
  assert.ok(index.includes(`filterSelectId: '${selectId}'`), `${key} column menu must read/write the existing canonical #${selectId}`);
}
assert.ok(index.includes("sortKey && sortSelect") && index.includes("sortSelect.dispatchEvent(new Event('change'))"), 'sort options from a header must go through the SAME #sortSelect + change event as everything else \u2014 no second sort state');

// ---- Verdict: exact match only, all 4 canonical values, no substring risk ----
for (const v of ['ACCUMULATION CONFIRMED', 'ACCUMULATION STARTING', 'UNCONFIRMED / MIXED', 'DISTRIBUTION']) {
  assert.ok(index.includes(`value="${v}"`), `verdictFilter must offer the exact canonical value "${v}"`);
}
assert.equal(/verdictMatches\s*=\s*\([^)]*\)\s*=>[^;]*\.includes\(/.test(index), false, 'verdict matching must not use substring .includes() (UNCONFIRMED / MIXED must never match ACCUMULATION CONFIRMED)');

// ---- Row-level VERDICT column is distinct from the filter: exactly one <th> for it, and the row
// template still renders each stock's own verdict text ----
assert.equal((index.match(/colTh\('verdict'\)/g) || []).length, 1, 'exactly one VERDICT column/header \u2014 no duplicate column created for the filter');
assert.equal((index.match(/verdict:\s*\{/g) || []).length, 1, 'exactly one COLUMN_MENUS entry for verdict \u2014 no second, competing verdict-filter config');
assert.ok(index.includes('verdictClass(r.verdict)') && index.includes('${text(r.verdict)}'), 'each row must still render its own verdict value in that one column');

// ---- New filters reuse EXISTING thresholds already defined/tested in opportunityRadar.js, rather
// than inventing new ones (VOLUME_BREAKOUT / HIGH_DELIVERY / OI_BUILD_UP) ----
assert.ok(/volumeRatio\s*>=\s*2\)\s*cats\.push\('VOLUME_BREAKOUT'\)/.test(opportunityRadarSrc), 'sanity: opportunityRadar.js must still define the >=2x volume-breakout threshold this reuses');
assert.ok(/deliveryPct\s*>=\s*60\)\s*cats\.push\('HIGH_DELIVERY'\)/.test(opportunityRadarSrc), 'sanity: opportunityRadar.js must still define the >=60% high-delivery threshold this reuses');
assert.ok(index.includes(">= 2") && index.includes('BREAKOUT'), 'Volume column filter must use the same >=2x threshold');
assert.ok(index.includes(">= 60") && index.includes('HIGH'), 'Delivery column filter must use the same >=60% threshold');
assert.ok(index.includes("changeOi != null && Number(r.metrics.changeOi) > 0") || index.includes('changeOi != null'), 'OI Build-up filter must exclude null (Missing) rather than treating it as 0/false');
assert.ok(index.includes("const n = Number(t);") && index.includes("n > 0") && index.includes("n < 0"), 'OBV Trend filter must reuse the same sign test as the rendered Rising/Falling/Flat text');

// ---- No filter/sort model invented for columns with none in the existing codebase ----
for (const key of ['stock', 'price', 'today', 'futuresOi']) {
  assert.equal(new RegExp(`${key}:\\s*\\{[^}]*filterSelectId`).test(index), false, `${key} must stay sort-only \u2014 no existing filter model exists for it in this codebase`);
}
assert.equal(index.includes('data-col-menu="rank"') || index.includes('data-col-menu="actions"'), false, 'RANK and ACTIONS are not data-driven columns and must not be interactive');

// ---- Universe: pill group backed by the same canonical select, only real/verified options ----
assert.ok(index.includes('radar-universe-pill') && index.includes("data-universe-value=\"NIFTY 50\""), 'Universe must be a pill group wired to the same #universeFilter select');
for (const bogus of ['NIFTY 100', 'Next 50', 'Midcap 150', 'Smallcap 250', 'Microcap 250', 'Total Market', 'F&O', 'Cash Market']) {
  assert.equal(index.includes(`data-universe-value="${bogus}"`), false, `${bogus} has no verified membership source in this codebase and must not be offered as a selectable option`);
}
assert.ok(index.includes('DATA NOT AVAILABLE'), 'unsupported universes must be explicitly documented as unavailable, not silently omitted with no explanation');

// ---- Zero-result state must not remove the header row (headers are the only filter UI now) ----
assert.ok(index.includes('headRow') && /scannerCards\.innerHTML = `<table[\s\S]{0,120}\$\{headRow\}/.test(index), 'the <thead> must be part of every render, including when zero rows match, so headers stay usable');
assert.equal(index.includes("scannerCards.innerHTML = visible.length ?"), false, 'the table (and its headers) must not be replaced wholesale by the empty-state message');

console.log('headerSort.test.js: all assertions passed');
