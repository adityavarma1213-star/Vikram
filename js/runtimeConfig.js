// VIKRAM — production integration: window.ACCUMULATION_API_BASE auto-configuration.
//
// This repo can be served two different ways:
//   1. The Render web service itself (server/src/index.js) serves this exact frontend via
//      express.static, same origin as the API -- in that case ACCUMULATION_API_BASE should stay
//      EMPTY so the existing relative fetch('/api/...') calls keep working exactly as before.
//   2. A separate GitHub Pages mirror of this same repo -- pure static hosting, cannot run the
//      backend at all, so it needs to know the real backend's origin to call it cross-origin.
//
// This script only ever sets window.ACCUMULATION_API_BASE for case 2. It never overrides a value
// already set by something loaded earlier (e.g. a manual override left in an HTML page), and it
// changes nothing for case 1 or for local development.
//
// IMPORTANT — the URL below is the DEFAULT Render-assigned hostname for the service named
// "vikram-accumulation" in render.yaml. It has NOT been independently verified as live or
// correct from this environment (no access to the actual Render deployment) -- if the real
// service uses a custom domain, or a different service name, update RENDER_BACKEND_URL below or
// set window.ACCUMULATION_API_BASE directly in the page before this script runs.
(function () {
  'use strict';
  if (window.ACCUMULATION_API_BASE) return; // already configured -- never override
  var RENDER_BACKEND_URL = 'https://vikram-accumulation.onrender.com';
  if (/github\.io$/i.test(window.location.hostname)) {
    window.ACCUMULATION_API_BASE = RENDER_BACKEND_URL;
  }
  // Same-origin deployments (the Render service itself, or local development) intentionally get
  // no value here -- existing relative-path fetch calls already work correctly in that case.
})();
