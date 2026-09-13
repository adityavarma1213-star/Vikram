// VikramResearchIntelligence — thin static loader for data/researchIntelligence.json,
// the canonical per-symbol historical-evidence artifact built by
// backtest/lib/researchIntelligence.js from real ASM (Accumulation Success Matrix)
// output. Shared between the browser (index.html's Opportunity Radar / Hidden Gems
// sections) and anything else that wants "how has this symbol's signal performed
// historically" without re-fetching or re-deriving it.
//
// Loads once, caches in memory for the page lifetime. If the artifact is missing or
// fails to load (e.g. a backtest has never been run), lookups simply return null —
// callers must treat that as "no historical evidence available", never substitute an
// estimate.
(function (root, factory) {
  const impl = factory();
  if (typeof module === 'object' && module.exports) module.exports = impl;
  else root.VikramResearchIntelligence = impl;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let cachedData = null;
  let loadPromise = null;

  async function load(fetchPath = 'data/researchIntelligence.json') {
    if (cachedData) return cachedData;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const res = await fetch(fetchPath, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        cachedData = json && json.symbols ? json : { symbols: {}, symbolCount: 0 };
      } catch (error) {
        // Never fabricate: absence of the artifact just means no evidence is available yet.
        cachedData = { symbols: {}, symbolCount: 0, loadError: error.message };
      }
      return cachedData;
    })();
    return loadPromise;
  }

  // Returns the per-symbol evidence object, or null if genuinely unavailable.
  function getEvidence(symbol) {
    if (!cachedData || !symbol) return null;
    return cachedData.symbols[String(symbol).toUpperCase()] || cachedData.symbols[symbol] || null;
  }

  // Convenience: the specific horizon block for a symbol (e.g. '20D'), or null.
  function getHorizonEvidence(symbol, horizonKey) {
    const evidence = getEvidence(symbol);
    if (!evidence || !evidence.horizons) return null;
    return evidence.horizons[horizonKey] || null;
  }

  function isLoaded() {
    return !!cachedData;
  }

  return { load, getEvidence, getHorizonEvidence, isLoaded };
});
