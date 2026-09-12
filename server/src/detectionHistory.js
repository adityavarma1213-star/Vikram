'use strict';
// Canonical Days-in-Accumulation ("detection history") calculator.
//
// This is intentionally the ONLY implementation of this logic in the repository.
// Both server/src/staticSnapshot.js (GitHub Pages / static JSON deployment) and
// server/src/ingest.js (live Render / Postgres deployment) call this same function
// so the two deployment paths cannot silently drift out of feature parity again.
//
// Method: for every symbol whose latest verdict is ACCUMULATION CONFIRMED, walk
// backward one verified EOD row at a time, re-running the canonical accumulation
// engine on the trailing history available as of that day, until the verdict stops
// being ACCUMULATION CONFIRMED. This requires no new historical data collection --
// it is computed entirely from EOD rows the pipeline already stores.
function buildDetectionMap(bySymbol, futuresBySymbolDate, derivativesSymbols, currentResults, evaluate) {
  const out = new Map();
  for (const result of currentResults || []) {
    if (result.verdict !== 'ACCUMULATION CONFIRMED') continue;
    const symbol = String(result.symbol || '').toUpperCase();
    const rows = bySymbol.get(symbol) || [];
    if (!rows.length) continue;
    const latestDate = String(result.tradeDate || rows[rows.length - 1].trade_date);
    const latestIndex = rows.findIndex(r => String(r.trade_date) === latestDate);
    if (latestIndex < 0) continue;

    const latestRow = rows[latestIndex];
    const latestDetectedPrice = num(latestRow.close ?? latestRow.last_price);

    let detectedTradingDays = 0;
    let firstDetectedDate = null;
    let firstDetectedPrice = null;
    for (let i = latestIndex; i >= 0; i -= 1) {
      const current = rows[i];
      const history = rows.slice(0, i + 1);
      const key = `${symbol}|${current.trade_date}`;
      const exact = futuresBySymbolDate.get(key);
      const futureState = exact || { available: false, derivativesSupported: derivativesSymbols.has(symbol), trade_date: current.trade_date };
      const evaluated = evaluate({ symbol, history, current, futures: futureState });
      if (evaluated.verdict !== 'ACCUMULATION CONFIRMED') break;
      detectedTradingDays += 1;
      firstDetectedDate = current.trade_date;
      firstDetectedPrice = num(current.close ?? current.last_price);
    }
    if (detectedTradingDays) {
      out.set(symbol, {
        firstDetectedDate,
        firstDetectedPrice,
        latestDetectedDate: latestDate,
        latestDetectedPrice,
        detectedTradingDays,
        detectionStatus: detectedTradingDays === 1 ? 'New' : 'Active'
      });
    }
  }
  return out;
}
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
module.exports = { buildDetectionMap };
