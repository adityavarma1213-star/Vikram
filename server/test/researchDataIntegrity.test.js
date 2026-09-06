const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let loadedSnapshot = null;
const context = {
  window: {},
  fetch: async () => ({ ok: true, json: async () => loadedSnapshot })
};
vm.runInNewContext(fs.readFileSync('js/dataEngine.js', 'utf8'), context, { filename: 'js/dataEngine.js' });

loadedSnapshot = {
  status: 'ok',
  dataStatus: 'EOD VERIFIED',
  results: [{
    symbol: 'SWIGGY',
    companyName: 'Swiggy Limited',
    tradeDate: '2026-09-06',
    score: 100,
    verdict: 'ACCUMULATION CONFIRMED',
    metrics: { close: 276.10 },
    technical: {}
  }]
};

(async () => {
  await context.window.VIKRAM_DATA_ENGINE.loadSnapshot();
  const data = context.window.VIKRAM_DATA_ENGINE.analyzeAsset('SWIGGY');

  // Accumulation score may be 100 when the accumulation evidence supports it,
  // but it must never masquerade as the broader Research VIKRAM Score.
  assert.equal(data.meta.accumulationScore, 100);
  assert.equal(data.meta.accumulationVerdict, 'ACCUMULATION CONFIRMED');
  assert.equal(data.meta.vikramScore, null);
  assert.equal(data.meta.researchScore, null);
  assert.equal(data.meta.researchDataStatus, 'INSUFFICIENT DATA');
  assert.equal(data.meta.sector, null);
  assert.equal(data.meta.industry, null);
  assert.equal(data.meta.marketCap, null);

  console.log('research data-integrity test passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
