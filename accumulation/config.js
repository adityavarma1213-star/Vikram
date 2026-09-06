/* VIKRAM Accumulation Scanner v2 configuration. */
const ACCUMULATION_CONFIG = Object.freeze({
  historyDays: 20,
  minConfirmedHistory: 10,
  freshnessDays: 1,
  flatPricePct: 0.25,
  volumeRatio: { strong: 1.3, elevated: 1.0, confirmed: 1.2 },
  deliveryPct: { strong: 55, positive: 45, cashConfirmed: 55 },
  deliveryTrendLookback: 5,
  obvLookback: 5,
  oi: { strong: 5, positive: 2 },
  weights: { price: 15, volume: 15, delivery: 25, obv: 20, futuresOi: 25 },
  cashWeights: { price: 20, volume: 20, delivery: 35, obv: 25 },
  verdicts: { confirmed: 75, starting: 55, mixed: 35 },
  safetyFloors: { minTurnoverRupees: 50000000, minPriceChangePct: -0.20, minDeliveryPct: 35.0 },
  confirmation: {
    fno: { minPriceChangePct: 0.25, minVolumeRatio: 1.2, minDeliveryPct: 45.0, requireObvRising: true, requirePositiveOi: true },
    cash: { minPriceChangePct: 0.25, minVolumeRatio: 1.2, minDeliveryPct: 55.0, requireObvRising: true }
  },
  quorum: { fno: { total: 4, required: 4 }, cash: { total: 3, required: 3 } },
  watchlist: ['ONGC', 'VBL', 'BSE', 'NMDC']
});

if (typeof window !== 'undefined') window.ACCUMULATION_CONFIG = ACCUMULATION_CONFIG;
if (typeof module !== 'undefined') module.exports = ACCUMULATION_CONFIG;
