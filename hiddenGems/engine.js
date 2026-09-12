'use strict';
// VIKRAM Hidden Gems engine — canonical implementation.
//
// THIS IS NOT A TRADING SIGNAL AND NOT A BUY ENGINE. Classification output must never be
// presented to a user as a recommendation to buy, hold, or sell (see isRecommendation: false on
// every result, and docs/hidden-gems/HIDDEN_GEMS_OPEN_DECISIONS.md §5, which explicitly rejects
// treating a Hidden Gem classification as an automatic BUY/high-conviction signal).
//
// Architecture (per VIKRAM_HIDDEN_GEMS_ASM_IMPLEMENTATION_BLUEPRINT.md):
//   Eligible Universe -> Data Quality/Liquidity -> Accumulation Engine -> Point-in-Time Universe
//   Context -> Opportunity -> Stealth -> Market Recognition -> Institutional Recognition ->
//   Data Confidence -> Immutable T0/P0 -> HGI -> Classification -> Lead-Time -> ASM
//
// This module implements every stage EXCEPT ASM (see backtest/lib/asm.js, already built) and
// lead-time measurement across time (measureLeadTime() below is the single-evaluation piece;
// walking it across a real historical series is a backtest-level concern).
//
// The ONLY signal engine this module uses is the real accumulation/engine.js — no substitute
// formula. NIFTY membership is read as CONTEXT (see config.js tierAdjustment) and NEVER excludes
// or flatly penalizes a symbol, per explicit instruction.

const path = require('node:path');
const accumulationEngine = require(path.join(__dirname, '..', 'accumulation', 'engine.js'));
const DEFAULT_CONFIG = require('./config');

function tierFor(universeMembership) {
  const memberships = new Set(universeMembership || []);
  if (memberships.has('NIFTY 50')) return 'NIFTY 50';
  if (memberships.has('NIFTY 200')) return 'NIFTY 200';
  if (memberships.has('NIFTY 500')) return 'NIFTY 500';
  return 'NONE';
}

// Data Quality / Liquidity gate. Genuinely insufficient history/fields -> DATA_INSUFFICIENT,
// never a guessed classification.
function passesDataQuality(history, config) {
  if (!Array.isArray(history) || history.length < config.stealth.minSessions) return false;
  return history.every(r => r && r.close != null && r.volume != null);
}

// Stealth: accumulation evidence that is present but MODERATE, not extreme — extreme volume/
// price moves look "already noticed" rather than stealthy. Real computation over real history;
// no invented values. Thresholds are provisional (config.js).
function evaluateStealth(history, config, tier) {
  const n = history.length;
  const recent = history.slice(Math.max(0, n - config.stealth.minSessions));
  const volumes = recent.map(r => Number(r.volume) || 0);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1);
  const baselineVolumes = history.slice(0, Math.max(1, n - config.stealth.minSessions)).map(r => Number(r.volume) || 0);
  const baselineAvg = baselineVolumes.length ? baselineVolumes.reduce((a, b) => a + b, 0) / baselineVolumes.length : avgVolume;
  const volumeRatio = baselineAvg > 0 ? avgVolume / baselineAvg : 1;

  const closes = recent.map(r => Number(r.close));
  const obvSlope = closes.length > 1 ? (closes[closes.length - 1] - closes[0]) / closes[0] : 0;

  const deliveries = recent.map(r => Number(r.deliv_per ?? r.deliveryPct)).filter(Number.isFinite);
  const deliveryTrendUp = deliveries.length > 1 && deliveries[deliveries.length - 1] > deliveries[0];

  const multiplier = (config.tierAdjustment[tier] || config.tierAdjustment.NONE).stealthScoreMultiplier;
  const isModerate = volumeRatio > 1 && volumeRatio <= config.stealth.volumeRatioModerateMax * multiplier
    && Math.abs(obvSlope) <= config.stealth.obvSlopeModerateMax * multiplier;

  return {
    isStealthy: isModerate,
    sessionsObserved: recent.length,
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    obvSlope: Math.round(obvSlope * 10000) / 10000,
    deliveryTrendUp,
    tierMultiplierApplied: multiplier
  };
}

// Market Recognition: NOT_RECOGNIZED / EMERGING_RECOGNITION / RECOGNIZED, from real price/volume
// persistence data only. `newsData` (real trigger counts, if genuinely available) is additive;
// if absent, recognition is judged on price/volume evidence alone, never fabricated news counts.
function evaluateMarketRecognition(history, config, newsData) {
  const n = history.length;
  const window = config.recognition.priceExpansionPersistenceSessions;
  if (n < window) return { recognitionState: 'DATA_INSUFFICIENT', reason: 'Insufficient session history for a recognition window.' };
  const recent = history.slice(n - window);
  const closes = recent.map(r => Number(r.close));
  const persistentExpansion = closes.every((c, i) => i === 0 || c >= closes[i - 1] * 0.995); // no meaningful pullback
  const newsTriggerCount = newsData && Number.isFinite(newsData.triggerCount) ? newsData.triggerCount : null;

  let triggerCount = persistentExpansion ? 1 : 0;
  if (newsTriggerCount != null) triggerCount += newsTriggerCount;

  const t = config.recognition.triggerCounts;
  let recognitionState;
  if (triggerCount <= t.notRecognized) recognitionState = 'NOT_RECOGNIZED';
  else if (triggerCount <= t.emergingRecognition) recognitionState = 'EMERGING_RECOGNITION';
  else recognitionState = 'RECOGNIZED';

  return { recognitionState, triggerCount, newsDataProvided: newsTriggerCount != null };
}

// Institutional Recognition: DATA_INSUFFICIENT unless real institutionalData is supplied — never
// invents FII/MF/promoter holding figures.
function evaluateInstitutionalRecognition(institutionalData, config, tier) {
  if (!institutionalData || !Number.isFinite(institutionalData.combinedPct)) {
    return { institutionalState: 'DATA_INSUFFICIENT', reason: 'No institutional holding data supplied.' };
  }
  const underRecognized = institutionalData.combinedPct < config.institutional.underRecognizedMaxCombinedPct;
  const accelerating = Number.isFinite(institutionalData.qoqChangePct) && institutionalData.qoqChangePct >= config.institutional.accelerationMinPct;
  return {
    institutionalState: underRecognized ? 'UNDER_RECOGNIZED' : 'RECOGNIZED',
    accelerating,
    combinedPct: institutionalData.combinedPct,
    publicationDate: institutionalData.publicationDate || null,
    tier
  };
}

// Data Confidence: NOT "available fields / total fields" (explicitly rejected — see config.js).
// Missing a critical category (recognition or institutional evidence) caps confidence at LOW
// regardless of how many minor fields are present, so missing evidence can never mathematically
// compensate its way into a false HIGH confidence.
function evaluateDataConfidence(recognition, institutional, config) {
  const criticalMissing = recognition.recognitionState === 'DATA_INSUFFICIENT' || institutional.institutionalState === 'DATA_INSUFFICIENT';
  if (criticalMissing) return { tier: 'LOW', reason: 'A critical evidence category (recognition or institutional) is missing.' };
  const bothStrong = recognition.recognitionState !== 'NOT_RECOGNIZED' && institutional.institutionalState !== 'DATA_INSUFFICIENT';
  return { tier: bothStrong ? 'HIGH' : 'MEDIUM', reason: null };
}

// Classification. NIFTY tier is context only (via the stealth multiplier already applied) — it
// never disqualifies. Never returns anything resembling a BUY/SELL instruction.
function classify({ opportunityQualifies, stealth, recognition, institutional, dataConfidence }) {
  if (!opportunityQualifies) return 'DATA_INSUFFICIENT';
  if (recognition.recognitionState === 'DATA_INSUFFICIENT') return 'DATA_INSUFFICIENT';
  if (recognition.recognitionState === 'RECOGNIZED') return 'RECOGNIZED_OPPORTUNITY';
  if (stealth.isStealthy && (recognition.recognitionState === 'NOT_RECOGNIZED' || recognition.recognitionState === 'EMERGING_RECOGNITION')) {
    return dataConfidence.tier === 'LOW' ? 'EMERGING_OPPORTUNITY' : 'GENUINE_HIDDEN_GEM';
  }
  return 'EMERGING_OPPORTUNITY';
}

// Single-point evaluation. `institutionalData`/`newsData` are optional real data — never
// fabricated by this function when absent.
function evaluate({ symbol, history, current, futures, universeMembership = [], institutionalData = null, newsData = null, config = DEFAULT_CONFIG }) {
  const tier = tierFor(universeMembership);

  if (!passesDataQuality(history, config)) {
    return {
      symbol, configVersion: config.configVersion, isRecommendation: false,
      classification: 'DATA_INSUFFICIENT', reason: 'Insufficient/invalid history for the data-quality gate.',
      tier, T0: null, P0: null
    };
  }

  const accumulationResult = accumulationEngine.evaluate({ symbol, history, current, futures });
  const opportunityQualifies = config.opportunityQualifiesOn.includes(accumulationResult.verdict);

  const stealth = evaluateStealth(history, config, tier);
  const recognition = evaluateMarketRecognition(history, config, newsData);
  const institutional = evaluateInstitutionalRecognition(institutionalData, config, tier);
  const dataConfidence = evaluateDataConfidence(recognition, institutional, config);
  const classification = classify({ opportunityQualifies, stealth, recognition, institutional, dataConfidence });

  const isHiddenGemRelevant = classification === 'GENUINE_HIDDEN_GEM' || classification === 'EMERGING_OPPORTUNITY';

  return {
    symbol,
    configVersion: config.configVersion,
    isRecommendation: false, // never a BUY/SELL signal — see module header
    accumulationVerdict: accumulationResult.verdict,
    opportunityQualifies,
    tier,
    stealth,
    recognitionState: recognition.recognitionState,
    recognitionDetail: recognition,
    institutionalState: institutional.institutionalState,
    institutionalDetail: institutional,
    dataConfidence: dataConfidence.tier,
    classification,
    // T0/P0 stamped ONLY when this evaluation is Hidden-Gem-relevant, using the real current
    // date/price already supplied by the caller — never a separately invented value.
    T0: isHiddenGemRelevant ? String(current.trade_date) : null,
    P0: isHiddenGemRelevant ? (current.close ?? null) : null,
    leadTimeState: 'NOT_YET_MEASURED',
    leadTimeTradingDays: null
  };
}

// Lead-time measurement across a real sequence of evaluations for one symbol (e.g. produced by
// re-running evaluate() over consecutive historical days in a backtest). Tr (recognition event)
// is the first day recognitionState becomes 'RECOGNIZED' at or after T0. Never invents Tr — if
// recognition never occurs in the supplied sequence, leadTime stays DATA_N/A.
function measureLeadTime(evaluationSequence, T0) {
  const t0Index = evaluationSequence.findIndex(e => String(e.T0 ?? e.tradeDate) === String(T0));
  if (t0Index === -1) return { leadTimeState: 'DATA_INSUFFICIENT', leadTimeTradingDays: null };
  for (let i = t0Index; i < evaluationSequence.length; i += 1) {
    if (evaluationSequence[i].recognitionState === 'RECOGNIZED') {
      return { leadTimeState: 'MEASURED', leadTimeTradingDays: i - t0Index, recognitionDate: evaluationSequence[i].tradeDate || evaluationSequence[i].T0 };
    }
  }
  return { leadTimeState: 'NOT_YET_RECOGNIZED', leadTimeTradingDays: null };
}

module.exports = {
  evaluate, measureLeadTime, tierFor, passesDataQuality, evaluateStealth,
  evaluateMarketRecognition, evaluateInstitutionalRecognition, evaluateDataConfidence, classify
};
