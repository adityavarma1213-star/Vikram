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

  if (fs.existsSync(cmDir)) {
    for (const file of fs.readdirSync(cmDir).filter(f => f.endsWith('.json'))) {
      const rows = JSON.parse(fs.readFileSync(path.join(cmDir, file), 'utf8'));
      for (const row of rows) {
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
        bySymbol.get(row.symbol).push(row);
      }
    }
  }
  if (fs.existsSync(foDir)) {
    for (const file of fs.readdirSync(foDir).filter(f => f.endsWith('.json'))) {
      const rows = JSON.parse(fs.readFileSync(path.join(foDir, file), 'utf8'));
      for (const row of rows) {
        const key = `${row.symbol}|${row.trade_date}`;
        const existing = futuresBySymbolDate.get(key);
        if (!existing || String(row.expiry) < String(existing.expiry)) futuresBySymbolDate.set(key, row);
      }
    }
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  return { bySymbol, futuresBySymbolDate };
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

  const { bySymbol, futuresBySymbolDate } = loadNormalizedBySymbol();
  const { signals, horizonStats } = detectSignalsAndForwardReturns(bySymbol, futuresBySymbolDate, engine, { corporateActionCoverage });

  // ASM (Accumulation Success Matrix): research/validation only — see lib/asm.js. No benchmark
  // series is wired in yet (none has been supplied), so every benchmark-relative field will
  // honestly read NOT_AVAILABLE rather than a guess. asm.js reads signal.signalDate/.entryClose,
  // both still present on the new event-based signal shape above.
  const asm = buildAsm(signals, bySymbol, null);

  return {
    engine: { source_file: engine.source_file, source_sha256: engine.source_sha256, is_production_vikram: engine.is_production_vikram },
    manifestSummary: summary,
    corporateActionCoverage,
    totalSignals: signals.length,
    horizonStats,
    signals,
    asm
  };
}

module.exports = { runBacktest, detectSignalsAndForwardReturns, HORIZONS };

if (require.main === module) {
  try {
    const result = runBacktest();
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports', 'backtest_results.json'), JSON.stringify(result, null, 2));
    console.log(`BACKTEST COMPLETE: ${result.totalSignals} signal(s) across ${Object.keys(result.horizonStats).length} horizons.`);
    process.exit(0);
  } catch (error) {
    console.error('BACKTEST REFUSED / FAILED:', error.message);
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports', 'backtest_results.json'), JSON.stringify({ status: 'FAIL', reason: error.message, gateFailures: error.gateFailures || null }, null, 2));
    process.exit(1);
  }
}
