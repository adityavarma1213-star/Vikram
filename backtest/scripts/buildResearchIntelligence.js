#!/usr/bin/env node
'use strict';
// Regenerates data/researchIntelligence.json — the canonical, per-symbol historical
// evidence artifact that Hidden Gems and Opportunity Radar join against — from the
// already-verified backtest/REAL_1YEAR_BACKTEST_RESULT.json.
//
// This script does NOT re-run the backtest, does NOT touch NSE data, and does NOT
// invent anything: it is pure aggregation over ASM output that already exists on disk.
// runBacktest() in ../backtestRunner.js also calls buildResearchIntelligence() directly
// on every fresh backtest run, so this standalone script exists for the case where the
// intelligence artifact needs to be (re)built from an already-committed backtest result
// without re-running the (network-dependent) full backtest — e.g. in CI after this repo
// change, or if REAL_1YEAR_BACKTEST_RESULT.json is ever hand-refreshed.
//
// Usage: node backtest/scripts/buildResearchIntelligence.js

const fs = require('fs');
const path = require('path');
const { buildResearchIntelligence } = require('../lib/researchIntelligence');

const ROOT = path.join(__dirname, '..', '..');
const BACKTEST_PATH = path.join(ROOT, 'backtest', 'REAL_1YEAR_BACKTEST_RESULT.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'researchIntelligence.json');

function main() {
  if (!fs.existsSync(BACKTEST_PATH)) {
    console.error(`REFUSED: ${BACKTEST_PATH} does not exist. Run the real backtest first (npm run backtest in backtest/) — this script never fabricates its input.`);
    process.exit(1);
  }
  const backtest = JSON.parse(fs.readFileSync(BACKTEST_PATH, 'utf8'));
  if (!backtest.asm || !Array.isArray(backtest.asm.records)) {
    console.error('REFUSED: the backtest result has no asm.records — nothing real to aggregate.');
    process.exit(1);
  }

  const intelligence = buildResearchIntelligence(backtest.asm);
  intelligence.generatedAt = new Date().toISOString();
  intelligence.sourceFile = 'backtest/REAL_1YEAR_BACKTEST_RESULT.json';
  intelligence.sourceDataProvenance = backtest.manifestSummary ? backtest.manifestSummary.data_provenance : null;
  intelligence.sourceDateRange = backtest.manifestSummary && Array.isArray(backtest.manifestSummary.date_range) && backtest.manifestSummary.date_range.length
    ? [backtest.manifestSummary.date_range[0], backtest.manifestSummary.date_range[backtest.manifestSummary.date_range.length - 1]]
    : null;
  intelligence.sourceEngine = backtest.engine || null;
  intelligence.sourceTotalSignals = backtest.totalSignals || 0;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(intelligence, null, 2));
  console.log(`RESEARCH INTELLIGENCE BUILT: ${intelligence.symbolCount} symbol(s) with historical evidence -> ${path.relative(ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) main();
module.exports = { main };
