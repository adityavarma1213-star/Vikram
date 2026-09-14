'use strict';
// Accumulation Intelligence — integration layer.
//
// Combines Accumulation DNA + SOAI + False Accumulation Detector for one
// symbol/date into a single record that answers the two questions the
// assignment calls out explicitly:
//   "WHY did VIKRAM consider this accumulation?"   -> evidenceFor
//   "WHAT could make this signal false?"           -> evidenceAgainst
//
// This module does not introduce any new calculation of its own — it is
// pure composition over the three engines, so there is exactly one place
// each metric is computed (no duplicate/competing scoring engine, per the
// assignment's explicit anti-duplication rule).

const { classifyAccumulationDNA } = require('./accumulationDNA');
const { computeSOAI } = require('./soai');
const { detectFalseAccumulation } = require('./falseAccumulationDetector');

function buildAccumulationIntelligence(symbol, asOfDate, index, opts = {}) {
  const cmSeries = index.cmSeriesAsOf(symbol, asOfDate);
  const foSeries = index.foSeriesAsOf(symbol, asOfDate);

  const dna = classifyAccumulationDNA(cmSeries, { ...opts.dna, foSeries });
  const soai = computeSOAI(cmSeries, opts.soai);
  const falseAccumulation = detectFalseAccumulation(cmSeries, foSeries, asOfDate, opts.falseAccumulation);

  const evidenceFor = [];
  if (dna.status === 'CLASSIFIED' && dna.dnaType !== 'NO_CLEAR_PATTERN' && dna.dnaType !== 'DISTRIBUTION') {
    evidenceFor.push(`Accumulation DNA classified as ${dna.dnaType}: ${dna.reason}`);
  }
  if (soai.status === 'CALCULATED' && (soai.label === 'PRICE_SUPPRESSED_ABSORPTION_PATTERN' || soai.label === 'ELEVATED_ABSORPTION_WITH_PRICE_PARTICIPATION')) {
    evidenceFor.push(`SOAI: ${soai.reason}`);
  }

  const evidenceAgainst = [];
  if (dna.dnaType === 'DISTRIBUTION') evidenceAgainst.push(`Accumulation DNA classified as DISTRIBUTION, not accumulation: ${dna.reason}`);
  if (falseAccumulation.verdict === 'FALSE_ACCUMULATION_RISK' || falseAccumulation.verdict === 'ACCUMULATION_UNCERTAIN') {
    for (const [checkName, check] of Object.entries(falseAccumulation.checks || {})) {
      if (check.status === 'FLAGGED') evidenceAgainst.push(`${checkName}: ${check.detail}`);
    }
  }

  return {
    symbol: String(symbol).toUpperCase(),
    asOfDate,
    accumulationDNA: dna,
    soai,
    falseAccumulation,
    evidenceFor,
    evidenceAgainst,
    overallStatus: dna.status === 'DATA_INSUFFICIENT' || soai.status === 'DATA_INSUFFICIENT' || falseAccumulation.verdict === 'DATA_INSUFFICIENT'
      ? 'DATA_INSUFFICIENT'
      : 'EVALUATED'
  };
}

module.exports = { buildAccumulationIntelligence };
