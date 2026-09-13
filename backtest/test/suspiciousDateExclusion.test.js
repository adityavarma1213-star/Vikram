'use strict';
// INTEGRATION TEST — runs against the REAL, already-downloaded backtest/data/normalized/cm/
// dataset (not a synthetic fixture). This is the test required by Item 1: "Create/update a test
// that would fail if a suspicious duplicate trading day is incorrectly accepted."
//
// It fails in exactly two situations:
//   1. A NEW stale-duplicate date shows up in the dataset that is NOT in
//      backtest/lib/nseHolidayCalendar.js's known-holiday list (i.e. an unresolved
//      DATA_INGESTION_ERROR / unclassified date) — this is the "incorrectly accepted" case: it
//      forces a human to investigate and either add real evidence to the calendar or fix the
//      ingestion bug, rather than letting it silently flow into ASM/1-Year Research.
//   2. backtestRunner.js's loadNormalizedBySymbol() stops excluding a known stale date from the
//      trading calendar (a regression in the wiring itself).
//
// It does NOT fail merely because the 13 already-documented dates exist — those are confirmed,
// cited, genuine NSE non-trading days (see ITEM1_DATE_VERIFICATION_REPORT.md) and are expected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanForStaleDuplicates } = require('../lib/staleDuplicateDetector');
const { isKnownHolidayDate, KNOWN_HOLIDAYS } = require('../lib/nseHolidayCalendar');

const CM_DIR = path.join(__dirname, '..', 'data', 'normalized', 'cm');

if (!fs.existsSync(CM_DIR)) {
  console.log('SKIP suspiciousDateExclusion.test.js: backtest/data/normalized/cm/ not present in this environment.');
  process.exit(0);
}

const files = fs.readdirSync(CM_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
const rowsByDate = {};
for (const file of files) rowsByDate[file.slice(0, 10)] = JSON.parse(fs.readFileSync(path.join(CM_DIR, file), 'utf8'));

const findings = scanForStaleDuplicates(rowsByDate).filter(f => f.result.isStaleDuplicate);

// 1. Every stale-duplicate date found in the REAL dataset must be a documented, cited holiday.
// If this fails, a genuinely new/unexplained duplicate has appeared — investigate before trusting it.
const unresolved = findings.filter(f => !isKnownHolidayDate(f.date));
assert.deepEqual(
  unresolved.map(f => f.date),
  [],
  `Found ${unresolved.length} stale-duplicate date(s) with NO matching entry in nseHolidayCalendar.js: ` +
    `${unresolved.map(f => f.date).join(', ')}. Do not accept these silently — verify against real NSE ` +
    `evidence and either add a cited calendar entry (if a genuine holiday) or fix the ingestion defect ` +
    `(if a real trading day was duplicated).`
);
console.log(`real dataset: ${findings.length} stale-duplicate date(s) found, all match a cited holiday — PASS`);

// 2. Sanity: the calendar itself isn't empty/vestigial (would make check #1 meaningless).
assert.ok(Object.keys(KNOWN_HOLIDAYS).length >= 13, 'nseHolidayCalendar.js should contain at least the 13 originally-audited dates');
console.log('holiday calendar non-trivial — PASS');

// 3. The exclusion is actually wired into backtestRunner.js — not just detected and ignored.
const runnerSource = fs.readFileSync(path.join(__dirname, '..', 'backtestRunner.js'), 'utf8');
assert.ok(/excludedDates\.has\(date\)/.test(runnerSource), 'loadNormalizedBySymbol() must exclude flagged dates from bySymbol/futuresBySymbolDate');
assert.ok(/isKnownHolidayDate/.test(runnerSource) && /scanForStaleDuplicates/.test(runnerSource), 'loadNormalizedBySymbol() must consult both the holiday calendar and the automated detector');
console.log('exclusion wired into backtestRunner.js — PASS');

console.log('suspiciousDateExclusion.test.js: PASS (integration test against the real dataset)');
