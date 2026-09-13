/*!
 * VIKRAM Subscription & Access Management — client integration point.
 * ------------------------------------------------------------------
 * Provides window.VikramAccess.can(featureKey), the exact hook
 * js/vikramGuide.js already calls defensively (assignment: "provide
 * the clean integration point needed for window.VikramAccess.can(...)").
 *
 * THIS IS A UI HINT ONLY. Real enforcement is 100% server-side, in
 * server/src/subscription/service.js:requireEntitlement — this file
 * has no ability to unlock a feature the server would otherwise
 * refuse, and it must never be treated as authoritative anywhere.
 * If this file fails to load, is blocked, or is edited in the
 * browser devtools, the worst case is a nav suggestion the server
 * still rejects afterwards — never a bypass.
 *
 * Deliberately not merged into vikramGuide.js: the Guide must keep
 * working unmodified whether or not this file (or a backend) exists.
 *
 * Feature-key note: server/src/subscription/entitlements.js's FEATURES
 * are monetization keys (scanner, research, advancedAnalytics,
 * portfolio, alerts, premiumIntelligence). vikramGuide.js's nav keys
 * are page/section keys (some coincide, e.g. 'scanner'/'research'/
 * 'portfolio'/'alerts'; others, like 'hiddenGems' or 'nseData', don't
 * correspond to any monetization key yet). Deciding which pages map to
 * which paid feature is a product/business rule this assignment does
 * not invent (see entitlements.js's own PLACEHOLDER comment) — so any
 * key VikramAccess doesn't recognize as a monetization key is treated
 * as freely allowed here, not silently hidden.
 */
(function () {
  'use strict';

  if (window.VikramAccess) return; // don't clobber an existing implementation

  var TOKEN_KEY = 'vikram-auth-token';
  var API_BASE = window.VIKRAM_API_BASE || '';
  var cache = null; // last successfully fetched entitlements, or null if unknown
  var inFlight = null;

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function load() {
    if (inFlight) return inFlight;
    var token = getToken();
    if (!token) {
      // Not signed in yet. This is not an error and must not prompt a login just to render a
      // help widget — the Guide (and this hook) work fine for anonymous browsing.
      cache = null;
      return Promise.resolve(null);
    }
    inFlight = fetch(API_BASE + '/api/subscription/me', {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { cache = data; return data; })
      .catch(function () { return null; })
      .finally(function () { inFlight = null; });
    return inFlight;
  }

  // Kick off a background, best-effort load. Never blocks page render or the Guide.
  load();

  window.VikramAccess = {
    // Synchronous best-effort check for UI hints (e.g. the Guide deciding whether to show a nav
    // link). Unknown feature keys, and any state before the first fetch resolves, default to
    // allowed — the server is always the real gate, so failing open here only ever costs a wasted
    // click, never a real bypass.
    can: function (featureKey) {
      if (!cache || !cache.features) return true;
      if (!Object.prototype.hasOwnProperty.call(cache.features, featureKey)) return true;
      return !!cache.features[featureKey];
    },
    // Exposed so other code (e.g. a future account/settings page) can force a re-check after the
    // user upgrades, cancels, or signs in.
    refresh: load
  };
})();
