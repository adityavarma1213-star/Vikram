'use strict';
const assert = require('node:assert/strict');
const { renderDetectionCell } = require('../../js/detectionHistoryView.js');

// 1. No detection data at all -> DATA N/A, never a fabricated cell.
assert.equal(renderDetectionCell({ symbol: 'AAA', detection: null }), '<span class="text-muted">DATA N/A</span>');
assert.equal(renderDetectionCell({ symbol: 'AAA' }), '<span class="text-muted">DATA N/A</span>');

// 2. A brand-new (1-trading-day) detection: first and latest date/price are identical, so no
// separate "Latest" line is shown, and current LTP is never substituted for the detection price.
{
  const html = renderDetectionCell({
    symbol: 'AAA',
    detection: { firstDetectedDate: '2026-09-01', firstDetectedPrice: 106, latestDetectedDate: '2026-09-01', latestDetectedPrice: 106, detectedTradingDays: 1, detectionStatus: 'New' }
  });
  assert.ok(html.includes('detection-status--new'));
  assert.ok(html.includes('>New<'));
  assert.ok(html.includes('Since 2026-09-01 @ \u20b9106.00'));
  assert.ok(!html.includes('detection-latest'), 'a 1-day-old detection must not show a separate Latest line');
  assert.ok(html.includes('Caught for 1 trading day<'), 'singular "day" for exactly 1');
}

// 3. A multi-day streak shows a distinct "Latest" line with its own real historical price.
{
  const html = renderDetectionCell({
    symbol: 'AAA',
    detection: { firstDetectedDate: '2026-08-28', firstDetectedPrice: 105, latestDetectedDate: '2026-09-01', latestDetectedPrice: 106, detectedTradingDays: 3, detectionStatus: 'Active' }
  });
  assert.ok(html.includes('detection-status--active'));
  assert.ok(html.includes('Since 2026-08-28 @ \u20b9105.00'));
  assert.ok(html.includes('Latest 2026-09-01 @ \u20b9106.00'));
  assert.ok(html.includes('Caught for 3 trading days'));
}

// 4. A detection price of exactly 0 must still render (0 is a valid value), never treated as
// "missing" the way `null`/`undefined` are.
{
  const html = renderDetectionCell({
    detection: { firstDetectedDate: '2026-09-01', firstDetectedPrice: 0, latestDetectedDate: '2026-09-01', latestDetectedPrice: 0, detectedTradingDays: 1, detectionStatus: 'New' }
  });
  assert.ok(html.includes('\u20b90.00'));
}

// 5. A missing price within an otherwise-real detection renders DATA N/A for that price only,
// never a fabricated number.
{
  const html = renderDetectionCell({
    detection: { firstDetectedDate: '2026-09-01', firstDetectedPrice: null, latestDetectedDate: '2026-09-01', latestDetectedPrice: null, detectedTradingDays: 1, detectionStatus: 'New' }
  });
  assert.ok(html.includes('Since 2026-09-01 @ DATA N/A'));
}

console.log('detectionHistoryView.test.js: PASS');
