'use strict';
// Reporting helpers for the recovered replay. Pure functions: no engine calls, no I/O.

const { CSV_COLUMNS, recordToFlat, toCsv, parseCsv } = require('./telemetrySchema');

const BASELINE_LAST_VERDICT_DATE = '2026-09-03';
const REPAIRED_RANGE_NOTE = 'Date is after the original report\'s last recorded verdict (2026-09-03). The original run saw zero-filled delivery (Sep 4-15) or no stored run (Sep 16 onward); this date is recovered from repaired data/market-history.';

// One flat CSV row per confirmed catch-day, in the canonical column order.
function buildCatchHistoryRows(signals, provenance) {
  const rows = [];
  for (const s of signals) {
    const decisions = s.decisions || [];
    decisions.forEach((record, i) => {
      rows.push(recordToFlat(record, {
        eventIndex: s.eventIndex, streakDay: i + 1, streakLength: s.tradingSessionStreak,
        engineSha256: provenance.engineSha256, configSha256: provenance.configSha256,
        datasetVersion: provenance.datasetVersion, dataStatus: 'OK', evidence: 'RECOVERED_REPLAY'
      }));
    });
  }
  rows.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.symbol.localeCompare(b.symbol));
  return rows;
}

const near = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));

// baselineCsvText: the original v15_confirmed_catches_full.csv (read-only evidence).
// recoveredRows: output of buildCatchHistoryRows.
function compareToBaseline(baselineCsvText, recoveredRows, { sessionStatusByDate = {} } = {}) {
  const baseline = parseCsv(baselineCsvText);
  const key = (symbol, date) => `${symbol}|${date}`;
  const recovered = new Map(recoveredRows.map(r => [key(r.symbol, r.tradeDate), r]));
  const baselineMap = new Map(baseline.map(r => [key(r.symbol, r.catch_date), r]));
  const differences = [];
  let matched = 0;
  const fieldRecovery = { score: 0, volumeRatio: 0, obv: 0, obvTrend: 0 };
  const fieldMismatch = [];

  for (const [k, b] of baselineMap.entries()) {
    const r = recovered.get(k);
    if (!r) {
      differences.push({
        date: b.catch_date, symbol: b.symbol, oldResult: 'ACCUMULATION CONFIRMED', recoveredResult: 'NOT CONFIRMED / NOT PRESENT',
        reason: 'UNEXPLAINED: confirmed in the original report but not reproduced by the frozen engine on the replay dataset.',
        dataSource: 'data/market-history', dataQualityStatus: sessionStatusByDate[b.catch_date] || 'UNKNOWN',
        expected: false, causedByRepairedData: false, causedByMissingInput: false
      });
      continue;
    }
    matched += 1;
    if (r.score !== null) fieldRecovery.score += 1;
    if (r.volumeRatio !== null) fieldRecovery.volumeRatio += 1;
    if (r.obv !== null) fieldRecovery.obv += 1;
    if (r.obvTrend !== null) fieldRecovery.obvTrend += 1;
    const checks = [['delivery_pct', 'deliveryPct'], ['oi', 'futuresOi'], ['oi_change', 'changeOi']];
    for (const [oldName, newName] of checks) {
      const oldValue = b[oldName] === 'N/A' || b[oldName] === '' ? null : Number(b[oldName]);
      if (!near(oldValue, r[newName])) fieldMismatch.push({ date: b.catch_date, symbol: b.symbol, field: newName, old: oldValue, recovered: r[newName] });
    }
  }
  for (const [k, r] of recovered.entries()) {
    if (baselineMap.has(k)) continue;
    const after = r.tradeDate > BASELINE_LAST_VERDICT_DATE;
    differences.push({
      date: r.tradeDate, symbol: r.symbol, oldResult: 'NOT PRESENT (no usable original verdict)', recoveredResult: 'ACCUMULATION CONFIRMED',
      reason: after ? REPAIRED_RANGE_NOTE : 'UNEXPLAINED: dated inside the original report\'s verdict range but absent from it.',
      dataSource: 'data/market-history', dataQualityStatus: sessionStatusByDate[r.tradeDate] || 'UNKNOWN',
      expected: after, causedByRepairedData: after, causedByMissingInput: false
    });
  }
  differences.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return {
    baseline: { catchDays: baseline.length, events: new Set(baseline.map(r => `${r.symbol}|${r.event_index}`)).size, symbols: new Set(baseline.map(r => r.symbol)).size },
    recovered: { catchDays: recovered.size, symbols: new Set(recoveredRows.map(r => r.symbol)).size },
    matchedCatchDays: matched,
    onlyInBaseline: differences.filter(d => d.recoveredResult.startsWith('NOT')).length,
    onlyInRecovered: differences.filter(d => d.oldResult.startsWith('NOT')).length,
    unexpectedDifferences: differences.filter(d => !d.expected).length,
    fieldRecoveryOnMatched: fieldRecovery,
    fieldMismatchesOnMatched: fieldMismatch,
    differences
  };
}

function differencesToCsv(differences) {
  const cols = ['date', 'symbol', 'oldResult', 'recoveredResult', 'reason', 'dataSource', 'dataQualityStatus', 'expected', 'causedByRepairedData', 'causedByMissingInput'];
  const esc = v => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return `${[cols.join(','), ...differences.map(d => cols.map(c => esc(d[c])).join(','))].join('\n')}\n`;
}

module.exports = { BASELINE_LAST_VERDICT_DATE, buildCatchHistoryRows, compareToBaseline, differencesToCsv, toCsv, CSV_COLUMNS };
