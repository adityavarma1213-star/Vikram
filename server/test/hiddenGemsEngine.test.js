'use strict';
const assert = require('node:assert/strict');
const hiddenGems = require('../../hiddenGems/engine');

function row(date, close, prevClose, volume, delivery) {
  return { trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: Math.round(volume * delivery / 100) };
}

// Same fixture accumulationEngine.test.js proves produces a real ACCUMULATION CONFIRMED verdict
// from the actual canonical engine — reused here so this test exercises genuine engine wiring.
const confirmedHistory = [
  row('2026-08-18', 100, 99, 1000, 40), row('2026-08-19', 101, 100, 1050, 41),
  row('2026-08-20', 101, 101, 1100, 42), row('2026-08-21', 102, 101, 1080, 43),
  row('2026-08-24', 103, 102, 1150, 44), row('2026-08-25', 103, 103, 1180, 46),
  row('2026-08-26', 104, 103, 1250, 47), row('2026-08-27', 104, 104, 1300, 48),
  row('2026-08-28', 105, 104, 1400, 50), row('2026-09-01', 106, 105, 2000, 58)
];
const futures = { trade_date: '2026-09-01', oi: 100000, change_oi: 7000 };

// 1. Insufficient history -> DATA_INSUFFICIENT, never a guessed classification.
{
  const result = hiddenGems.evaluate({ symbol: 'SHORT', history: confirmedHistory.slice(0, 2), current: confirmedHistory[1], futures });
  assert.equal(result.classification, 'DATA_INSUFFICIENT');
  assert.equal(result.isRecommendation, false);
}

// 2. Real accumulation engine wiring: opportunityQualifies reflects the ACTUAL verdict from
// accumulation/engine.js, not an assumption.
{
  const result = hiddenGems.evaluate({ symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures });
  assert.equal(result.accumulationVerdict, 'ACCUMULATION CONFIRMED');
  assert.equal(result.opportunityQualifies, true);
  assert.equal(result.isRecommendation, false);
}

// 3. No institutional data supplied -> institutionalState is DATA_INSUFFICIENT, never fabricated,
// and this correctly caps data confidence at LOW regardless of other evidence.
{
  const result = hiddenGems.evaluate({ symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures, institutionalData: null });
  assert.equal(result.institutionalState, 'DATA_INSUFFICIENT');
  assert.equal(result.dataConfidence, 'LOW');
}

// 4. Real institutional data supplied -> genuinely used, never overridden with an invented value.
{
  const result = hiddenGems.evaluate({
    symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures,
    institutionalData: { combinedPct: 8, qoqChangePct: 2, publicationDate: '2026-08-15' }
  });
  assert.equal(result.institutionalState, 'UNDER_RECOGNIZED');
  assert.equal(result.institutionalDetail.combinedPct, 8);
  assert.equal(result.institutionalDetail.publicationDate, '2026-08-15');
}

// 5. CRITICAL: NIFTY 500 membership must NOT auto-disqualify a stock from Hidden Gems — it only
// adjusts the stealth bar (tier context), per explicit instruction.
{
  const withoutIndex = hiddenGems.evaluate({ symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures, universeMembership: [] });
  const withNifty500 = hiddenGems.evaluate({ symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures, universeMembership: ['NIFTY 500'] });
  assert.notEqual(withNifty500.classification, 'DATA_INSUFFICIENT', 'NIFTY 500 membership must not force DATA_INSUFFICIENT');
  assert.equal(withNifty500.tier, 'NIFTY 500');
  assert.equal(withoutIndex.tier, 'NONE');
  // Both remain eligible for the SAME set of classifications — tier changes the bar, not eligibility.
  assert.ok(['GENUINE_HIDDEN_GEM', 'EMERGING_OPPORTUNITY', 'RECOGNIZED_OPPORTUNITY'].includes(withNifty500.classification));
}

// 6. Classification never returns anything resembling a BUY signal, and every result says so
// explicitly.
{
  const result = hiddenGems.evaluate({ symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures });
  assert.equal(result.isRecommendation, false);
  assert.ok(!['BUY', 'SELL', 'STRONG_BUY'].includes(result.classification));
}

// 7. Configuration is explicitly versioned and marked unvalidated on every result.
{
  const result = hiddenGems.evaluate({ symbol: 'GOOD', history: confirmedHistory, current: confirmedHistory.at(-1), futures });
  assert.equal(result.configVersion, 'HIDDEN_GEMS_PROVISIONAL_v1_UNVALIDATED');
}

// 8. Lead-time measurement: never invents a recognition date. If recognition never occurs in the
// supplied real sequence, lead time stays unmeasured.
{
  const sequence = [
    { T0: '2026-09-01', tradeDate: '2026-09-01', recognitionState: 'NOT_RECOGNIZED' },
    { tradeDate: '2026-09-02', recognitionState: 'NOT_RECOGNIZED' },
    { tradeDate: '2026-09-03', recognitionState: 'EMERGING_RECOGNITION' }
  ];
  const noRecognitionYet = hiddenGems.measureLeadTime(sequence, '2026-09-01');
  assert.equal(noRecognitionYet.leadTimeState, 'NOT_YET_RECOGNIZED');
  assert.equal(noRecognitionYet.leadTimeTradingDays, null);

  const withRecognition = hiddenGems.measureLeadTime([...sequence, { tradeDate: '2026-09-04', recognitionState: 'RECOGNIZED' }], '2026-09-01');
  assert.equal(withRecognition.leadTimeState, 'MEASURED');
  assert.equal(withRecognition.leadTimeTradingDays, 3); // real count of sessions from T0 to recognition
}

console.log('hiddenGemsEngine.test.js: PASS');
