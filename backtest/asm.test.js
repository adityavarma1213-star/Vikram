const assert = require('assert');
const { buildAsmEvent, summarize } = require('./asm');

function bars(count = 130) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    const d = date.toISOString().slice(0, 10);
    const close = 100 + i;
    return { date: d, open: close - 1, high: close + 2, low: close - 3, close, volume: 1000 };
  });
}

const data = bars();
const event = { symbol: 'TEST', t0: data[0].date, p0: data[0].close, module: 'Accumulation Scanner', classification: 'CONFIRMED' };
const result = buildAsmEvent(event, data);
assert.equal(result.asmStatus, 'CALCULATED');
assert.equal(result.outcomes.length, 5);
assert.equal(result.outcomes.find(x => x.horizon === 1).exitDate, data[1].date);
assert.equal(result.outcomes.find(x => x.horizon === 120).available, true);
assert(result.outcomes.find(x => x.horizon === 20).mfePct > 0);

const shortResult = buildAsmEvent(event, data.slice(0, 10));
assert.equal(shortResult.outcomes.find(x => x.horizon === 120).available, false);
assert.equal(shortResult.outcomes.find(x => x.horizon === 5).available, true);

const s = summarize([result]);
assert.equal(s[20].sampleSize, 1);
assert(s[20].hitRatePct > 0);

console.log('ASM tests passed');
