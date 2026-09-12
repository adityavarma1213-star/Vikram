// Opportunity Radar — pure logic, shared between the browser (index.html's #opportunityRadar
// section) and the Node test suite. Operates ONLY on rows already produced by the canonical
// accumulation engine (the same `data/scanner.json` rows the Accumulation Scanner table uses) —
// it computes no new score, invents no new data, and calls no new backend endpoint.
//
// Cross-factor ranking (Blueprint §12): combines the real score with real volume/delivery/OI
// evidence already present on each row, purely to ORDER results — it never overrides or
// recomputes the underlying accumulation verdict/score itself.
(function (root, factory) {
  const impl = factory();
  if (typeof module === 'object' && module.exports) module.exports = impl;
  else root.VikramOpportunityRadar = impl;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATEGORIES = ['ALL', 'CONFIRMED', 'STARTING', 'VOLUME_BREAKOUT', 'HIGH_DELIVERY', 'OI_BUILD_UP'];

  // Categorizes a row using ONLY fields the real engine already computed — no invented
  // classification. A row may match more than one category; `matchesCategory` is the filter.
  function categoriesFor(row) {
    const cats = [];
    const m = row.metrics || {};
    if (row.verdict === 'ACCUMULATION CONFIRMED') cats.push('CONFIRMED');
    if (row.verdict === 'ACCUMULATION STARTING') cats.push('STARTING');
    if (m.volumeRatio != null && m.volumeRatio >= 2) cats.push('VOLUME_BREAKOUT');
    if (m.deliveryPct != null && m.deliveryPct >= 60) cats.push('HIGH_DELIVERY');
    if (m.hasDerivatives && m.changeOi != null && m.changeOi > 0) cats.push('OI_BUILD_UP');
    return cats;
  }

  function matchesCategory(row, category) {
    return !category || category === 'ALL' || categoriesFor(row).includes(category);
  }

  // Cross-factor rank score for ORDERING only (never displayed as if it were the engine's own
  // score, never fed back into the engine). Built entirely from real, already-present fields.
  function rankScore(row) {
    const m = row.metrics || {};
    const base = Number(row.score) || 0;
    const volumeBoost = m.volumeRatio != null ? Math.min(Number(m.volumeRatio), 5) * 2 : 0;
    const deliveryBoost = m.deliveryPct != null ? Number(m.deliveryPct) / 10 : 0;
    const oiBoost = m.hasDerivatives && m.changeOi != null && m.changeOi > 0 ? 5 : 0;
    return base + volumeBoost + deliveryBoost + oiBoost;
  }

  // Builds the ranked, filtered Opportunity Radar list. `rows` = the exact same real snapshot
  // rows already loaded for the Accumulation Scanner table.
  function buildRadar(rows, category = 'ALL') {
    const filtered = (rows || []).filter(r => matchesCategory(r, category));
    return filtered
      .map(r => ({ row: r, categories: categoriesFor(r), rankScore: rankScore(r) }))
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  // Progressive disclosure (Blueprint §5):
  //   Level 1 = simple result (symbol, verdict, score)
  //   Level 2 = why (the engine's own real explanation strings — never invented)
  //   Level 3 = evidence (the real metrics already computed)
  //   Level 4 = deeper research (pointer to the full Accumulation Scanner row for this symbol)
  function buildDisclosure(row) {
    return {
      level1: { symbol: row.symbol, companyName: row.companyName || null, verdict: row.verdict, score: row.score },
      level2: { why: Array.isArray(row.why) ? row.why.slice() : [] },
      level3: {
        volumeRatio: row.metrics?.volumeRatio ?? null,
        deliveryPct: row.metrics?.deliveryPct ?? null,
        obvTrend: row.metrics?.obvTrend ?? null,
        changeOi: row.metrics?.hasDerivatives ? (row.metrics?.changeOi ?? null) : null
      },
      level4: { deepLinkAnchor: `#scannerSurface`, note: 'Open the full Accumulation Scanner row for complete history and detection context.' }
    };
  }

  return { CATEGORIES, categoriesFor, matchesCategory, rankScore, buildRadar, buildDisclosure };
});
