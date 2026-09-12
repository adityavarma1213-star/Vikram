'use strict';
// SYNTHETIC_TEST_ONLY fixtures — validates ASM arithmetic, not any real market claim.
const assert = require('node:assert/strict');
const { buildAsm, enrichSignalWithAsm, computeExcursion } = require('../lib/asm');

// Synthetic 10-session price path for one symbol. Entry at index 2 (close=100).
const history = [
  { trade_date: '2024-01-01', close: 95 },
  { trade_date: '2024-01-02', close: 98 },
  { trade_date: '2024-01-03', close: 100 }, // T0/P0
  { trade_date: '2024-01-04', close: 108 }, // +8% (peak so far)
  { trade_date: '2024-01-05', close: 90 },  // -10% from entry, -16.67% from peak
  { trade_date: '2024-01-06', close: 95 },
  { trade_date: '2024-01-07', close: 112 }  // exit at horizon 4 (index 6)
];

// 1. computeExcursion: MFE is the best gain seen, MAE the worst, drawdown from the running peak.
{
  const { mfePct, maePct, maxDrawdownPct } = computeExcursion(history, 2, 6, 100);
  assert.equal(mfePct, 12); // (112/100 - 1) * 100
  assert.equal(maePct, -10); // (90/100 - 1) * 100
  // peak was 108 (index 3), trough after that was 90 (index 4): (90/108 - 1)*100 = -16.67
  assert.equal(maxDrawdownPct, -16.67);
}

// 2. enrichSignalWithAsm: T0/P0 are copied verbatim and never recomputed.
{
  const signal = {
    symbol: 'SYN_TEST', signalDate: '2024-01-03', entryClose: 100, score: 80,
    forwardReturns: {
      '1D': { status: 'COMPUTED', exitDate: '2024-01-04', exitClose: 108, returnPct: 8 },
      '5D': { status: 'INSUFFICIENT_FUTURE_DATA' },
      '20D': { status: 'INSUFFICIENT_FUTURE_DATA' },
      '60D': { status: 'INSUFFICIENT_FUTURE_DATA' },
      '120D': { status: 'INSUFFICIENT_FUTURE_DATA' }
    }
  };
  const record = enrichSignalWithAsm(signal, history, 2, null);
  assert.equal(record.T0, '2024-01-03');
  assert.equal(record.P0, 100);
  assert.equal(record.horizons['1D'].status, 'COMPUTED');
  assert.equal(record.horizons['1D'].returnPct, 8);
  assert.equal(record.horizons['1D'].benchmarkRelativeReturnPct, 'NOT_AVAILABLE — no benchmark series provided');
  // Insufficient-future-data horizons never get an invented MFE/MAE.
  assert.equal(record.horizons['5D'].mfePct, null);
  assert.equal(record.horizons['5D'].benchmarkRelativeReturnPct, 'NOT_AVAILABLE');
}

// 3. Benchmark-relative return: computed only when a benchmark series is actually supplied.
{
  const signal = {
    symbol: 'SYN_TEST', signalDate: '2024-01-03', entryClose: 100, score: 80,
    forwardReturns: { '1D': { status: 'COMPUTED', exitDate: '2024-01-04', exitClose: 108, returnPct: 8 } }
  };
  const benchmark = new Map([['2024-01-03', 1000], ['2024-01-04', 1030]]); // benchmark +3%
  const record = enrichSignalWithAsm(signal, history, 2, benchmark);
  assert.equal(record.horizons['1D'].benchmarkRelativeReturnPct, 5); // 8% - 3%
}

// 4. buildAsm end-to-end over a small signal set, no benchmark supplied.
{
  const bySymbolHistory = new Map([['SYN_TEST', history]]);
  const signals = [{
    symbol: 'SYN_TEST', signalDate: '2024-01-03', entryClose: 100, score: 80,
    forwardReturns: { '1D': { status: 'COMPUTED', exitDate: '2024-01-04', exitClose: 108, returnPct: 8 } }
  }];
  const asm = buildAsm(signals, bySymbolHistory);
  assert.equal(asm.benchmarkProvided, false);
  assert.equal(asm.records.length, 1);
  assert.ok(/NOT a trading signal/.test(asm.note));
}

console.log('asm.test.js: PASS (SYNTHETIC_TEST_ONLY fixtures — validates ASM math, not real performance)');
