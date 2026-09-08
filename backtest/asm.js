/*
 * VIKRAM Accumulation Success Matrix (ASM)
 *
 * Validation/research layer only. ASM does not generate signals, scores, or BUY calls.
 * It consumes an immutable VIKRAM event (T0/P0) and verified subsequent bars.
 * Missing future data remains unavailable; no interpolation is permitted.
 */

const DEFAULT_HORIZONS = Object.freeze([1, 5, 20, 60, 120]);

function finite(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

function pct(entry, exit) {
  if (!finite(entry) || !finite(exit) || Number(entry) === 0) return null;
  return ((Number(exit) / Number(entry)) - 1) * 100;
}

function sortBars(bars) {
  return (bars || [])
    .filter(Boolean)
    .map(b => ({ ...b, trade_date: String(b.trade_date || b.date || '').slice(0, 10) }))
    .filter(b => /^\d{4}-\d{2}-\d{2}$/.test(b.trade_date))
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function benchmarkReturn(benchmarkBars, startDate, endDate) {
  const rows = sortBars(benchmarkBars);
  const start = rows.find(r => r.trade_date === startDate);
  const end = rows.find(r => r.trade_date === endDate);
  return start && end ? pct(start.close, end.close) : null;
}

function outcomeForHorizon(bars, index, p0, horizon) {
  const exitIndex = index + horizon;
  if (exitIndex >= bars.length) {
    return {
      horizon,
      available: false,
      exitDate: null,
      exitPrice: null,
      forwardReturnPct: null,
      benchmarkReturnPct: null,
      benchmarkRelativeReturnPct: null,
      mfePct: null,
      maePct: null,
      maxDrawdownPct: null,
    };
  }

  const window = bars.slice(index + 1, exitIndex + 1);
  const exit = bars[exitIndex];
  const highs = window.map(b => Number(b.high)).filter(Number.isFinite);
  const lows = window.map(b => Number(b.low)).filter(Number.isFinite);
  const closes = window.map(b => Number(b.close)).filter(Number.isFinite);
  const mfePct = highs.length && finite(p0) ? Math.max(...highs.map(v => pct(p0, v))) : null;
  const maePct = lows.length && finite(p0) ? Math.min(...lows.map(v => pct(p0, v))) : null;

  let maxDrawdownPct = null;
  if (closes.length && finite(p0)) {
    let peak = Number(p0);
    let worst = 0;
    for (const close of closes) {
      peak = Math.max(peak, close);
      if (peak > 0) worst = Math.min(worst, ((close / peak) - 1) * 100);
    }
    maxDrawdownPct = worst;
  }

  return {
    horizon,
    available: true,
    exitDate: exit.trade_date,
    exitPrice: finite(exit.close) ? Number(exit.close) : null,
    forwardReturnPct: pct(p0, exit.close),
    benchmarkReturnPct: null,
    benchmarkRelativeReturnPct: null,
    mfePct,
    maePct,
    maxDrawdownPct,
  };
}

function buildAsmEvent(event, bars, options = {}) {
  if (!event || !event.symbol || !event.t0 || !finite(event.p0)) {
    throw new Error('ASM requires immutable symbol, t0 and p0');
  }

  const ordered = sortBars(bars);
  const index = ordered.findIndex(b => b.trade_date === String(event.t0).slice(0, 10));
  if (index < 0) {
    return {
      ...event,
      asmStatus: 'INSUFFICIENT HISTORY',
      outcomes: (options.horizons || DEFAULT_HORIZONS).map(h => ({ horizon: h, available: false })),
    };
  }

  const horizons = options.horizons || DEFAULT_HORIZONS;
  const outcomes = horizons.map(h => outcomeForHorizon(ordered, index, event.p0, h));

  if (options.benchmarkBars) {
    for (const outcome of outcomes) {
      if (!outcome.available) continue;
      outcome.benchmarkReturnPct = benchmarkReturn(
        options.benchmarkBars,
        event.t0,
        outcome.exitDate,
      );
      if (finite(outcome.forwardReturnPct) && finite(outcome.benchmarkReturnPct)) {
        outcome.benchmarkRelativeReturnPct = outcome.forwardReturnPct - outcome.benchmarkReturnPct;
      }
    }
  }

  return {
    symbol: String(event.symbol).toUpperCase(),
    t0: String(event.t0).slice(0, 10),
    p0: Number(event.p0),
    module: event.module || null,
    classification: event.classification || null,
    engineVersion: event.engineVersion || null,
    ruleVersion: event.ruleVersion || null,
    universeContext: event.universeContext || null,
    dataStatus: event.dataStatus || null,
    asmStatus: outcomes.some(o => o.available) ? 'CALCULATED' : 'INSUFFICIENT HISTORY',
    outcomes,
  };
}

function summarize(events) {
  const rows = (events || []).flatMap(e => (e.outcomes || []).map(o => ({ ...o, symbol: e.symbol, classification: e.classification })));
  const summary = {};
  for (const horizon of DEFAULT_HORIZONS) {
    const usable = rows.filter(r => r.horizon === horizon && r.available && finite(r.forwardReturnPct));
    const returns = usable.map(r => Number(r.forwardReturnPct));
    const wins = returns.filter(r => r > 0).length;
    summary[horizon] = {
      sampleSize: returns.length,
      hitRatePct: returns.length ? (wins / returns.length) * 100 : null,
      meanReturnPct: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
      medianReturnPct: returns.length ? returns.slice().sort((a, b) => a - b)[Math.floor(returns.length / 2)] : null,
    };
  }
  return summary;
}

module.exports = { DEFAULT_HORIZONS, buildAsmEvent, summarize, sortBars };
