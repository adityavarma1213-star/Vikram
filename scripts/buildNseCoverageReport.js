// Computes data/nse-coverage-report.json from the REAL files in data/market-history — every
// number here is a direct count over real stored NSE EOD data, never estimated. Re-run this
// script (`node scripts/buildNseCoverageReport.js`) any time data/market-history changes, so the
// NSE Data Management page always reflects what is actually on disk.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
const OUT_PATH = path.join(ROOT, 'data', 'nse-coverage-report.json');

// A stock's delivery% is only meaningful if NSE actually published it for that CM row. `0` is a
// legitimate reported value (a stock can genuinely trade with zero delivery), so a single zero
// row is never treated as missing data. What IS a genuine, checkable data-quality signal is a day
// where NEARLY EVERY row reports exactly 0 — that pattern does not occur on any other day in this
// dataset and is flagged for disclosure rather than silently accepted or silently hidden.
const ZERO_DELIVERY_FLAG_THRESHOLD = 0.9; // 90%+ of CM rows reporting exactly 0% delivery on a single day

function isWeekday(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function addDaysYmd(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function buildReport() {
  if (!fs.existsSync(HISTORY_DIR)) {
    return { status: 'DATA_INSUFFICIENT', reason: 'data/market-history directory not found.' };
  }
  const files = fs.readdirSync(HISTORY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) {
    return { status: 'DATA_INSUFFICIENT', reason: 'No dated market-history files found.' };
  }

  const dates = files.map(f => f.replace('.json', ''));
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const presentSet = new Set(dates);

  // Weekdays in [firstDate, lastDate] with no stored file. This CANNOT distinguish a genuine NSE
  // trading holiday from an actual ingestion gap — no NSE holiday calendar exists anywhere in
  // this repository — so it is reported honestly as "unaccounted weekdays", not as "missing
  // data" or "gaps", and the report says so explicitly.
  const unaccountedWeekdays = [];
  for (let d = firstDate; d <= lastDate; d = addDaysYmd(d, 1)) {
    if (isWeekday(d) && !presentSet.has(d)) unaccountedWeekdays.push(d);
  }

  let cmDays = 0, foDays = 0, cmRowsTotal = 0, foRowsTotal = 0;
  let cmSymbolDaysWithDeliveryData = 0; // deliv_per present (not null/undefined) — NSE actually reported a value
  let foRowsWithOi = 0;
  const zeroDeliveryFlaggedDates = [];
  const emptyFoDates = [];
  const emptyCmDates = [];
  // A stale file re-saved under a later date (e.g. a holiday's snapshot silently copying the
  // prior trading day forward) is a real, previously-found defect in this pipeline — it does not
  // announce itself as an empty file, so daysWithoutData/emptyDates above cannot catch it. This
  // check flags a day only when EVERY CM symbol common to it and the immediately preceding stored
  // day has an identical closing price — a fact checkable directly from the files, not a guess
  // about whether NSE was actually open that day.
  const suspectedDuplicateCmSessions = [];
  let previousCmByDate = null, previousDate = null;

  for (const file of files) {
    const ymd = file.replace('.json', '');
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
    } catch (error) {
      // A file that fails to parse is real, verifiable corruption — surfaced, not skipped silently.
      zeroDeliveryFlaggedDates.push({ date: ymd, issue: `FILE_PARSE_ERROR: ${error.message}` });
      continue;
    }
    const cm = Array.isArray(parsed.cm) ? parsed.cm : [];
    const fo = Array.isArray(parsed.futures) ? parsed.futures : [];
    if (cm.length) cmDays += 1; else emptyCmDates.push(ymd);
    if (fo.length) foDays += 1; else emptyFoDates.push(ymd);
    cmRowsTotal += cm.length;
    foRowsTotal += fo.length;

    let zeroDelivCount = 0;
    let deliveryPresentCount = 0;
    for (const row of cm) {
      if (row.deliv_per !== null && row.deliv_per !== undefined) deliveryPresentCount += 1;
      if (row.deliv_per === 0) zeroDelivCount += 1;
    }
    cmSymbolDaysWithDeliveryData += deliveryPresentCount;
    if (cm.length && (zeroDelivCount / cm.length) >= ZERO_DELIVERY_FLAG_THRESHOLD) {
      zeroDeliveryFlaggedDates.push({ date: ymd, issue: `${zeroDelivCount} of ${cm.length} CM rows (${Math.round(100 * zeroDelivCount / cm.length)}%) report exactly 0% delivery — verified anomaly, not fabricated, not silently corrected` });
    }

    for (const row of fo) {
      if (row.oi !== null && row.oi !== undefined) foRowsWithOi += 1;
    }

    if (previousCmByDate && cm.length >= 50 && previousCmByDate.size >= 50) {
      let compared = 0, identical = 0;
      for (const row of cm) {
        if (!previousCmByDate.has(row.symbol)) continue;
        compared += 1;
        if (previousCmByDate.get(row.symbol) === row.close) identical += 1;
      }
      if (compared >= 50 && identical === compared) {
        suspectedDuplicateCmSessions.push({ date: ymd, comparedTo: previousDate, symbolsCompared: compared });
      }
    }
    if (cm.length) { previousCmByDate = new Map(cm.map(r => [r.symbol, r.close])); previousDate = ymd; }
  }

  return {
    status: 'VERIFIED',
    generatedAt: new Date().toISOString(),
    source: 'data/market-history/*.json (real NSE EOD bhavcopy-derived files)',
    dateRange: { first: firstDate, last: lastDate },
    tradingSessions: dates.length,
    cm: {
      daysWithData: cmDays,
      daysWithoutData: dates.length - cmDays,
      totalRows: cmRowsTotal,
      rowsWithDeliveryValuePresent: cmSymbolDaysWithDeliveryData,
      deliveryFieldCoveragePct: cmRowsTotal ? Math.round((cmSymbolDaysWithDeliveryData / cmRowsTotal) * 10000) / 100 : null,
      emptyDates: emptyCmDates,
      suspectedDuplicateSessions: suspectedDuplicateCmSessions
    },
    fo: {
      daysWithData: foDays,
      daysWithoutData: dates.length - foDays,
      totalRows: foRowsTotal,
      rowsWithOiPresent: foRowsWithOi,
      oiFieldCoveragePct: foRowsTotal ? Math.round((foRowsWithOi / foRowsTotal) * 10000) / 100 : null,
      emptyDates: emptyFoDates
    },
    dataQualityFlags: zeroDeliveryFlaggedDates,
    unaccountedWeekdays: {
      status: 'DATA_INSUFFICIENT_TO_CLASSIFY',
      reason: 'No NSE trading-holiday calendar exists in this repository, so a weekday with no stored file cannot be distinguished from a genuine market holiday. Listed for disclosure only — not asserted to be a gap or an error.',
      dates: unaccountedWeekdays
    }
  };
}

const report = buildReport();
fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(`Wrote ${OUT_PATH}`);
console.log(JSON.stringify(report.status === 'VERIFIED' ? {
  status: report.status, dateRange: report.dateRange, tradingSessions: report.tradingSessions,
  cmDaysWithData: report.cm.daysWithData, foDaysWithData: report.fo.daysWithData,
  deliveryFieldCoveragePct: report.cm.deliveryFieldCoveragePct, oiFieldCoveragePct: report.fo.oiFieldCoveragePct,
  dataQualityFlagCount: report.dataQualityFlags.length, unaccountedWeekdayCount: report.unaccountedWeekdays.dates.length
} : report, null, 2));

module.exports = { buildReport };
