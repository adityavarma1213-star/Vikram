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
    // hasDerivatives was never set anywhere in the real data pipeline (accumulation/engine.js,
    // accumulation/api.js, js/app.js) -- it always evaluated undefined/false, silently
    // suppressing this category even for symbols with real, non-null changeOi. changeOi != null
    // is already the correct, sufficient check on its own (a real value only exists when the
    // symbol genuinely has derivatives data for this date). Fixed 2026-09-16.
    if (m.changeOi != null && m.changeOi > 0) cats.push('OI_BUILD_UP');
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
    const oiBoost = m.changeOi != null && m.changeOi > 0 ? 5 : 0; // see categoriesFor() above for why hasDerivatives was removed
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
  //   Level 5 (optional) = historical research evidence for this exact symbol, from the
  //   canonical Research Intelligence artifact (see backtest/lib/researchIntelligence.js /
  //   data/researchIntelligence.json). Purely additive and OFF by default (only present when
  //   the caller supplies `intelligenceMap`) — this is CURRENT-SIGNAL evidence (levels 1-4)
  //   plus HISTORICAL evidence (level 5), never blended into rankScore/verdict/score above, so
  //   the two stay distinguishable rather than the historical record silently overriding or
  //   replacing the live signal (per the integration blueprint's explicit instruction).
  function buildDisclosure(row, intelligenceMap = null) {
    const disclosure = {
      level1: { symbol: row.symbol, companyName: row.companyName || null, verdict: row.verdict, score: row.score },
      level2: { why: Array.isArray(row.why) ? row.why.slice() : [] },
      level3: {
        volumeRatio: row.metrics?.volumeRatio ?? null,
        deliveryPct: row.metrics?.deliveryPct ?? null,
        obvTrend: row.metrics?.obvTrend ?? null,
        changeOi: row.metrics?.changeOi ?? null // hasDerivatives removed -- see categoriesFor() header comment
      },
      level4: { deepLinkAnchor: `#scannerSurface`, note: 'Open the full Accumulation Scanner row for complete history and detection context.' }
    };
    if (intelligenceMap) {
      const evidence = intelligenceMap.get ? intelligenceMap.get(row.symbol) : intelligenceMap[row.symbol];
      disclosure.level5 = { historicalEvidence: evidence || null };
    }
    return disclosure;
  }

  return { CATEGORIES, categoriesFor, matchesCategory, rankScore, buildRadar, buildDisclosure };
});
