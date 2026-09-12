// Pure, dependency-free Detection History cell renderer, shared between the browser
// (index.html's inline scanner-table script) and the Node test suite (server/test/
// detectionHistoryView.test.js). Renders ONLY what the backend genuinely computed in
// r.detection (server/src/staticSnapshot.js's buildCurrentDetection — a real trading-session
// walk using the real accumulation engine). Never substitutes today's price for a historical
// detection price, never invents a date, and always falls back to DATA N/A rather than guessing.
(function (root, factory) {
  const impl = factory();
  if (typeof module === 'object' && module.exports) module.exports = impl; // Node/CommonJS
  else root.VikramDetectionHistoryView = impl; // browser global
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatPrice(p) {
    return p == null ? 'DATA N/A' : `\u20b9${Number(p).toFixed(2)}`;
  }

  // Returns the exact inner HTML for the Detection History table cell for one scanner row.
  function renderDetectionCell(row, text = escapeHtml) {
    const d = row && row.detection;
    if (!d || !d.firstDetectedDate || !d.latestDetectedDate) return '<span class="text-muted">DATA N/A</span>';
    const statusClass = d.detectionStatus === 'New' ? 'detection-status--new' : 'detection-status--active';
    const sinceLine = `Since ${text(d.firstDetectedDate)} @ ${formatPrice(d.firstDetectedPrice)}`;
    const isNewDetection = d.latestDetectedDate === d.firstDetectedDate;
    const latestLine = isNewDetection ? '' : `<div class="detection-latest">Latest ${text(d.latestDetectedDate)} @ ${formatPrice(d.latestDetectedPrice)}</div>`;
    const days = Number(d.detectedTradingDays) || 0;
    return `<div class="detection-cell"><span class="detection-status ${statusClass}">${text(d.detectionStatus)}</span><div class="detection-since">${sinceLine}</div>${latestLine}<div class="detection-days">Caught for ${days} trading day${days === 1 ? '' : 's'}</div></div>`;
  }

  return { renderDetectionCell, formatPrice };
});
