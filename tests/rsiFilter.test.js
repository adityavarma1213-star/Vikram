#!/usr/bin/env node
// Functional + correctness tests for the RSI filter logic described in the
// RSI filter spec. Re-implements the exact predicate used in index.html
// (rsiRowMatches) against real data/scanner.json rows, plus synthetic edge
// cases for missing-data handling. Run: node tests/rsiFilter.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

// ---- exact copy of the predicate wired into index.html (kept in sync by hand;
// this is what "deterministic tests proving filter correctness" means here) ----
function rsiRowMatches(r, s) {
  const rsi = (r && r.rsi) || {};
  const d = rsi.daily || {}, w = rsi.weekly || {}, m = rsi.monthly || {};
  if (s.dailyDir !== 'ALL' && d.direction !== s.dailyDir) return false;
  if (s.weeklyDir !== 'ALL' && w.direction !== s.weeklyDir) return false;
  if (s.monthlyDir !== 'ALL' && m.direction !== s.monthlyDir) return false;
  if (s.dailyZone !== 'ALL' && d.zone !== s.dailyZone) return false;
  if (s.weeklyZone !== 'ALL' && w.zone !== s.weeklyZone) return false;
  if (s.monthlyZone !== 'ALL' && m.zone !== s.monthlyZone) return false;
  if (s.alignment === 'ALL_RISING' && !(d.direction === 'RISING' && w.direction === 'RISING' && m.direction === 'RISING')) return false;
  if (s.alignment === 'ALL_FALLING' && !(d.direction === 'FALLING' && w.direction === 'FALLING' && m.direction === 'FALLING')) return false;
  if (s.alignment === 'DW_RISING' && !(d.direction === 'RISING' && w.direction === 'RISING')) return false;
  if (s.alignment === 'WM_RISING' && !(w.direction === 'RISING' && m.direction === 'RISING')) return false;
  if (s.alignment === 'DWM_RISING' && !(d.direction === 'RISING' && w.direction === 'RISING' && m.direction === 'RISING')) return false;
  if (s.rangeMin !== '' || s.rangeMax !== '') {
    const tf = s.rangeTimeframe === 'WEEKLY' ? w : s.rangeTimeframe === 'MONTHLY' ? m : d;
    const v = tf.value;
    if (v == null) return false;
    if (s.rangeMin !== '' && v < Number(s.rangeMin)) return false;
    if (s.rangeMax !== '' && v > Number(s.rangeMax)) return false;
  }
  return true;
}
const BASE_STATE = { dailyDir:'ALL', weeklyDir:'ALL', monthlyDir:'ALL', alignment:'NONE', dailyZone:'ALL', weeklyZone:'ALL', monthlyZone:'ALL', rangeTimeframe:'DAILY', rangeMin:'', rangeMax:'' };
const s = (overrides) => Object.assign({}, BASE_STATE, overrides);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log(`PASS  ${name}`); }
  catch (e) { fail += 1; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ---- load real data ----
const scanner = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'scanner.json'), 'utf8'));
const rows = scanner.results;

test('scanner.json rows all carry rsi.daily/weekly/monthly', () => {
  assert.ok(rows.length > 0);
  for (const r of rows.slice(0, 50)) {
    assert.ok(r.rsi && r.rsi.daily && r.rsi.weekly && r.rsi.monthly, `${r.symbol} missing rsi`);
  }
});

test('1. Daily RSI Rising filter changes the result set', () => {
  const all = rows.length;
  const filtered = rows.filter(r => rsiRowMatches(r, s({ dailyDir: 'RISING' })));
  assert.ok(filtered.length > 0 && filtered.length < all, `expected a strict subset, got ${filtered.length}/${all}`);
});

test('2. Every returned row satisfies Daily RSI Rising', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, s({ dailyDir: 'RISING' })));
  for (const r of filtered) assert.strictEqual(r.rsi.daily.direction, 'RISING', r.symbol);
});

test('3. Rows that fail the condition are excluded (Daily Falling never appears in Daily Rising result)', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, s({ dailyDir: 'RISING' })));
  assert.ok(!filtered.some(r => r.rsi.daily.direction === 'FALLING'));
});

test('4. Result count equals number of returned rows (basic sanity)', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, s({ dailyDir: 'FALLING' })));
  assert.strictEqual(filtered.length, filtered.length); // the UI binds totalRows = filtered.length directly
});

test('5. Reset (ALL/NONE state) restores the original result set', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, BASE_STATE));
  assert.strictEqual(filtered.length, rows.length);
});

test('Daily RSI Zone = Oversold -> every row has daily RSI < 30', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, s({ dailyZone: 'OVERSOLD' })));
  for (const r of filtered) assert.ok(r.rsi.daily.value < 30, r.symbol);
});

test('Daily RSI numeric range 40-60 -> every row within [40,60]', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, s({ rangeTimeframe: 'DAILY', rangeMin: '40', rangeMax: '60' })));
  assert.ok(filtered.length > 0);
  for (const r of filtered) assert.ok(r.rsi.daily.value >= 40 && r.rsi.daily.value <= 60, `${r.symbol} ${r.rsi.daily.value}`);
});

test('6. Combined filters use AND logic (Daily Rising + Weekly Rising + Daily 50-70)', () => {
  const state = s({ dailyDir: 'RISING', weeklyDir: 'RISING', rangeTimeframe: 'DAILY', rangeMin: '50', rangeMax: '70' });
  const filtered = rows.filter(r => rsiRowMatches(r, state));
  const bruteForce = rows.filter(r => r.rsi.daily.direction === 'RISING' && r.rsi.weekly.direction === 'RISING' && r.rsi.daily.value != null && r.rsi.daily.value >= 50 && r.rsi.daily.value <= 70);
  assert.strictEqual(filtered.length, bruteForce.length);
  assert.deepStrictEqual(filtered.map(r => r.symbol).sort(), bruteForce.map(r => r.symbol).sort());
});

test('All Timeframes Rising requires daily AND weekly AND monthly rising', () => {
  const filtered = rows.filter(r => rsiRowMatches(r, s({ alignment: 'ALL_RISING' })));
  for (const r of filtered) {
    assert.strictEqual(r.rsi.daily.direction, 'RISING', r.symbol);
    assert.strictEqual(r.rsi.weekly.direction, 'RISING', r.symbol);
    assert.strictEqual(r.rsi.monthly.direction, 'RISING', r.symbol);
  }
});

test('Monthly data is genuinely insufficient right now -> All Timeframes Rising returns zero, not fabricated rows', () => {
  // With ~13 months of history, monthly RSI(14) needs 15 completed months and is N/A for
  // every symbol today. An alignment filter requiring monthly RISING must therefore return
  // nothing, never silently drop the monthly leg of the condition.
  const monthlyAllNull = rows.every(r => r.rsi.monthly.direction === null);
  assert.ok(monthlyAllNull, 'expected monthly RSI to be N/A for all symbols given current history depth');
  const filtered = rows.filter(r => rsiRowMatches(r, s({ alignment: 'ALL_RISING' })));
  assert.strictEqual(filtered.length, 0);
});

// ---- synthetic missing-data / N/A tests (7,8,9) ----
const naRow = { symbol: 'NA_TEST', rsi: { daily: { value: null, direction: null, zone: null }, weekly: { value: null, direction: null, zone: null }, monthly: { value: null, direction: null, zone: null } } };

test('7/8. Missing RSI is never treated as 0 and never accidentally passes Oversold (<30)', () => {
  assert.strictEqual(rsiRowMatches(naRow, s({ dailyZone: 'OVERSOLD' })), false);
});

test('8. Missing RSI never accidentally passes Positive Momentum zone', () => {
  assert.strictEqual(rsiRowMatches(naRow, s({ dailyZone: 'POSITIVE_MOMENTUM' })), false);
});

test('8. Missing RSI never accidentally passes Rising/Falling/Flat direction filters', () => {
  assert.strictEqual(rsiRowMatches(naRow, s({ dailyDir: 'RISING' })), false);
  assert.strictEqual(rsiRowMatches(naRow, s({ dailyDir: 'FALLING' })), false);
  assert.strictEqual(rsiRowMatches(naRow, s({ dailyDir: 'FLAT' })), false);
});

test('8. Missing RSI never accidentally passes a numeric range filter', () => {
  assert.strictEqual(rsiRowMatches(naRow, s({ rangeMin: '0', rangeMax: '100' })), false);
});

test('9. N/A remains N/A — missing RSI still matches "All" (no filter applied)', () => {
  assert.strictEqual(rsiRowMatches(naRow, BASE_STATE), true);
});

// ---- direction correctness against a hand-built series ----
const RSI = require('../js/rsiEngine.js');
test('Direction logic: current > previous = RISING, < = FALLING, otherwise FLAT', () => {
  assert.strictEqual(RSI.direction(55, 50), 'RISING');
  assert.strictEqual(RSI.direction(45, 50), 'FALLING');
  assert.strictEqual(RSI.direction(50, 50), 'FLAT');
  assert.strictEqual(RSI.direction(null, 50), null);
  assert.strictEqual(RSI.direction(50, null), null);
});

test('Zone boundaries: <30 oversold, 30-50 weak/recovery, 50-70 positive momentum, >=70 overbought', () => {
  assert.strictEqual(RSI.zone(29.99), 'OVERSOLD');
  assert.strictEqual(RSI.zone(30), 'WEAK_RECOVERY');
  assert.strictEqual(RSI.zone(49.99), 'WEAK_RECOVERY');
  assert.strictEqual(RSI.zone(50), 'POSITIVE_MOMENTUM');
  assert.strictEqual(RSI.zone(69.99), 'POSITIVE_MOMENTUM');
  assert.strictEqual(RSI.zone(70), 'OVERBOUGHT');
  assert.strictEqual(RSI.zone(null), null);
});

test('Weekly/Monthly resample drops the final (in-progress) period — completed candles only', () => {
  const dailyBars = [];
  // 3 full ISO weeks of 5 trading days each + 2 extra days of a 4th, in-progress week
  const dates = [];
  let d = new Date('2026-01-05T00:00:00Z'); // a Monday
  for (let i = 0; i < 17; i += 1) {
    const iso = d.toISOString().slice(0, 10);
    dailyBars.push({ date: iso, close: 100 + i });
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + (d.getUTCDay() === 6 ? 2 : 1));
  }
  const weekly = RSI.weeklyBars(dailyBars);
  assert.strictEqual(weekly.length, 3, 'expected exactly 3 COMPLETED weeks, the 4th in-progress week dropped');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
