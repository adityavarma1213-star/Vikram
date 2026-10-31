'use strict';
// SYNTHETIC TEST DATA -- NOT REAL MARKET DATA. Invented numbers for unit tests only.
const IST_OFFSET = 330 * 60;
const epochIstMidnight = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000) - IST_OFFSET;
const epochIst = (d, hh, mm) => epochIstMidnight(d) + hh * 3600 + mm * 60;

function dailyPayload(dates) {
  const p = { open: [], high: [], low: [], close: [], volume: [], timestamp: [], open_interest: [] };
  dates.forEach((d, i) => { const b = 100 + i; p.open.push(b); p.high.push(b + 2); p.low.push(b - 1); p.close.push(b + 1); p.volume.push(1000 + i); p.timestamp.push(epochIstMidnight(d)); p.open_interest.push(0); });
  return p;
}
function intradayPayload(date, bars = 75) {
  const p = { open: [], high: [], low: [], close: [], volume: [], timestamp: [], open_interest: [] };
  for (let i = 0; i < bars; i++) { const t = 9 * 60 + 15 + i * 5; const b = 200 + (i % 7); p.open.push(b); p.high.push(b + 1); p.low.push(b - 1); p.close.push(b + 0.5); p.volume.push(500 + i); p.timestamp.push(epochIst(date, Math.floor(t / 60), t % 60)); p.open_interest.push(0); }
  return p;
}
const SCRIP_MASTER_CSV = [
  'SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,SEM_TRADING_SYMBOL,SEM_CUSTOM_SYMBOL,SEM_SERIES',
  'NSE,E,900001,EQUITY,TESTCO,Test Company Ltd,EQ',
  'NSE,E,900002,EQUITY,DEMOBANK,Demo Bank Ltd,EQ',
  'NSE,D,900003,FUTSTK,TESTCO,Test Co Future,XX',
  'BSE,E,900004,EQUITY,BSEONLY,Bse Only Ltd,A',
].join('\n');
const FAKE_TOKEN = 'eyJFAKEFAKEFAKE.FAKEPAYLOAD1.FAKESIG123';
module.exports = { dailyPayload, intradayPayload, epochIstMidnight, epochIst, SCRIP_MASTER_CSV, FAKE_TOKEN };
