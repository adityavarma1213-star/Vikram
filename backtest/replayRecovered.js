'use strict';
// Controlled historical replay of the UNCHANGED frozen V15 engine over data/market-history.
//
//   node backtest/replayRecovered.js [--from 2025-09-02] [--to 2026-09-28] [--out backtest/recovered]
//                                    [--scanner <scanner.json> ...]
//
// Guarantees:
//   * Refuses to run unless the four frozen V15 files match docs/recovery/frozen-hashes.json.
//   * Writes ONLY new RECOVERED_V15_* files. Never touches REAL_1YEAR_BACKTEST_RESULT.json, the
//     original report, backtest/data/normalized, data/market-history or data/raw-archive.
//   * Every session is classified explicitly; unknown / insufficient is never converted to zero.
//   * Point-in-time: decisions use history up to and including the decision date (the unchanged
//     detectSignalsAndForwardReturns slice); forward prices are used only for outcome fields.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const { detectSignalsAndForwardReturns } = require('./backtestRunner');
const engine = require('./lib/engineAdapter');
const { assessCoverage } = require('./lib/corporateActions');
const { loadMarketHistoryDataset } = require('./lib/recoveredDataset');
const { computeOutcome, summarizeAll } = require('./lib/catchOutcome');
const { buildCatchHistoryRows, compareToBaseline, differencesToCsv, toCsv } = require('./lib/recoveredReport');
const { buildCatchFrequency } = require('../server/src/catchFrequency');

const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function verifyFrozen() {
  const expected = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/recovery/frozen-hashes.json'), 'utf8'));
  const actual = {};
  for (const [file, hash] of Object.entries(expected)) {
    if (file.startsWith('_')) continue;
    actual[file] = sha256File(path.join(REPO, file));
    if (actual[file] !== hash) throw new Error(`FROZEN V15 FILE CHANGED: ${file} expected ${hash} got ${actual[file]}. Refusing to replay.`);
  }
  return actual;
}

function parseArgs(argv) {
  const o = { from: '2025-09-02', to: '2026-09-28', out: path.join(REPO, 'backtest', 'recovered'), scanners: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--from') o.from = argv[++i];
    else if (argv[i] === '--to') o.to = argv[++i];
    else if (argv[i] === '--out') o.out = path.resolve(argv[++i]);
    else if (argv[i] === '--scanner') o.scanners.push(path.resolve(argv[++i]));
  }
  return o;
}

// Original-report status of a session, from the forensic audit (labelled as such in the output).
function originalStatus(date) {
  if (date >= '2025-09-30' && date <= '2026-09-03') return 'RECORDED_VERDICTS';
  if (['2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-15'].includes(date)) return 'DATA_INSUFFICIENT (delivery zero-filled in original input)';
  if (date > '2026-09-03') return 'MISSING (no verdicts stored by the original run)';
  return 'WARMUP (no verdicts by design)';
}

function buildSessionStatus(dataset, dailyStats) {
  const stats = new Map(dailyStats.map(d => [d.date, d]));
  const foDates = new Set(dataset.foDates);
  return dataset.sessions.map(date => {
    const ex = dataset.excluded[date];
    const base = { date, originalReportStatus: originalStatus(date) };
    if (ex) {
      const stale = ex.reason.startsWith('STALE');
      return { ...base, status: stale ? 'NOT_RUN' : 'DATA_INSUFFICIENT', reason: stale ? 'NON_TRADING_DAY_STALE_DUPLICATE_EXCLUDED' : ex.reason, evidence: 'REPLAY_DATASET', scanned: null, starting: null, confirmed: null, confirmedSymbols: [] };
    }
    const d = stats.get(date);
    if (!d) return { ...base, status: 'DATA_INSUFFICIENT', reason: 'WARMUP_20_SESSIONS (no symbol has enough history for a V15 verdict)', evidence: 'REPLAY_DATASET', scanned: null, starting: null, confirmed: null, confirmedSymbols: [] };
    if (!foDates.has(date)) return { ...base, status: 'PARTIAL_SCAN', reason: 'NO_FO_DATA_FOR_DATE', evidence: 'REPLAY_FROZEN_ENGINE', scanned: d.scanned, starting: d.starting, confirmed: d.confirmed, confirmedSymbols: d.confirmedSymbols };
    return {
      ...base, status: d.confirmed > 0 ? 'VERIFIED_CONFIRMATIONS' : 'VERIFIED_ZERO_CONFIRMATIONS', reason: 'Frozen V15 evaluated on delivery-valid CM + exact-date F&O data',
      evidence: 'REPLAY_FROZEN_ENGINE', scanned: d.scanned, starting: d.starting, confirmed: d.confirmed, confirmedSymbols: d.confirmedSymbols,
      exactDateOiSymbols: d.oiExactDate, deliveryMissing: d.deliveryMissing
    };
  });
}

// Compare the replay against stored scanner.json evidence for the same date.
function crossCheckScanner(scannerPath, dataset, dailyStats) {
  const scanner = JSON.parse(fs.readFileSync(scannerPath, 'utf8'));
  const date = scanner.asOf;
  const replay = dailyStats.find(d => d.date === date);
  if (!replay) return { scanner: path.basename(scannerPath), date, status: 'NO_REPLAY_STATS_FOR_DATE' };
  // The replay (like the original backtest) only evaluates symbols with >= 21 rows of history;
  // the live scanner also evaluates shorter histories. Compare on the common symbol set.
  const eligible = new Set([...dataset.bySymbol.entries()].filter(([, rows]) => rows.filter(r => r.trade_date <= date).length >= 21).map(([s]) => s));
  const sc = scanner.results.filter(r => eligible.has(r.symbol));
  const scStarting = new Set(sc.filter(r => r.verdict === 'ACCUMULATION STARTING').map(r => r.symbol));
  const scConfirmed = new Set(sc.filter(r => r.verdict === 'ACCUMULATION CONFIRMED').map(r => r.symbol));
  const rpStarting = new Set(replay.startingSymbols); const rpConfirmed = new Set(replay.confirmedSymbols);
  const diff = (a, b) => [...a].filter(x => !b.has(x));
  return {
    scanner: path.basename(scannerPath), date, scannerGeneratedAt: scanner.generatedAt,
    scannerTotals: { scanned: scanner.results.length, starting: scanner.results.filter(r => r.verdict === 'ACCUMULATION STARTING').length, confirmed: scanner.results.filter(r => r.verdict === 'ACCUMULATION CONFIRMED').length },
    commonUniverse: { symbols: sc.length, scannerStarting: scStarting.size, replayStarting: rpStarting.size, scannerConfirmed: scConfirmed.size, replayConfirmed: rpConfirmed.size },
    startingOnlyInScanner: diff(scStarting, rpStarting).slice(0, 20), startingOnlyInReplay: diff(rpStarting, scStarting).slice(0, 20),
    confirmedOnlyInScanner: diff(scConfirmed, rpConfirmed), confirmedOnlyInReplay: diff(rpConfirmed, scConfirmed),
    agrees: scStarting.size === rpStarting.size && diff(scStarting, rpStarting).length === 0 && diff(rpStarting, scStarting).length === 0 && scConfirmed.size === rpConfirmed.size && diff(scConfirmed, rpConfirmed).length === 0
  };
}

function runReplay(opts) {
  const frozen = verifyFrozen();
  if (engine.source_sha256 !== frozen['accumulation/engine.js']) throw new Error('engine adapter hash differs from frozen hash');
  const configSha256 = frozen['accumulation/config.js'];
  const dataset = loadMarketHistoryDataset({ historyDir: path.join(REPO, 'data', 'market-history'), from: opts.from, to: opts.to });
  const provenance = { engineSha256: frozen['accumulation/engine.js'], configSha256, datasetVersion: dataset.datasetVersion };

  const { signals, horizonStats, dailyStats } = detectSignalsAndForwardReturns(dataset.bySymbol, dataset.futuresBySymbolDate, engine, {
    warmup: 20, corporateActionCoverage: assessCoverage(null), collectDailyStats: true
  });

  // Catch -> Outcome (outcome data only; computed after the fact from the same real series).
  const outcomes = signals.map(s => {
    const history = dataset.bySymbol.get(s.symbol);
    const entryIndex = history.findIndex(r => r.trade_date === s.firstDetectionDate);
    return { signal: s, outcome: computeOutcome(history, entryIndex, s.entryClose) };
  });

  const sessionStatus = buildSessionStatus(dataset, dailyStats);
  const sessionStatusByDate = Object.fromEntries(sessionStatus.map(s => [s.date, s.status]));
  const crossChecks = opts.scanners.map(p => crossCheckScanner(p, dataset, dailyStats));
  for (const c of crossChecks) { const s = sessionStatus.find(x => x.date === c.date); if (s) s.scannerSnapshotCrossCheck = { scanner: c.scanner, agrees: c.agrees }; }

  const catchRows = buildCatchHistoryRows(signals, provenance);
  const baselineCsv = fs.readFileSync(path.join(REPO, 'docs/recovery/baseline/v15_confirmed_catches_full.csv'), 'utf8');
  const comparison = compareToBaseline(baselineCsv, catchRows, { sessionStatusByDate });

  // Performance: ORIGINAL (read from the untouched original result) vs RECOVERED.
  const original = JSON.parse(fs.readFileSync(path.join(REPO, 'backtest', 'REAL_1YEAR_BACKTEST_RESULT.json'), 'utf8'));
  const recoveredAll = summarizeAll(outcomes.map(o => o.outcome));
  const upToBaseline = outcomes.filter(o => o.signal.firstDetectionDate <= '2026-09-03');
  const recoveredBaselinePeriod = summarizeAll(upToBaseline.map(o => o.outcome));
  // Like-for-like reconciliation: the original run's price data ended earlier than the recovered dataset, so its
  // long horizons had fewer computable exits. Cap each exit at the latest exit date the ORIGINAL run used.
  const originalLastExit = (original.signals || []).flatMap(sig => Object.values(sig.forwardReturns || {})).filter(f => f.status === 'COMPUTED').map(f => f.exitDate).sort().pop() || null;
  const capped = originalLastExit ? upToBaseline.map(o => ({ horizons: Object.fromEntries(Object.entries(o.outcome.horizons).map(([k, c]) => [k, c.status === 'COMPUTED' && c.exitDate > originalLastExit ? { status: 'INSUFFICIENT_FUTURE_DATA' } : c])) })) : [];
  const performance = {
    note: 'ORIGINAL REPORT is shown untouched; RECOVERED REPLAY is separate. Win = return > 0; winRate = wins / computed. MFE/MAE/drawdown are close-to-close (no intraday high/low in the stored data).',
    originalReport: { source: 'backtest/REAL_1YEAR_BACKTEST_RESULT.json (unchanged)', totalSignals: original.totalSignals, horizonStats: original.horizonStats },
    recoveredReplayAllSignals: { signals: outcomes.length, byHorizon: recoveredAll },
    recoveredReplayFirstDetectionOnOrBefore_2026_09_03: { signals: upToBaseline.length, byHorizon: recoveredBaselinePeriod },
    recoveredReplayLikeForLike_exitCappedToOriginalDataEnd: { note: 'Same 769 first detections, exits capped at the last exit date the original run could use. Isolates the effect of the longer price history.', originalLastExitDate: originalLastExit, signals: capped.length, byHorizon: capped.length ? summarizeAll(capped) : null }
  };

  const frequency = buildCatchFrequency(sessionStatus.map(s => ({ date: s.date, status: s.status, scanned: s.scanned, starting: s.starting, confirmed: s.confirmed, confirmedSymbols: s.confirmedSymbols })));

  // Telemetry audit: how many catch-days carry each decision-time field.
  const fields = ['score', 'volumeRatio', 'obv', 'obvTrend', 'deliveryPct', 'futuresOi', 'changeOi', 'priceChangePct'];
  const telemetryAudit = {
    catchDays: catchRows.length,
    fieldPresence: Object.fromEntries(fields.map(f => [f, { numeric: catchRows.filter(r => r[f] !== null).length, missing: catchRows.filter(r => r[f] === null).length }])),
    gateFailuresPresent: catchRows.filter(r => Array.isArray(r.gateFailures)).length,
    gateFailuresOnConfirmedAllEmpty: catchRows.every(r => Array.isArray(r.gateFailures) && r.gateFailures.length === 0),
    componentsPresent: catchRows.filter(r => Array.isArray(r.components) && r.components.length).length,
    confirmedGateInvariants: {
      scoreAtLeast75: catchRows.every(r => r.score >= 75), volumeRatioAtLeast1_2: catchRows.every(r => r.volumeRatio >= 1.2),
      deliveryAtLeast45: catchRows.every(r => r.deliveryPct >= 45), obvTrendPositive: catchRows.every(r => r.obvTrend > 0),
      changeOiPositive: catchRows.every(r => r.changeOi > 0), exactDateOi: catchRows.every(r => r.oiExactDate === true),
      priceChangeAbove0_25: catchRows.every(r => r.priceChangePct > 0.25), historyAtLeast10: catchRows.every(r => r.historyLength >= 10)
    },
    fieldRecoveryOnBaselineMatchedRows: comparison.fieldRecoveryOnMatched,
    fieldMismatchesVsBaseline: comparison.fieldMismatchesOnMatched.length,
    note: 'Original report: score, volume_ratio and obv were N/A on 852/852 rows. Values above are the frozen engine\'s own decision-time outputs, replayed on the identical stored data.'
  };

  const result = {
    kind: 'RECOVERED_V15_HISTORICAL_RESULT',
    generatedAt: new Date().toISOString(),
    replayPeriod: { from: opts.from, to: opts.to }, provenance,
    frozenHashes: frozen, dataset: { source: dataset.source, version: dataset.datasetVersion, sessions: dataset.sessions.length, usableSessions: dataset.usableSessions.length, excluded: dataset.excluded, fileHashes: dataset.fileHashes },
    corporateActionCoverage: assessCoverage(null), corporateActionStatus: 'UNKNOWN',
    totals: { catchDays: catchRows.length, events: signals.length, symbols: new Set(signals.map(s => s.symbol)).size },
    horizonStats, sessionStatusSummary: sessionStatus.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {}),
    scannerCrossChecks: crossChecks,
    signals: signals.map(s => ({ ...s, outcome: outcomes.find(o => o.signal === s).outcome }))
  };

  fs.mkdirSync(opts.out, { recursive: true });
  const w = (name, content) => fs.writeFileSync(path.join(opts.out, name), typeof content === 'string' ? content : `${JSON.stringify(content, null, 1)}\n`);
  w('RECOVERED_V15_HISTORICAL_RESULT.json', result);
  w('RECOVERED_V15_CATCH_HISTORY.csv', toCsv(catchRows));
  w('RECOVERED_V15_SESSION_STATUS.json', sessionStatus);
  w('RECOVERED_V15_BASELINE_COMPARISON.json', { ...comparison, differences: undefined, differenceCount: comparison.differences.length });
  w('RECOVERED_V15_BASELINE_DIFFERENCES.csv', differencesToCsv(comparison.differences));
  w('RECOVERED_V15_PERFORMANCE.json', performance);
  w('RECOVERED_V15_CATCH_FREQUENCY.json', frequency);
  w('RECOVERED_V15_TELEMETRY_AUDIT.json', telemetryAudit);
  const outcomeRows = outcomes.map(({ signal: s, outcome: o }) => {
    const r = { symbol: s.symbol, eventIndex: s.eventIndex, firstDetectionDate: s.firstDetectionDate, streak: s.tradingSessionStreak, referencePrice: o.referencePrice };
    for (const h of ['1D', '5D', '20D', '60D', '120D']) { const c = o.horizons[h]; r[`T+${h.replace('D', '')}_returnPct`] = c.status === 'COMPUTED' ? c.returnPct : 'N/A'; r[`T+${h.replace('D', '')}_mfePct`] = c.status === 'COMPUTED' ? c.mfePct : 'N/A'; r[`T+${h.replace('D', '')}_maePct`] = c.status === 'COMPUTED' ? c.maePct : 'N/A'; }
    r.latestVerifiedPrice = o.latestVerifiedPrice; r.latestVerifiedPriceDate = o.latestVerifiedPriceDate; r.latestChangePct = o.latestChangePct;
    r.corporateActionStatus = 'UNKNOWN'; r.corporateActionCaveat = Object.values(s.forwardReturns).map(f => f.corporateActionCaveat).filter(Boolean)[0] ? 'SUSPECTED_DISCONTINUITY_IN_WINDOW' : 'NONE_FLAGGED_BY_HEURISTIC';
    return r;
  });
  const oc = Object.keys(outcomeRows[0] || {});
  w('RECOVERED_V15_CATCH_OUTCOME.csv', `${[oc.join(','), ...outcomeRows.map(r => oc.map(c => String(r[c])).join(','))].join('\n')}\n`);
  return { result, sessionStatus, comparison, performance, telemetryAudit, frequency, crossChecks, out: opts.out };
}

if (require.main === module) {
  try {
    const out = runReplay(parseArgs(process.argv.slice(2)));
    console.log(`REPLAY COMPLETE: ${out.result.totals.catchDays} catch-days / ${out.result.totals.events} events / ${out.result.totals.symbols} symbols -> ${path.relative(REPO, out.out)}`);
    console.log('session status summary:', JSON.stringify(out.result.sessionStatusSummary));
    console.log(`baseline: matched ${out.comparison.matchedCatchDays}, only-in-baseline ${out.comparison.onlyInBaseline}, only-in-recovered ${out.comparison.onlyInRecovered}, unexpected ${out.comparison.unexpectedDifferences}`);
    for (const c of out.crossChecks) console.log('scanner cross-check', JSON.stringify(c));
  } catch (error) {
    console.error('REPLAY REFUSED / FAILED:', error.message);
    process.exit(1);
  }
}

module.exports = { runReplay, verifyFrozen, buildSessionStatus, crossCheckScanner };
