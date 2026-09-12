// Pure, dependency-free universe-membership matching logic shared between the browser
// (index.html's inline scanner-filter script) and the Node test suite (server/test/
// universeMembership.test.js), so this logic is actually unit-tested rather than only
// eyeballed in a browser that isn't available in CI/this environment.
(function (root, factory) {
  const impl = factory();
  if (typeof module === 'object' && module.exports) module.exports = impl; // Node/CommonJS
  else root.VikramUniverseMembership = impl; // browser global
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Returns true if row `r` belongs to universe `u` ('ALL' always matches). Mirrors the exact
  // fields staticSnapshot.js attaches to each row (r.indexMembership, an array like
  // ['NIFTY 50','NIFTY 200']), with a few tolerant aliases for forward-compatibility.
  // Uses exact token matching (not substring includes()) — "NIFTY 500" contains the characters
  // "NIFTY 50", so a naive .includes(u) check would incorrectly count Nifty-500-only stocks as
  // Nifty 50 members. This was a real bug in the original code, caught by this module's tests.
  function matchesUniverse(r, u) {
    if (!u || u === 'ALL') return true;
    const target = String(u).toUpperCase();
    const tokens = [r && r.universe, r && r.index, r && r.indexName, r && r.indexMembership, r && r.universeName]
      .filter(Boolean)
      .flatMap(v => Array.isArray(v) ? v : [v])
      .map(v => String(v).toUpperCase());
    return tokens.includes(target);
  }

  // Builds the honest "N constituents · STATUS" line: never guesses a count when the universe
  // membership data itself is unavailable (indexUniverseStatus !== 'VERIFIED').
  function universeStatusLine(rows, u, indexUniverseStatus) {
    const list = Array.isArray(rows) ? rows : [];
    if (!u || u === 'ALL') return `${list.length} stocks \u00b7 EOD VERIFIED`;
    const count = list.filter(r => matchesUniverse(r, u)).length;
    return `${count} constituents \u00b7 ${indexUniverseStatus || 'DATA N/A'}`;
  }

  return { matchesUniverse, universeStatusLine };
});
