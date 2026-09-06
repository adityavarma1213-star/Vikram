/* VIKRAM Accumulation Engine v2
 * Evidence score + safety floors + dynamic quorum + early accumulation states.
 * No synthetic market values. Missing inputs remain N/A and cannot earn points.
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

  function scoreComponent(value, max) { return Math.max(0, Math.min(max, value)); }

  function evaluate(input) {
    const history = sortRows(input.history);
    const latest = { ...(input.current || history[history.length - 1] || {}) };
    latest.trade_date = dateKey(latest.trade_date || latest.date);
    const futuresOiData = input.futures || null;
    const hasDerivatives = Boolean(futuresOiData && futuresOiData.available);
    const previousRows = history.filter(r => r.trade_date !== latest.trade_date);

    const volumeSamples = previousRows.slice(-CFG.historyDays).map(r => num(r.volume)).filter(v => typeof v === 'number' && !Number.isNaN(v));
    const avgVolume = volumeSamples.length > 0 ? avg(volumeSamples) : null;
    const currentVolume = num(latest.volume);
    const volumeRatio = currentVolume !== null && avgVolume !== null && avgVolume > 0 ? currentVolume / avgVolume : null;

    const close = num(latest.close ?? latest.last_price);
    const prevClose = num(latest.prev_close);
    const priceChangePct = pct(close, prevClose);
    const deliveryPct = num(latest.deliv_per ?? latest.delivery_pct);
    const deliveryQty = num(latest.deliv_qty ?? latest.delivery_qty);
    const deliverySample = history.slice(-CFG.deliveryTrendLookback).map(r => r.deliv_per ?? r.delivery_pct);
    const validDeliverySamples = deliverySample.filter(r => typeof r === 'number' && !Number.isNaN(r));
    const avgDelivery = validDeliverySamples.length > 0 ? validDeliverySamples.reduce((acc, r) => acc + r, 0) / validDeliverySamples.length : 0;
    const priorDeliverySamples = validDeliverySamples.length > 1 ? validDeliverySamples.slice(0, -1) : [];
    const priorDeliveryAvg = priorDeliverySamples.length > 0 ? priorDeliverySamples.reduce((acc, r) => acc + r, 0) / priorDeliverySamples.length : null;
    const deliveryTrend = deliveryPct !== null && priorDeliveryAvg !== null ? deliveryPct - priorDeliveryAvg : null;

    const obvRows = calculateObv(history);
    const obvCurrent = obvRows.length ? obvRows[obvRows.length - 1].obv : null;
    const obvStart = obvRows.length > CFG.obvLookback ? obvRows[obvRows.length - 1 - CFG.obvLookback].obv : null;
    const obvTrend = finite(obvCurrent) && finite(obvStart) ? obvCurrent - obvStart : null;

    const futuresDate = futuresOiData && (futuresOiData.trade_date || futuresOiData.date);
    const oiExactDate = hasDerivatives && dateKey(futuresDate) === latest.trade_date;
    const oi = oiExactDate ? num(futuresOiData.oi ?? futuresOiData.open_interest) : null;
    const changeOi = oiExactDate ? num(futuresOiData.change_oi ?? futuresOiData.change_in_oi) : null;
    const oiTrend3Day = num(futuresOiData && futuresOiData.oiTrend3Day);
    const oiPct = oi !== null && finite(changeOi) && oi !== 0 ? (changeOi / Math.abs(oi - changeOi || oi)) * 100 : null;
    const oiConfirmed = oi !== null && changeOi !== null;

    let score = 0;
    let availableWeight = 0;
    const why = [];
    const components = [];
    const add = (name, weight, points, detail) => {
      if (points === null) return;
      score += points;
      availableWeight += weight;
      components.push({ name, weight, points: Math.round(points * 100) / 100, detail });
      if (detail) why.push(detail);
    };

    if (priceChangePct !== null) {
      const points = priceChangePct > 0.50 ? CFG.weights.price : priceChangePct >= 0.10 ? CFG.weights.price * 0.80 : priceChangePct >= -0.20 ? CFG.weights.price * 0.5333333333 : 0;
      add('Price stability', CFG.weights.price, scoreComponent(points, CFG.weights.price), priceChangePct > 0.50 ? 'Price is firmly positive.' : priceChangePct >= -0.20 ? 'Price is stable/tightly based.' : 'Price is breaking down.');
    }
    if (volumeRatio !== null) {
      const points = volumeRatio >= 1.30 ? CFG.weights.volume : volumeRatio >= 1.00 ? CFG.weights.volume * (10 / 15) : volumeRatio >= 0.70 ? CFG.weights.volume * 0.40 : 0;
      add('Volume expansion', CFG.weights.volume, scoreComponent(points, CFG.weights.volume), `Volume ratio is ${volumeRatio.toFixed(2)}x.`);
    }
    if (deliveryPct !== null) {
      let points = deliveryPct >= 55 ? CFG.weights.delivery : deliveryPct >= 45 ? CFG.weights.delivery * (18 / 25) : deliveryPct >= 35 ? CFG.weights.delivery * (10 / 25) : 0;
      if (deliveryTrend !== null && deliveryTrend > 0) points += CFG.weights.delivery * 0.15;
      add('Delivery quality', CFG.weights.delivery, Math.min(CFG.weights.delivery, points), deliveryTrend !== null && deliveryTrend > 0 ? `Delivery is ${deliveryPct.toFixed(1)}% and trending higher.` : `Delivery is ${deliveryPct.toFixed(1)}%.`);
    }
    if (obvTrend !== null) {
      add('OBV structure', CFG.weights.obv, obvTrend > 0 ? CFG.weights.obv : obvTrend === 0 ? CFG.weights.obv * 0.40 : 0, obvTrend > 0 ? 'OBV trend is rising.' : obvTrend === 0 ? 'OBV trend is neutral.' : 'OBV trend is falling.');
    }
    if (hasDerivatives && (oiConfirmed || oiTrend3Day !== null)) {
      const positiveToday = changeOi !== null && changeOi > 0;
      let points = positiveToday && oiTrend3Day !== null && oiTrend3Day > 0 ? CFG.weights.futuresOi : positiveToday ? CFG.weights.futuresOi * (18 / 25) : oiTrend3Day !== null && oiTrend3Day > 0 ? CFG.weights.futuresOi * (12 / 25) : changeOi === 0 ? CFG.weights.futuresOi * 0.10 : 0;
      add('Futures OI action', CFG.weights.futuresOi, Math.min(CFG.weights.futuresOi, points), positiveToday ? `Futures OI increased on the exact trading date (+${changeOi}).` : oiTrend3Day !== null && oiTrend3Day > 0 ? 'Futures OI trend is positive over three sessions.' : `Futures OI change is ${changeOi ?? 'N/A'}.`);
    }

    const rawScore = score;
    const normalizedScore = availableWeight ? (rawScore / availableWeight) * 100 : null;
    const availableWeightExpected = hasDerivatives ? CFG.weights.price + CFG.weights.volume + CFG.weights.delivery + CFG.weights.obv + CFG.weights.futuresOi : CFG.weights.price + CFG.weights.volume + CFG.weights.delivery + CFG.weights.obv;
    const cashScore = !hasDerivatives && availableWeight ? (rawScore / Math.min(availableWeightExpected, availableWeight)) * 100 : normalizedScore;
    const scoreValue = hasDerivatives ? normalizedScore : cashScore;

    const safetyFailures = [];
    const turnover = typeof latest.turnover === 'number' ? latest.turnover : (Number(latest.volume || 0) * Number(latest.close || 0));
    const safetyFloors = CFG.safetyFloors || {};
    const minTurnover = safetyFloors.minTurnoverRupees || 50000000;
    if (!(turnover >= minTurnover)) safetyFailures.push(`turnover is below ₹${(minTurnover / 10000000).toFixed(0)} Cr`);
    if (!(priceChangePct !== null && priceChangePct >= (safetyFloors.minPriceChangePct ?? -0.20))) safetyFailures.push(`price change is below ${(safetyFloors.minPriceChangePct ?? -0.20).toFixed(2)}%`);
    if (!(deliveryPct !== null && deliveryPct >= (safetyFloors.minDeliveryPct ?? 35.0))) safetyFailures.push(`delivery is below ${(safetyFloors.minDeliveryPct ?? 35.0).toFixed(1)}%`);
    if (history.length < CFG.minConfirmedHistory) safetyFailures.push(`history is shorter than ${CFG.minConfirmedHistory} sessions`);

    const pillars = {
      volume: volumeRatio !== null && (volumeRatio >= 1.10 || (volumeRatio >= 0.80 && deliveryPct !== null && deliveryPct >= 55)),
      delivery: deliveryPct !== null && deliveryPct >= 45,
      obv: obvTrend !== null && obvTrend > 0,
      oi: hasDerivatives && ((changeOi !== null && changeOi > 0) || (oiTrend3Day !== null && oiTrend3Day > 0))
    };
    const pillarNames = hasDerivatives ? ['volume', 'delivery', 'obv', 'oi'] : ['volume', 'delivery', 'obv'];
    const passedPillars = pillarNames.filter(name => pillars[name]).length;
    const requiredPillars = hasDerivatives ? (CFG.quorum?.fno?.required ?? 3) : (CFG.quorum?.cash?.required ?? 3);
    const totalPillars = hasDerivatives ? (CFG.quorum?.fno?.total ?? 4) : (CFG.quorum?.cash?.total ?? 3);

    const quietAbsorption = scoreValue !== null && scoreValue >= 50 && volumeRatio !== null && volumeRatio >= 0.65 && volumeRatio <= 1.05 && deliveryPct !== null && deliveryPct >= 55 && obvTrend !== null && obvTrend > 0 && priceChangePct !== null && Math.abs(priceChangePct) <= 0.50 && safetyFailures.length === 0;
    const highVolumeFallingOi = volumeRatio !== null && volumeRatio >= 1.30 && obvTrend !== null && obvTrend < 0 && ((changeOi !== null && changeOi < 0) || (oiTrend3Day !== null && oiTrend3Day < 0));

    let verdict = 'MIXED / UNCONFIRMED';
    if (scoreValue !== null && scoreValue < CFG.verdicts.mixed) verdict = 'DISTRIBUTION';
    if (highVolumeFallingOi || (priceChangePct !== null && priceChangePct < -0.20 && volumeRatio !== null && volumeRatio >= 1.30 && (!hasDerivatives || (changeOi !== null && changeOi < 0)))) verdict = 'DISTRIBUTION';
    if (quietAbsorption) verdict = 'QUIET ABSORPTION';
    if (scoreValue !== null && scoreValue >= CFG.verdicts.starting && safetyFailures.length === 0 && passedPillars >= Math.min(requiredPillars - 1, totalPillars)) verdict = 'ACCUMULATION STARTING';
    if (scoreValue !== null && scoreValue >= CFG.verdicts.confirmed && safetyFailures.length === 0 && passedPillars >= requiredPillars) verdict = 'ACCUMULATION CONFIRMED';

    if (safetyFailures.length) why.push(`Safety floors not satisfied: ${safetyFailures.join('; ')}.`);
    if (!hasDerivatives) why.push('Futures OI is not applicable/available; cash-equity quorum uses Volume, Delivery and OBV only.');
    else if (!oiConfirmed && oiTrend3Day === null) why.push('Futures OI confirmation is unavailable for the exact date.');
    if (deliveryPct === null) why.push('Delivery data is unavailable.');
    if (volumeRatio === null) why.push('Volume history is insufficient for a reliable ratio.');
    if (!history.length) why.push('No verified EOD history is available.');

    return {
      symbol: String(input.symbol || latest.symbol || '').toUpperCase(),
      tradeDate: latest.trade_date || null,
      score: scoreValue === null ? null : Math.round(scoreValue),
      verdict,
      metrics: { close, prevClose, priceChangePct, volume: currentVolume, avgVolume, volumeRatio, deliveryPct, deliveryQty, avgDelivery, deliveryTrend, turnover, obv: obvCurrent, obvTrend, futuresOi: oi, changeOi, oiPct, oiExactDate, oiTrend3Day, hasDerivatives },
      components,
      why,
      confirmation: { status: verdict === 'ACCUMULATION CONFIRMED' ? 'confirmed' : 'blocked', gateFailures: safetyFailures, pillars: { passed: passedPillars, required: requiredPillars, total: totalPillars, details: pillars } }
    };
  }

  root.ACCUMULATION_ENGINE = { evaluate, calculateObv };
  if (typeof module !== 'undefined') module.exports = { evaluate, calculateObv };
})(typeof window !== 'undefined' ? window : globalThis);
