'use strict';
const assert = require('node:assert/strict');
const { buildCurrentDetection } = require('../src/staticSnapshot');

function row(date, close, prevClose, volume, delivery) {
  return { symbol: 'GOOD', trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: Math.round(volume * delivery / 100) };
}

// Same fixture shape as accumulationEngine.test.js's known-CONFIRMED case, reused here so this
// test exercises buildCurrentDetection() against a real, engine-verified confirmation rather than
// an assumed one.
const base = [
  row('2026-08-18', 100, 99, 1000, 40), row('2026-08-19', 101, 100, 1050, 41),
  row('2026-08-20', 101, 101, 1100, 42), row('2026-08-21', 102, 101, 1080, 43),
  row('2026-08-24', 103, 102, 1150, 44), row('2026-08-25', 103, 103, 1180, 46),
  row('2026-08-26', 104, 103, 1250, 47), row('2026-08-27', 104, 104, 1300, 48),
  row('2026-08-28', 105, 104, 1400, 50), row('2026-09-01', 106, 105, 2000, 58)
];

const historySnapshots = base.map(r => ({
  tradeDate: r.trade_date,
  cm: [r],
  futures: [{ symbol: 'GOOD', trade_date: r.trade_date, expiry: '2026-09-25', oi: 100000, change_oi: 7000 }]
}));

// 1. A genuinely CONFIRMED current result gets a real firstDetectedDate/Price and
// latestDetectedDate/Price captured from the actual historical row data — never fabricated,
// never substituting today's price for the historical detection price.
{
  const currentResults = [{ symbol: 'GOOD', tradeDate: '2026-09-01', verdict: 'ACCUMULATION CONFIRMED' }];
  const detection = buildCurrentDetection(historySnapshots, currentResults);
  const entry = detection.get('GOOD');
  assert.ok(entry, 'expected a detection entry for a confirmed symbol');
  assert.equal(entry.detectedTradingDays, 1);
  assert.equal(entry.detectionStatus, 'New');
  // A brand-new (1-trading-day) detection: first and latest date/price must be identical.
  assert.equal(entry.firstDetectedDate, '2026-09-01');
  assert.equal(entry.latestDetectedDate, '2026-09-01');
  assert.equal(entry.firstDetectedPrice, 106);
  assert.equal(entry.latestDetectedPrice, 106);
}

// 2. A current result whose verdict is NOT 'ACCUMULATION CONFIRMED' produces no detection entry
// at all — the function never invents a streak for a symbol that isn't actually confirmed.
{
  const currentResults = [{ symbol: 'GOOD', tradeDate: '2026-09-01', verdict: 'ACCUMULATION STARTING' }];
  const detection = buildCurrentDetection(historySnapshots, currentResults);
  assert.equal(detection.has('GOOD'), false);
}

// 3. A symbol with no historical rows at all produces no entry (never fabricates missing data).
{
  const currentResults = [{ symbol: 'UNKNOWN', tradeDate: '2026-09-01', verdict: 'ACCUMULATION CONFIRMED' }];
  const detection = buildCurrentDetection(historySnapshots, currentResults);
  assert.equal(detection.has('UNKNOWN'), false);
}

console.log('detectionHistory.test.js: PASS');
