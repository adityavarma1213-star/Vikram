// Chronological VIKRAM backtest: 1D / 5D / 20D / 60D / 120D forward returns.
//
// Design (look-ahead safety):
//   At each session i for a symbol, the engine only ever sees
//   history.slice(0, i+1) — never a future row. The forward return at
//   horizon H is computed ONLY if session i+H actually exists in that
//   symbol's REAL downloaded chronological series; if it doesn't (we've run
//   out of real future data), the horizon is recorded as
//   INSUFFICIENT_FUTURE_DATA rather than estimated or interpolated.
//
// AUDIT FOLLOW-UP (§6, §8): signal generation is now EVENT-based, not
// day-based. Every day's verdict is still computed (never skipped), but
// consecutive CONFIRMED days are grouped into one detection EVENT
// (lib/detectionEvents.js) with a first/latest detection date+price and a
// trading-session streak — mirroring the live scanner's New/Active
// semantics. The forward-return entry point for a backtest "trade" is the
// EVENT's first detection date+price, never a later day's price, and never
// re-entered on every subsequent day the same streak stays confirmed.
//
// AUDIT FOLLOW-UP (§5): each event is also checked against a same-symbol
// price-discontinuity heuristic (lib/corporateActions.js). This does NOT
// adjust any price — it only attaches an explicit caveat when a suspected
// split/bonus/merger discontinuity falls within the event's entry date or
// its forward-return measurement window, so a consumer of the results is
// warned rather than silently trusting an unadjusted number.

const fs = require('fs');
const path = require('path');
const { Manifest } = require('./lib/manifest');
const { requireRealBacktest } = require('./lib/productionGate');
const { buildDetectionEvents } = require('./lib/detectionEvents');
const { detectPriceDiscontinuities, assessCoverage } = require('./lib/corporateActions');
const { buildAsm } = require('./lib/asm');
const { buildResearchIntelligence } = require('./lib/researchIntelligence');
const { scanForStaleDuplicates } = require('./lib/staleDuplicateDetector');
const { isKnownHolidayDate, holidayInfo } = require('./lib/nseHolidayCalendar');
const engine = require('./lib/engineAdapter');

const ROOT = __dirname;
const NORMALIZED_DIR = path.join(ROOT, 'data', 'normalized');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json');
const HORIZONS = [1, 5, 20, 60, 120];

function loadNormalizedBySymbol() {
  const cmDir = path.join(NORMALIZED_DIR, 'cm');
  const foDir = path.join(NORMALIZED_DIR, 'fo');
  const bySymbol = new Map();
  const futuresBySymbolDate = new Map();

  // AUDIT FOLLOW-UP (Item 1 — see FORENSIC_INTEGRATION_REPORT.md / ITEM1_DATE_VERIFICATION_REPORT.md):
  // 13 dates in the existing dataset were found to be stale, carried-forward duplicates of the
  // immediately preceding trading day (all 13 independently confirmed as genuine NSE non-trading
  // days — see lib/nseHolidayCalendar.js for the cited evidence per date). A stored JSON file
  // existing for a date is NOT treated as proof it was a genuine trading session: every date is
  // re-checked here with the general-purpose automated stale-duplicate detector
  // (lib/staleDuplicateDetector.js), so a FUTURE undetected duplicate (including an ad-hoc
  // holiday like 2026-01-15's, announced too late for any static calendar) is still caught even
  // without a calendar entry. Matched dates are excluded from every symbol's trading-session
  // history below — the underlying files on disk are left untouched (never deleted).
  const excludedDates = new Set();
  const excludedDateDetail = [];
  if (fs.existsSync(cmDir)) {
    const cmFiles = fs.readdirSync(cmDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    const rowsByDate = {};
    for (const file of cmFiles) rowsByDate[file.slice(0, 10)] = JSON.parse(fs.readFileSync(path.join(cmDir, file), 'utf8'));
    // Exclusion is driven ONLY by the automated stale-duplicate detector — i.e. a date is excluded
    // because its data is provably a carried-forward copy, not merely because a date happens to
    // be *some kind* of special/reduced-session day. This intentionally leaves 2025-10-21 (Diwali
    // Laxmi Pujan Muhurat Trading — real, low-volume, but genuinely distinct data) IN the trading
    // calendar: nseHolidayCalendar.js documents it for context, but it was never itself flagged as
    // a duplicate, and this pipeline does not remove real, distinct data on a policy judgment call
    // that was outside what was asked. isKnownHolidayDate()/holidayInfo() are used only to
    // CLASSIFY an already-detected finding for the audit trail below — never as an independent
    // trigger for exclusion.
    for (const finding of scanForStaleDuplicates(rowsByDate)) {
      if (!finding.result.isStaleDuplicate) continue;
      excludedDates.add(finding.date);
      excludedDateDetail.push({
        date: finding.date,
        previousDate: finding.previousDate,
        matchRatio: finding.result.matchRatio,
        classification: isKnownHolidayDate(finding.date) ? 'NOT_A_TRADING_DAY' : 'DATA_INGESTION_ERROR_UNRESOLVED',
        evidence: holidayInfo(finding.date)
      });
    }

    for (const [date, rows] of Object.entries(rowsByDate)) {
      if (excludedDates.has(date)) continue; // not a genuine trading session — see note above
      for (const row of rows) {
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
        bySymbol.get(row.symbol).push(row);
      }
    }
  }
  if (fs.existsSync(foDir)) {
    for (const file of fs.readdirSync(foDir).filter(f => f.endsWith('.json'))) {
      const date = file.slice(0, 10);
      if (excludedDates.has(date)) continue; // same exclusion applies to F&O rows for that date
      const rows = JSON.parse(fs.readFileSync(path.join(foDir, file), 'utf8'));
      for (const row of rows) {
        const key = `${row.symbol}|${row.trade_date}`;
        const existing = futuresBySymbolDate.get(key);
        if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row);
      }
    }
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  return { bySymbol, futuresBySymbolDate, excludedDates: [...excludedDates].sort(), excludedDateDetail };
}

// Pure signal-detection core: no disk I/O, no gate check. Takes data and an
// engine directly so it can be unit-tested with synthetic fixtures without
// touching the real manifest/normalized directories, and reused by the
// disk-based runBacktest() below for the actual production run.
//
// corporateActionCoverage is the result of lib/corporateActions.js's
// assessCoverage() for this run — passed in (not computed here) so this
// function stays pure/testable; runBacktest() below supplies the real one.
function detectSignalsAndForwardReturns(bySymbol, futuresBySymbolDate, evalEngine, { warmup = 20, corporateActionCoverage = null } = {}) {
  const signals = [];

  for (const [symbol, history] of bySymbol.entries()) {
    // Step 1: compute the engine's verdict for EVERY day (never skipped),
    // using only a look-ahead-safe, past-only history slice for each one.
    const verdictStream = [];
    for (let i = warmup; i < history.length; i += 1) {
      const current = history[i];
      const pastHistory = history.slice(0, i + 1); // no look-ahead: only up to and including today
      const futures = futuresBySymbolDate.get(`${symbol}|${current.trade_date}`) || null;
      const result = evalEngine.evaluate({ symbol, history: pastHistory, current, futures });
      verdictStream.push({ date: current.trade_date, close: current.close, verdict: result.verdict, score: result.score, historyIndex: i });
    }

    // Step 2: group consecutive CONFIRMED days into detection events. The
    // event's OWN first detection date/price is the entry point for the
    // backtest "trade" — never a later day within the same streak.
    const events = buildDetectionEvents(symbol, verdictStream);
    const discontinuities = detectPriceDiscontinuities(history);
    const discontinuityDates = new Set(discontinuities.map(d => d.date));

    for (const event of events) {
      const entryIndex = verdictStream.find(v => v.date === event.firstDetectionDate).historyIndex;
      const entryClose = event.firstDetectionPrice;
      const forwardReturns = {};
      const caveatDates = new Set();
      if (discontinuityDates.has(event.firstDetectionDate)) caveatDates.add(event.firstDetectionDate);

      for (const h of HORIZONS) {
        const futureIndex = entryIndex + h;
        if (futureIndex < history.length && history[futureIndex].close !== null && entryClose) {
          // Flag (never adjust) if any day strictly between entry and exit,
          // inclusive of exit, is a suspected corporate-action discontinuity
          // — such a day would make the raw return unreliable either way.
          for (let k = entryIndex + 1; k <= futureIndex; k += 1) {
            if (discontinuityDates.has(history[k].trade_date)) caveatDates.add(history[k].trade_date);
          }
          forwardReturns[`${h}D`] = {
            status: 'COMPUTED',
            exitDate: history[futureIndex].trade_date,
            exitClose: history[futureIndex].close,
            returnPct: Math.round(((history[futureIndex].close / entryClose) - 1) * 10000) / 100,
            corporateActionCaveat: caveatDates.size > 0
              ? `SUSPECTED_CORPORATE_ACTION discontinuity on ${[...caveatDates].join(', ')} falls within this holding period — return may reflect a split/bonus/merger, not genuine performance. Coverage: ${corporateActionCoverage ? corporateActionCoverage.status : 'UNKNOWN'}.`
              : null
          };
        } else {
          forwardReturns[`${h}D`] = { status: 'INSUFFICIENT_FUTURE_DATA' };
        }
      }

      signals.push({
        symbol,
        eventIndex: event.eventIndex,
        signalDate: event.firstDetectionDate, // kept for backward compatibility with prior report consumers
        entryClose,
        firstDetectionDate: event.firstDetectionDate,
        firstDetectionPrice: event.firstDetectionPrice,
        latestDetectionDate: event.latestDetectionDate,
        latestDetectionPrice: event.latestDetectionPrice,
        tradingSessionStreak: event.tradingSessionStreak,
        eventStatus: event.status,
        forwardReturns
      });
    }
  }

  const horizonStats = {};
  for (const h of HORIZONS) {
    const computed = signals.map(s => s.forwardReturns[`${h}D`]).filter(r => r.status === 'COMPUTED');
    const computedWithCaveat = computed.filter(r => r.corporateActionCaveat);
    horizonStats[`${h}D`] = {
      signalCount: signals.length,
      computedCount: computed.length,
      insufficientFutureData: signals.length - computed.length,
      flaggedForCorporateActionCaveat: computedWithCaveat.length,
      winRatePct: computed.length ? Math.round((computed.filter(r => r.returnPct > 0).length / computed.length) * 10000) / 100 : null,
      avgReturnPct: computed.length ? Math.round((computed.reduce((a, r) => a + r.returnPct, 0) / computed.length) * 100) / 100 : null
    };
  }

  return { signals, horizonStats };
}

function runBacktest() {
  const manifest = new Manifest(MANIFEST_PATH);

  // GATE: refuses to proceed unless real NSE data with provenance is
  // present, the engine is the real non-synthetic production engine, AND
  // (new this pass) every SUCCESS+VALID manifest entry re-verifies against
  // the actual raw file on disk (SHA-256 recomputed, not trusted).
  const { summary } = requireRealBacktest(manifest.data, engine);

  // Corporate-action data source has NOT been reached from this sandbox
  // (same network wall as the rest of the pipeline) — this is computed
  // fresh each run, never assumed, and surfaced in the report rather than
  // silently defaulting to "available."
  const corporateActionCoverage = assessCoverage(null);

  const { bySymbol, futuresBySymbolDate, excludedDates, excludedDateDetail } = loadNormalizedBySymbol();
  const { signals, horizonStats } = detectSignalsAndForwardReturns(bySymbol, futuresBySymbolDate, engine, { corporateActionCoverage });

  // ASM (Accumulation Success Matrix): research/validation only — see lib/asm.js. No benchmark
  // series is wired in yet (none has been supplied), so every benchmark-relative field will
  // honestly read NOT_AVAILABLE rather than a guess. asm.js reads signal.signalDate/.entryClose,
  // both still present on the new event-based signal shape above.
  const asm = buildAsm(signals, bySymbol, null);

  // Canonical Research Intelligence (see lib/researchIntelligence.js): the per-symbol
  // historical-evidence rollup that Hidden Gems and Opportunity Radar join against.
  // Built from the SAME `asm` object above — no separate/duplicate calculation engine.
  const researchIntelligence = buildResearchIntelligence(asm);

  return {
    engine: { source_file: engine.source_file, source_sha256: engine.source_sha256, is_production_vikram: engine.is_production_vikram },
    manifestSummary: summary,
    corporateActionCoverage,
    // Item 1 audit trail (see ITEM1_DATE_VERIFICATION_REPORT.md): dates excluded from the trading
    // calendar as confirmed non-trading-day stale duplicates. The underlying files were not
    // deleted — only excluded from signal/forward-return computation above.
    excludedNonTradingDates: excludedDateDetail,
    totalSignals: signals.length,
    horizonStats,
    signals,
    asm,
    researchIntelligence
  };
}

module.exports = { runBacktest, detectSignalsAndForwardReturns, HORIZONS };

if (require.main === module) {
  try {
    const result = runBacktest();
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports', 'backtest_results.json'), JSON.stringify(result, null, 2));
    // Also publish the canonical research-intelligence artifact to data/ so the static
    // site and live server can join against it directly — no manual export/import step.
    const dataDir = path.join(ROOT, '..', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'researchIntelligence.json'), JSON.stringify({
      ...result.researchIntelligence,
      generatedAt: new Date().toISOString(),
      sourceFile: 'backtest/REAL_1YEAR_BACKTEST_RESULT.json',
      sourceDataProvenance: result.manifestSummary ? result.manifestSummary.data_provenance : null,
      sourceEngine: result.engine || null,
      sourceTotalSignals: result.totalSignals || 0
    }, null, 2));
    console.log(`BACKTEST COMPLETE: ${result.totalSignals} signal(s) across ${Object.keys(result.horizonStats).length} horizons.`);
    process.exit(0);
  } catch (error) {
    console.error('BACKTEST REFUSED / FAILED:', error.message);
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports', 'backtest_results.json'), JSON.stringify({ status: 'FAIL', reason: error.message, gateFailures: error.gateFailures || null }, null, 2));
    process.exit(1);
  }
}
