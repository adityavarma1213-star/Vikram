'use strict';
const assert = require('node:assert/strict');
const { verdictDistribution, universeBreakdown, scoreSummary, dataQualitySummary, buildAnalytics } = require('../../js/analytics.js');

const rows = [
  { symbol: 'AAA', verdict: 'ACCUMULATION CONFIRMED', score: 80, indexMembership: ['NIFTY 50', 'NIFTY 200', 'NIFTY 500'], metrics: { volumeRatio: 1.2, deliveryPct: 40 } },
  { symbol: 'BBB', verdict: 'ACCUMULATION CONFIRMED', score: 60, indexMembership: ['NIFTY 500'], metrics: { volumeRatio: 1.5, deliveryPct: 30 } },
  { symbol: 'CCC', verdict: 'ACCUMULATION STARTING', score: 40, indexMembership: [], metrics: {} },
  { symbol: 'DDD', verdict: 'DISTRIBUTION', score: 20, indexMembership: [], metrics: { volumeRatio: 0.8, deliveryPct: 20 } }
];

// 1. Verdict distribution is a real count, not a guessed proportion.
{
  const dist = verdictDistribution(rows);
  assert.equal(dist['ACCUMULATION CONFIRMED'], 2);
  assert.equal(dist['ACCUMULATION STARTING'], 1);
  assert.equal(dist['DISTRIBUTION'], 1);
}

// 2. Universe breakdown reuses the exact same real membership-matching logic as the Universe
// Selector — a stock in NIFTY 50 is correctly also counted for its broadest real tier here.
{
  const breakdown = universeBreakdown(rows);
  assert.equal(breakdown['NIFTY 50'], 1); // AAA
  assert.equal(breakdown['NIFTY 200'], 0); // breakdown only assigns the highest matched tier per row
  assert.equal(breakdown['NIFTY 500'], 1); // BBB
  assert.equal(breakdown['NONE'], 2); // CCC, DDD
}

// 3. Score summary only includes CONFIRMED/STARTING rows (never blends in DISTRIBUTION scores,
// which would misrepresent the opportunity-quality average).
{
  const summary = scoreSummary(rows);
  assert.equal(summary.count, 3); // AAA, BBB, CCC — not DDD
  assert.equal(summary.average, Math.round(((80 + 60 + 40) / 3) * 100) / 100);
  assert.equal(summary.median, 60);
}

// 4. Data quality summary counts real missing fields, never silently treats them as zero.
{
  const quality = dataQualitySummary(rows);
  assert.equal(quality.totalRows, 4);
  assert.equal(quality.missingVolume, 1); // CCC has no metrics.volumeRatio
  assert.equal(quality.missingDelivery, 1);
}

// 5. Empty input never crashes and never fabricates a nonzero result.
{
  const analytics = buildAnalytics([]);
  assert.equal(analytics.scoreSummary.count, 0);
  assert.equal(analytics.scoreSummary.average, null);
  assert.equal(analytics.dataQuality.totalRows, 0);
}

console.log('analytics.test.js: PASS');
