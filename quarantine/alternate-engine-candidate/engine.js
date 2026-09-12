/*
 * VIKRAM Accumulation Engine
 * No synthetic market values. Missing inputs remain N/A and cannot earn points.
 *
 * Important: the score is an evidence score, not the verdict by itself.
 * ACCUMULATION CONFIRMED also requires every hard confirmation gate below.
 */
(function (root) {
  const CFG = root.ACCUMULATION_CONFIG || (typeof require === 'function' ? require('./config') : null);
  const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const num = v => finite(v) ? Number(v) : null;
  const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const pct = (a, b) => finite(a) && finite(b) && Number(b) !== 0 ? ((Number(a) / Number(b)) - 1) * 100 : null;
  const dateKey = value => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value);
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  };

  function sortRows(rows) {
    return (rows || []).filter(Boolean).map(r => ({ ...r, trade_date: dateKey(r.trade_date || r.date) }))
      .filter(r => r.trade_date).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }

  function calculateObv(rows) {
    let obv = 0;
    return sortRows(rows).map((r, i, all) => {
      const close = num(r.close ?? r.last_price);
      const prev = num(i ? (all[i - 1].close ?? all[i - 1].last_price) : r.prev_close);
      const volume = num(r.volume) || 0;
      if (close !== null && prev !== null) {
        if (close > prev) obv += volume;
        else if (close < prev) obv -= volume;
      }
      return { ...r, obv };
    });
  }

  function scoreComponent(value, max) {
    return Math.max(0, Math.min(max, value));
  }

  // Secondary confirmation/divergence indicator only. Never scored, never gated.
  // Requires genuine High/Low; rows missing either are skipped (not zero-filled),
  // and adCoverage reports what fraction of the lookback window was actually usable
  // so a caller can see when the signal is too thin to trust.
  function buildAd(rows, lookback) {
    const sorted = sortRows(rows);
    let line = 0;
    let covered = 0;
    const series = [];
    for (const r of sorted) {
      const high = num(r.high);
      const low = num(r.low);
      const close = num(r.close ?? r.last_price);
      const volume = num(r.volume);
      if (high !== null && low !== null && close !== null && volume !== null && high !== low) {
        const moneyFlowMultiplier = ((close - low) - (high - close)) / (high - low);
        line += moneyFlowMultiplier * volume;
        covered += 1;
      }
      series.push({ trade_date: r.trade_date, adLine: line });
    }
    if (!series.length) return { adLine: null, adTrend: null, adCoverage: 0, divergence: 'UNAVAILABLE' };
    const windowSeries = series.slice(-(lookback + 1));
    const adLine = series[series.length - 1].adLine;
    const adStart = windowSeries.length > 1 ? windowSeries[0].adLine : null;
    const adTrend = finite(adLine) && finite(adStart) ? adLine - adStart : null;
    const coverage = Math.min(1, covered / Math.min(sorted.length, lookback + 1 || 1));

    const closesWindow = sorted.slice(-(lookback + 1)).map(r => num(r.close ?? r.last_price)).filter(finite);
    const priceTrend = closesWindow.length > 1 ? closesWindow[closesWindow.length - 1] - closesWindow[0] : null;

    let divergence = 'INSUFFICIENT_DATA';
    if (coverage >= CFG.adMinCoverage && adTrend !== null && priceTrend !== null) {
      if (priceTrend > 0 && adTrend < 0) divergence = 'BEARISH_DIVERGENCE';
      else if (priceTrend < 0 && adTrend > 0) divergence = 'BULLISH_DIVERGENCE';
      else divergence = 'CONFIRMING';
    }
    return { adLine: Math.round(adLine), adTrend: finite(adTrend) ? Math.round(adTrend) : null, adCoverage: Math.round(coverage * 100) / 100, divergence };
  }

  // Heuristic-only. Cannot confirm a corporate action actually occurred (no corporate
  // actions calendar is wired in); it can only flag rows whose single-day price move
  // is implausible for ordinary trading so they route to DATA N/A instead of being
  // silently scored as genuine accumulation or distribution.
  function checkCorporateActionRisk(close, prevClose) {
    if (!finite(close) || !finite(prevClose) || prevClose === 0) return null;
    const guard = CFG.corporateActionGuard;
    const changePct = Math.abs(((close / prevClose) - 1) * 100);
    if (changePct >= guard.maxPlausiblePriceMovePct) {
      const ratio = close / prevClose;
      const matchedRatio = guard.commonAdjustmentRatios.find(r => Math.abs(ratio - r) <= guard.ratioTolerance || Math.abs((1 / ratio) - (1 / r)) <= guard.ratioTolerance);
      return { flagged: true, changePct: Math.round(changePct * 100) / 100, matchedRatio: matchedRatio ?? null };
    }
    return null;
  }

  function evaluate(input) {
    const history = sortRows(input.history);
    const current = { ...(input.current || history[history.length - 1] || {}) };
    current.trade_date = dateKey(current.trade_date || current.date);
    const f = input.futures || null;
    const previousRows = history.filter(r => r.trade_date !== current.trade_date);
    const volumeHistory = previousRows.slice(-CFG.historyDays).map(r => num(r.volume)).filter(finite);
    const avgVolume = avg(volumeHistory);
    const currentVolume = num(current.volume);
    const volumeRatio = currentVolume !== null && avgVolume ? currentVolume / avgVolume : null;
    const close = num(current.close ?? current.last_price);
    const prevClose = num(current.prev_close);
    const priceChangePct = pct(close, prevClose);
    const deliveryPct = num(current.deliv_per ?? current.delivery_pct);
    const deliveryQty = num(current.deliv_qty ?? current.delivery_qty);
    const deliveryHistory = history.slice(-CFG.deliveryTrendLookback).map(r => num(r.deliv_per ?? r.delivery_pct)).filter(finite);
    const priorDeliveryAvg = deliveryHistory.length > 1 ? avg(deliveryHistory.slice(0, -1)) : null;
    const deliveryTrend = deliveryPct !== null && priorDeliveryAvg !== null ? deliveryPct - priorDeliveryAvg : null;

    const obvRows = calculateObv(history);
    const obvCurrent = obvRows.length ? obvRows[obvRows.length - 1].obv : null;
    const obvStart = obvRows.length > CFG.obvLookback ? obvRows[obvRows.length - 1 - CFG.obvLookback].obv : null;
    const obvTrend = finite(obvCurrent) && finite(obvStart) ? obvCurrent - obvStart : null;

    const futuresDate = f && (f.trade_date || f.date);
    const oiExactDate = !!f && dateKey(futuresDate) === current.trade_date;
    const oi = oiExactDate ? num(f.oi ?? f.open_interest) : null;
    const changeOi = oiExactDate ? num(f.change_oi ?? f.change_in_oi) : null;
    const oiPct = oi !== null && finite(changeOi) && oi !== 0 ? (changeOi / Math.abs(oi - changeOi || oi)) * 100 : null;
    const oiConfirmed = oi !== null && changeOi !== null;

    // Price/OI quadrant. "OI rising" alone is not accumulation-positive -- it must be
    // read together with price direction (long buildup / short buildup / short covering
    // / long unwinding). Only a genuine long buildup (price up + OI up) scores as
    // bullish; price down + OI up (short buildup) is bearish/neutral, not accumulation.
    const priceUp = priceChangePct !== null && priceChangePct > CFG.flatPricePct;
    const priceDown = priceChangePct !== null && priceChangePct < -CFG.flatPricePct;
    let oiQuadrant = null;
    if (oiConfirmed) {
      const oiUp = changeOi > 0, oiDown = changeOi < 0;
      if (priceUp && oiUp) oiQuadrant = 'LONG_BUILDUP';
      else if (priceDown && oiUp) oiQuadrant = 'SHORT_BUILDUP';
      else if (priceUp && oiDown) oiQuadrant = 'SHORT_COVERING';
      else if (priceDown && oiDown) oiQuadrant = 'LONG_UNWINDING';
      else if (oiUp) oiQuadrant = 'FLAT_PRICE_OI_UP';
      else if (oiDown) oiQuadrant = 'FLAT_PRICE_OI_DOWN';
      else oiQuadrant = 'OI_FLAT';
    }

    const corporateActionRisk = checkCorporateActionRisk(close, prevClose);
    const ad = buildAd(history, CFG.adLookback);

    let score = 0;
    let availableWeight = 0;
    const why = [];
    const components = [];

    function add(name, weight, points, detail) {
      if (points === null) return;
      score += points;
      availableWeight += weight;
      components.push({ name, weight, points: Math.round(points * 100) / 100, detail });
      if (detail) why.push(detail);
    }

    if (priceChangePct !== null) {
      const points = priceChangePct > CFG.flatPricePct ? CFG.weights.price : priceChangePct >= -CFG.flatPricePct ? CFG.weights.price * 0.65 : CFG.weights.price * 0.15;
      add('Price action', CFG.weights.price, scoreComponent(points, CFG.weights.price), priceChangePct > CFG.flatPricePct ? 'Price is firm/positive.' : priceChangePct >= -CFG.flatPricePct ? 'Price is broadly flat.' : 'Price is falling; accumulation is not yet confirmed.');
    }
    if (volumeRatio !== null) {
      const points = volumeRatio >= CFG.volumeRatio.strong ? CFG.weights.volume : volumeRatio >= CFG.volumeRatio.elevated ? CFG.weights.volume * 0.7 : volumeRatio >= 0.8 ? CFG.weights.volume * 0.35 : 0;
      add('Volume', CFG.weights.volume, points, volumeRatio >= CFG.volumeRatio.strong ? `Volume is ${volumeRatio.toFixed(2)}x the prior ${CFG.historyDays}-day average.` : `Volume ratio is ${volumeRatio.toFixed(2)}x.`);
    }
    if (deliveryPct !== null) {
      let points = deliveryPct >= CFG.deliveryPct.strong ? CFG.weights.delivery : deliveryPct >= CFG.deliveryPct.positive ? CFG.weights.delivery * 0.7 : CFG.weights.delivery * 0.25;
      if (deliveryTrend !== null && deliveryTrend > 0) points += CFG.weights.delivery * 0.15;
      add('Delivery', CFG.weights.delivery, Math.min(CFG.weights.delivery, points), deliveryTrend !== null && deliveryTrend > 0 ? `Delivery is ${deliveryPct.toFixed(1)}% and trending higher.` : `Delivery is ${deliveryPct.toFixed(1)}%.`);
    }
    if (obvTrend !== null) {
      add('OBV', CFG.weights.obv, obvTrend > 0 ? CFG.weights.obv : obvTrend === 0 ? CFG.weights.obv * 0.5 : 0, obvTrend > 0 ? 'OBV is rising over the lookback.' : obvTrend === 0 ? 'OBV is flat.' : 'OBV is falling.');
    }
    if (oiConfirmed) {
      const quadrantPoints = {
        LONG_BUILDUP: CFG.weights.futuresOi,
        SHORT_BUILDUP: 0,
        SHORT_COVERING: CFG.weights.futuresOi * 0.4,
        LONG_UNWINDING: 0,
        FLAT_PRICE_OI_UP: CFG.weights.futuresOi * 0.85,
        FLAT_PRICE_OI_DOWN: CFG.weights.futuresOi * 0.3,
        OI_FLAT: CFG.weights.futuresOi * 0.4
      };
      const quadrantWhy = {
        LONG_BUILDUP: `Long buildup: price up and futures OI up (${changeOi > 0 ? '+' : ''}${changeOi}) on the exact trading date.`,
        SHORT_BUILDUP: `Short buildup: price down while futures OI rose (+${changeOi}); this is bearish, not accumulation.`,
        SHORT_COVERING: `Short covering: price up while futures OI fell (${changeOi}); positive but not a fresh long buildup.`,
        LONG_UNWINDING: `Long unwinding: price down and futures OI down (${changeOi}); existing longs are exiting.`,
        FLAT_PRICE_OI_UP: `Futures OI rose (+${changeOi}) with price roughly flat; ambiguous, treated cautiously.`,
        FLAT_PRICE_OI_DOWN: `Futures OI fell (${changeOi}) with price roughly flat.`,
        OI_FLAT: `Futures OI change is ${changeOi}.`
      };
      add('Futures OI', CFG.weights.futuresOi, quadrantPoints[oiQuadrant], quadrantWhy[oiQuadrant]);
    }

    const normalizedScore = availableWeight ? (score / availableWeight) * 100 : null;
    const enoughHistory = history.length >= CFG.minConfirmedHistory;
    const flatWithOi = priceChangePct !== null && Math.abs(priceChangePct) <= CFG.flatPricePct && changeOi !== null && changeOi > 0;
    const gates = CFG.confirmedGates;
    const confirmedGateFailures = [];
    if (gates.requirePositivePrice && !(priceChangePct !== null && priceChangePct > CFG.flatPricePct)) confirmedGateFailures.push('price is not positively moving');
    if (!(volumeRatio !== null && volumeRatio >= gates.minVolumeRatio)) confirmedGateFailures.push(`volume ratio is below ${gates.minVolumeRatio.toFixed(1)}x`);
    if (!(deliveryPct !== null && deliveryPct >= gates.minDeliveryPct)) confirmedGateFailures.push(`delivery is below ${gates.minDeliveryPct}%`);
    if (gates.requireRisingObv && !(obvTrend !== null && obvTrend > 0)) confirmedGateFailures.push('OBV is not rising');
    if (gates.requirePositiveExactDateOi && !(oiConfirmed && changeOi > 0)) confirmedGateFailures.push('exact-date futures OI is not increasing');
    if (!enoughHistory) confirmedGateFailures.push(`history is shorter than ${CFG.minConfirmedHistory} sessions`);

    let verdict = 'UNCONFIRMED / MIXED';
    if (normalizedScore !== null && normalizedScore >= CFG.verdicts.confirmed && confirmedGateFailures.length === 0) {
      verdict = 'ACCUMULATION CONFIRMED';
    } else if (normalizedScore !== null && normalizedScore >= CFG.verdicts.starting && (flatWithOi || (volumeRatio !== null && volumeRatio >= CFG.volumeRatio.elevated))) {
      verdict = 'ACCUMULATION STARTING';
    } else if (normalizedScore !== null && normalizedScore < CFG.verdicts.mixed) {
      verdict = 'DISTRIBUTION';
    }

    if (confirmedGateFailures.length) why.push(`Confirmation gates not all satisfied: ${confirmedGateFailures.join('; ')}.`);
    if (changeOi === null) why.push('Futures OI confirmation is unavailable for the exact date.');
    if (deliveryPct === null) why.push('Delivery data is unavailable.');
    if (volumeRatio === null) why.push('Volume history is insufficient for a reliable ratio.');
    if (!enoughHistory) why.push('Historical window is shorter than the preferred confirmation window.');
    if (!history.length) why.push('No verified EOD history is available.');
    if (ad.divergence === 'BEARISH_DIVERGENCE') why.push('A/D divergence warning: price is rising but the Accumulation/Distribution line is falling (secondary signal; does not affect score).');
    else if (ad.divergence === 'BULLISH_DIVERGENCE') why.push('A/D divergence note: price is falling while the Accumulation/Distribution line is rising (secondary signal; does not affect score).');

    let finalScore = normalizedScore === null ? null : Math.round(normalizedScore);
    let finalVerdict = verdict;
    let finalConfirmationStatus = verdict === 'ACCUMULATION CONFIRMED' ? 'confirmed' : 'blocked';
    if (corporateActionRisk?.flagged) {
      finalScore = null;
      finalVerdict = 'DATA N/A';
      finalConfirmationStatus = 'blocked';
      why.push(`Possible unadjusted corporate action: single-day price move of ${corporateActionRisk.changePct}% exceeds the plausibility guard${corporateActionRisk.matchedRatio ? ` and matches a common split/bonus ratio (~${corporateActionRisk.matchedRatio})` : ''}. Flagged as DATA N/A rather than scored -- VIKRAM has no corporate-actions calendar to adjust this row.`);
    }

    return {
      symbol: String(input.symbol || current.symbol || '').toUpperCase(), tradeDate: current.trade_date || null,
      score: finalScore, verdict: finalVerdict,
      metrics: { close, prevClose, priceChangePct, volume: currentVolume, avgVolume, volumeRatio, deliveryPct, deliveryQty, deliveryTrend, obv: obvCurrent, obvTrend, futuresOi: oi, changeOi, oiPct, oiExactDate, oiQuadrant, ad, corporateActionRisk: corporateActionRisk || null },
      components, why,
      confirmation: { status: finalConfirmationStatus, gateFailures: confirmedGateFailures }
    };
  }

  root.ACCUMULATION_ENGINE = { evaluate, calculateObv };
  if (typeof module !== 'undefined') module.exports = { evaluate, calculateObv };
})(typeof window !== 'undefined' ? window : globalThis);
