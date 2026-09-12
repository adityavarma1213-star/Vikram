// Date helpers for the 5-year NSE historical downloader.
// All dates are handled as IST calendar dates (NSE's own timezone), matching
// server/src/istDate.js conventions already used elsewhere in this repo.

function toIstCalendarDate(when = new Date()) {
  const IST_OFFSET_MINUTES = 330;
  const shifted = new Date(when.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function addDays(date, delta) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + delta);
  return copy;
}

function formatYmd(date) { return date.toISOString().slice(0, 10); }
function formatDdMmYyyy(date) { return formatYmd(date).split('-').reverse().join(''); }
function formatYmdCompact(date) { return formatYmd(date).replaceAll('-', ''); }

function isWeekend(date) {
  const day = date.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

// Generates every CALENDAR-DAY candidate (minus weekends) between start and end,
// inclusive, oldest first. This is NOT the authoritative NSE trading calendar —
// it is only a candidate list. Whether a candidate date was an actual NSE trading
// session is determined empirically, from whether NSE's own archive actually
// returns a valid, schema-correct file whose internal trade date matches the
// requested date (see nseCalendar.js). We deliberately do not hardcode a NSE
// holiday list as ground truth, because an unverified hardcoded list could
// silently mislabel a real trading session as a holiday (or vice versa).
function candidateSessionDates(startDate, endDate) {
  const dates = [];
  let cursor = new Date(startDate.getTime());
  while (cursor.getTime() <= endDate.getTime()) {
    if (!isWeekend(cursor)) dates.push(new Date(cursor.getTime()));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

module.exports = {
  toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact,
  isWeekend, candidateSessionDates
};
