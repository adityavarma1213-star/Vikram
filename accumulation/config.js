/* VIKRAM Accumulation Scanner v2 configuration. */
const ACCUMULATION_CONFIG = Object.freeze({
  historyDays: 20,
  minConfirmedHistory: 10,
  freshnessDays: 1,
  flatPricePct: 0.25,
  volumeRatio: { strong: 1.3, elevated: 1.0 },
  deliveryPct: { strong: 55, positive: 45 },
  deliveryTrendLookback: 5,
  obvLookback: 5,
  oi: { strong: 5, positive: 2 },
  weights: { price: 15, volume: 15, delivery: 25, obv: 20, futuresOi: 25 },
  verdicts: { confirmed: 75, starting: 55, mixed: 35 },
  safetyFloors: { minTurnoverRupees: 50000000, minPriceChangePct: -0.20, minDeliveryPct: 35.0 },
  quorum: { fno: { total: 4, required: 3 }, cash: { total: 3, required: 3 } },
  watchlist: ['ONGC', 'VBL', 'BSE', 'NMDC']
});

if (typeof window !== 'undefined') window.ACCUMULATION_CONFIG = ACCUMULATION_CONFIG;
if (typeof module !== 'undefined') module.exports = ACCUMULATION_CONFIG;
