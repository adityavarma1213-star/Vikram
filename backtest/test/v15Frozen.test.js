// V15 must stay frozen. Hashes come from docs/recovery/frozen-hashes.json (captured at baseline).
// A golden output pins the engine's behaviour on a fixed input. Changing either needs explicit authorization.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const frozen = JSON.parse(fs.readFileSync(path.join(root, 'docs/recovery/frozen-hashes.json'), 'utf8'));
for (const [file, expected] of Object.entries(frozen)) {
  if (file.startsWith('_')) continue;
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  assert.equal(actual, expected, `${file} changed. V15 is frozen; stop and obtain explicit authorization.`);
}

const { evaluate } = require('../../accumulation/engine');
const row = (date, close, prevClose, volume, delivery) => ({ trade_date: date, close, prev_close: prevClose, volume, deliv_per: delivery, deliv_qty: Math.round(volume * delivery / 100) });
const base = [
  row('2026-08-18', 100, 99, 1000, 40), row('2026-08-19', 101, 100, 1050, 41), row('2026-08-20', 101, 101, 1100, 42),
  row('2026-08-21', 102, 101, 1080, 43), row('2026-08-24', 103, 102, 1150, 44), row('2026-08-25', 103, 103, 1180, 46),
  row('2026-08-26', 104, 103, 1250, 47), row('2026-08-27', 104, 104, 1300, 48), row('2026-08-28', 105, 104, 1400, 50),
  row('2026-09-01', 106, 105, 2000, 58)
];
const futures = { trade_date: '2026-09-01', oi: 100000, change_oi: 7000 };
const r = evaluate({ symbol: 'GOLD', history: base, current: base.at(-1), futures });
const actual = JSON.stringify({ score: r.score, verdict: r.verdict, metrics: r.metrics, components: r.components, gateFailures: r.confirmation.gateFailures });
const goldenFile = path.join(__dirname, 'fixtures/v15Golden.json');
assert.equal(actual, fs.readFileSync(goldenFile, 'utf8').trim(), 'frozen engine output changed for the golden input');
assert.equal(r.verdict, 'ACCUMULATION CONFIRMED');
console.log('v15Frozen tests passed');
