/* VIKRAM Accumulation Scanner v2 configuration. Pure data; safe to import in browser or Node. */
const ACCUMULATION_CONFIG = Object.freeze({
  historyDays: 20,
  minConfirmedHistory: 10,
  freshnessDays: 1,
  safety: {
    minPriceChangePct: -0.20,
    minDeliveryPct: 35
  },
  flatPricePct: 0.50,
  volumeRatio: { strong: 1.30, normal: 1.00, quietMin: 0.65, quietMax: 1.05 },
  deliveryPct: { strong: 55, positive: 45, floor: 35 },
  deliveryTrendLookback: 5,
  obvLookback: 5,
  oi: { strong: 5, positive: 2 },
  weights: {
    fno: { price: 15, volume: 15, delivery: 25, obv: 20, futuresOi: 25 },
    cash: { price: 20, volume: 20, delivery: 35, obv: 25 }
  },
  verdicts: {
    confirmed: 75,
    starting: 55,
    quiet: 50,
    mixed: 35
  },
  quorum: {
    fno: { pillars: 4, confirmed: 3, starting: 2 },
    cash: { pillars: 3, confirmed: 2, starting: 2 }
  },
  watchlist: ['ONGC', 'VBL', 'BSE', 'NMDC']
});

if (typeof window !== 'undefined') window.ACCUMULATION_CONFIG = ACCUMULATION_CONFIG;
if (typeof module !== 'undefined') module.exports = ACCUMULATION_CONFIG;
