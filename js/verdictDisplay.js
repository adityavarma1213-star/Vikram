// Verdict column display helpers — pure mapping only.
// Does NOT classify signals (that is accumulation/engine.js).
// Does NOT change scores, thresholds, or Missing ≠ Zero.
//
// Contract: the four canonical engine verdicts must map to distinct CSS classes
// and render their exact strings unaltered. Substring matching is forbidden
// because "UNCONFIRMED / MIXED".includes("confirmed") is true and would
// incorrectly paint Unconfirmed as Confirmed.
(function (root, factory) {
  const impl = factory();
  if (typeof module === 'object' && module.exports) module.exports = impl;
  else root.VikramVerdictDisplay = impl;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CANONICAL = Object.freeze({
    'ACCUMULATION CONFIRMED': 'status-confirmed',
    'ACCUMULATION STARTING': 'status-starting',
    'UNCONFIRMED / MIXED': 'status-mixed',
    'DISTRIBUTION': 'status-distribution'
  });

  function verdictClass(value) {
    const key = String(value || '').trim().toUpperCase();
    return CANONICAL[key] || 'status-mixed';
  }

  function verdictLabel(value) {
    if (value == null || value === '') return 'N/A';
    return String(value);
  }

  return { CANONICAL, verdictClass, verdictLabel };
});