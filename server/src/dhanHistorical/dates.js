'use strict';
// All VIKRAM-facing times are IST (UTC+05:30, no DST). Dhan timestamps are epoch seconds (UTC based).
const IST_MS = 330 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const dayNumber = s => Math.floor(Date.parse(s + 'T00:00:00Z') / 86400000);
const fromDayNumber = n => new Date(n * 86400000).toISOString().slice(0, 10);
const addDays = (s, n) => fromDayNumber(dayNumber(s) + n);
const diffDays = (a, b) => dayNumber(b) - dayNumber(a);

function istParts(epochSeconds) {
  const d = new Date(epochSeconds * 1000 + IST_MS);
  const iso = d.toISOString();                      // shifted clock, read as IST
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}
const istStamp = e => { const p = istParts(e); return `${p.date} ${p.time}`; };
const todayIst = (now = Date.now()) => new Date(now + IST_MS).toISOString().slice(0, 10);

module.exports = { isValidDateStr, dayNumber, addDays, diffDays, istParts, istStamp, todayIst };
