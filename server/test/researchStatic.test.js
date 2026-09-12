'use strict';
const assert = require('node:assert/strict');
const { getCoverage, getBacktest, getCoverageReport } = require('../src/researchStatic');

// 1. Coverage must reflect the REAL files on disk, not an assumption.
const coverage = getCoverage();
assert.equal(coverage.status, 'VERIFIED', 'expected data/market-history to be present in this repo');
assert.match(coverage.firstDate, /^\d{4}-\d{2}-\d{2}$/);
assert.match(coverage.lastDate, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(coverage.firstDate <= coverage.lastDate, 'firstDate must not be after lastDate');
assert.ok(coverage.tradingSessions > 0, 'must report a positive session count derived from real files');
assert.equal(coverage.source, 'data/market-history');

// 2. Backtest passthrough must not fabricate content — it either reads the real file, or
// reports VERIFICATION_BLOCKED. It must never invent signals if the file is absent.
const backtest = getBacktest();
assert.equal(backtest.status, 'VERIFIED', 'expected backtest/REAL_1YEAR_BACKTEST_RESULT.json to be present in this repo');
assert.equal(typeof backtest.data.totalSignals, 'number');
assert.ok(Array.isArray(backtest.data.signals));
assert.equal(backtest.data.signals.length, backtest.data.totalSignals, 'totalSignals must match the actual signals array length — no silent mismatch');
assert.ok(backtest.data.engine && backtest.data.engine.is_production_vikram === true, 'must be the real production engine, not a synthetic one');

// 3. NSE data coverage report (scripts/buildNseCoverageReport.js output) — CM/F&O must be
// reported SEPARATELY, and its date range must agree with the raw market-history coverage above
// (cross-check between two independently-computed sources, not a hand-typed number).
const report = getCoverageReport();
assert.equal(report.status, 'VERIFIED', 'expected data/nse-coverage-report.json to be present — run scripts/buildNseCoverageReport.js');
const d = report.data;
assert.equal(d.dateRange.first, coverage.firstDate, 'coverage report first date must match raw market-history first date');
assert.equal(d.dateRange.last, coverage.lastDate, 'coverage report last date must match raw market-history last date');
assert.equal(d.tradingSessions, coverage.tradingSessions);
assert.ok(d.cm && typeof d.cm.daysWithData === 'number', 'CM coverage must be reported separately');
assert.ok(d.fo && typeof d.fo.daysWithData === 'number', 'F&O coverage must be reported separately');
assert.ok(d.fo.daysWithData <= d.tradingSessions, 'F&O day coverage cannot exceed total sessions');
assert.ok(Array.isArray(d.dataQualityFlags), 'data quality flags must be an array, even if empty — never silently dropped');
assert.ok(Array.isArray(d.unaccountedWeekdays.dates), 'unaccounted weekdays must be listed, not asserted as confirmed gaps without a holiday calendar');
assert.ok(Array.isArray(d.cm.suspectedDuplicateSessions), 'CM suspected-duplicate-session detection must be present, even if empty — regression guard for the known stale-holiday-file defect');
assert.ok(d.cm.suspectedDuplicateSessions.some(s => s.date === '2025-12-25' || s.date === '2026-01-26'), 'expected at least one known duplicate holiday session to be flagged');

console.log('researchStatic tests passed (coverage + backtest passthrough + NSE coverage report, all DB-independent)');
