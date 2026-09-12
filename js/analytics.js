// Analytics — pure aggregate statistics over the SAME real scanner snapshot rows already loaded
// for the Accumulation Scanner / Opportunity Radar. Computes only counts/averages/percentages of
// real, already-present fields — never fetches new data, never invents a metric.
(function (root, factory) {
  const impl = factory(typeof module === 'object' && module.exports ? require('./universeMembership.js') : (root && root.VikramUniverseMembership));
  if (typeof module === 'object' && module.exports) module.exports = impl;
  else root.VikramAnalytics = impl;
})(typeof self !== 'undefined' ? self : this, function (universeMembership) {
  'use strict';

  // Verdict distribution: a real count of each verdict actually present in the loaded rows.
  function verdictDistribution(rows) {
    const counts = {};
    for (const r of rows || []) {
      const v = r.verdict || 'UNKNOWN';
      counts[v] = (counts[v] || 0) + 1;
    }
    return counts;
  }

  // Universe-tier breakdown, reusing the SAME real membership matching logic already used by the
  // Universe Selector (js/universeMembership.js) — never a second, inconsistent tier definition.
  function universeBreakdown(rows) {
    const breakdown = { 'NIFTY 50': 0, 'NIFTY 200': 0, 'NIFTY 500': 0, NONE: 0 };
    for (const r of rows || []) {
      let tier = 'NONE';
      if (universeMembership) {
        if (universeMembership.matchesUniverse(r, 'NIFTY 50')) tier = 'NIFTY 50';
        else if (universeMembership.matchesUniverse(r, 'NIFTY 200')) tier = 'NIFTY 200';
        else if (universeMembership.matchesUniverse(r, 'NIFTY 500')) tier = 'NIFTY 500';
      }
      breakdown[tier] += 1;
    }
    return breakdown;
  }

  // Real average/median score across confirmed/starting rows only (never across every row
  // regardless of verdict, which would be a misleading blended number).
  function scoreSummary(rows) {
    const scores = (rows || [])
      .filter(r => r.verdict === 'ACCUMULATION CONFIRMED' || r.verdict === 'ACCUMULATION STARTING')
      .map(r => Number(r.score)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!scores.length) return { count: 0, average: null, median: null };
    const average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 ? scores[mid] : Math.round(((scores[mid - 1] + scores[mid]) / 2) * 100) / 100;
    return { count: scores.length, average, median };
  }

  // Real data-quality summary: how many rows are missing key fields, so the analytics page is
  // honest about coverage rather than silently averaging over gaps.
  function dataQualitySummary(rows) {
    const list = rows || [];
    const missingVolume = list.filter(r => r.metrics?.volumeRatio == null).length;
    const missingDelivery = list.filter(r => r.metrics?.deliveryPct == null).length;
    const missingOi = list.filter(r => r.metrics?.hasDerivatives && r.metrics?.changeOi == null).length;
    return { totalRows: list.length, missingVolume, missingDelivery, missingOi };
  }

  function buildAnalytics(rows) {
    return {
      verdictDistribution: verdictDistribution(rows),
      universeBreakdown: universeBreakdown(rows),
      scoreSummary: scoreSummary(rows),
      dataQuality: dataQualitySummary(rows)
    };
  }

  return { verdictDistribution, universeBreakdown, scoreSummary, dataQualitySummary, buildAnalytics };
});
