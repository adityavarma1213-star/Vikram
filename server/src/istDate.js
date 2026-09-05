// NSE ingestion uses the India calendar, not the host machine timezone.
const IST_OFFSET_MINUTES = 330;

function toIstCalendarDate(when = new Date()) {
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

module.exports = { toIstCalendarDate, addDays, formatYmd, formatDdMmYyyy, formatYmdCompact };