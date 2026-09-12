'use strict';
// Pure filesystem readers for the "1-Year Research" feature (see research.html /
// js/research.js). Deliberately has NO Postgres dependency — the underlying data
// (data/market-history/*.json, backtest/REAL_1YEAR_BACKTEST_RESULT.json) already lives on
// disk as verified, static, already-computed artifacts, so these routes are a thin
// passthrough rather than a re-implementation of any scanning/backtest logic (the actual
// computation lives in server/src/scanMaterializer.js and backtest/backtestRunner.js —
// this file does not duplicate it, only reads its already-produced output).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MARKET_HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
const BACKTEST_PATH = path.join(ROOT, 'backtest', 'REAL_1YEAR_BACKTEST_RESULT.json');
const COVERAGE_REPORT_PATH = path.join(ROOT, 'data', 'nse-coverage-report.json');

// Real, verified coverage of data/market-history — first date, last date, and session count are
// derived only from actual filenames on disk, never estimated.
function getCoverage() {
  if (!fs.existsSync(MARKET_HISTORY_DIR)) {
    return { status: 'DATA_INSUFFICIENT', reason: 'data/market-history directory not found.' };
  }
  const dates = fs.readdirSync(MARKET_HISTORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort();
  if (!dates.length) {
    return { status: 'DATA_INSUFFICIENT', reason: 'No dated market-history files found.' };
  }
  return {
    status: 'VERIFIED',
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    tradingSessions: dates.length,
    source: 'data/market-history'
  };
}

// Passthrough of the already-computed, already-verified one-year backtest artifact. Never
// recomputes it here — if it's missing, this honestly reports VERIFICATION_BLOCKED rather than
// running a fresh (and, in this route, unauthenticated/uncontrolled) backtest on demand.
function getBacktest() {
  if (!fs.existsSync(BACKTEST_PATH)) {
    return { status: 'VERIFICATION_BLOCKED', reason: 'backtest/REAL_1YEAR_BACKTEST_RESULT.json not found on disk.' };
  }
  try {
    const raw = fs.readFileSync(BACKTEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { status: 'VERIFIED', data: parsed };
  } catch (error) {
    return { status: 'VERIFICATION_BLOCKED', reason: `backtest artifact could not be parsed: ${error.message}` };
  }
}

// Passthrough of the pre-computed NSE data coverage report (scripts/buildNseCoverageReport.js),
// which is generated directly from the real data/market-history files — CM/F&O day coverage,
// delivery/OI field coverage, and disclosed data-quality flags. Never recomputed on request (that
// would mean re-reading ~115MB of history on every page load); regenerate it by re-running the
// script whenever data/market-history changes.
function getCoverageReport() {
  if (!fs.existsSync(COVERAGE_REPORT_PATH)) {
    return { status: 'DATA_INSUFFICIENT', reason: 'data/nse-coverage-report.json not found — run scripts/buildNseCoverageReport.js.' };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(COVERAGE_REPORT_PATH, 'utf8'));
    return { status: 'VERIFIED', data: parsed };
  } catch (error) {
    return { status: 'VERIFICATION_BLOCKED', reason: `coverage report could not be parsed: ${error.message}` };
  }
}

module.exports = { getCoverage, getBacktest, getCoverageReport, MARKET_HISTORY_DIR, BACKTEST_PATH, COVERAGE_REPORT_PATH };
