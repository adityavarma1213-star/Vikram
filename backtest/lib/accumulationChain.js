'use strict';
// Accumulation Chain (#15/#16).
//
// Builds the MARKET → SECTOR → INDUSTRY → VALUE CHAIN → STOCK → DELIVERY →
// F&O → PRICE evidence chain for one symbol/date, using only real,
// already-ingested data and canonical engines. No new calculation is
// introduced for MARKET/SECTOR/STOCK/DELIVERY/F&O/PRICE — those layers
// reuse `marketRegimeEngine.js`, `sectorAccumulationEngine.js`, and
// `dataContract.js` directly.
//
// CONFLICT TYPE: data
// CONFLICT AGAINST: nirmalavarma1213@gmail.com — Nirmala
// CURRENT WORK: Accumulation Chain (#15/#16)
// CONFLICT: (1) SECTOR/INDUSTRY coverage is the same severe gap already
//   reported in session 6 (5 of 2,950 real symbols mapped) — restated here,
//   not re-litigated. (2) VALUE CHAIN (verified supply-chain / value-chain
//   company relationships) has ZERO real data anywhere in this repository
//   — confirmed by search this session. No raw-material→manufacturer→
//   distributor relationship data, verified or otherwise, exists.
// IMPACT: the VALUE CHAIN layer can never be populated with genuine
//   evidence under current infrastructure — this is a hard, permanent
//   `VERIFICATION_BLOCKED`, not a temporary calculation gap.
// ACTION: implemented every layer that genuinely has real data behind it
//   (MARKET, STOCK, DELIVERY, F&O, PRICE always; SECTOR/INDUSTRY where a
//   real mapping exists) and explicit, permanent `VERIFICATION_BLOCKED` for
//   VALUE CHAIN. Per the original spec's own rule ("do not fabricate
//   relationships"), no placeholder or invented value-chain relationship
//   was created — the layer is present in the output shape but never
//   populated with anything but that block status.
//
// NO-LOOK-AHEAD: entirely inherited from the composed engines
// (`marketRegimeEngine`, `sectorAccumulationEngine`, `dataContract`) — this
// module performs no independent date filtering of its own.

const { classifyMarketRegime } = require('./marketRegimeEngine');
const { computeSectorAccumulation } = require('./sectorAccumulationEngine');
const { loadSectorMap } = require('./sectorLookup');
const { loadIndustryMap } = require('./industryLookup');
const { makeDataContract } = require('./dataContract');

function buildAccumulationChain(symbol, asOfDate, index, opts = {}) {
  const upperSymbol = String(symbol).toUpperCase();
  const allDates = index.allTradingDates();
  if (!allDates.includes(asOfDate)) {
    return { symbol: upperSymbol, asOfDate, status: 'DATA_N_A', reason: 'asOfDate is not a real trading date in this dataset', chain: null };
  }

  const contract = makeDataContract({ historyDir: opts.historyDir });
  const sector = loadSectorMap().get(upperSymbol) || null;
  const industry = loadIndustryMap().get(upperSymbol) || null;

  // MARKET layer — real, always evaluable (market-wide aggregate, not symbol-specific)
  const marketLayer = classifyMarketRegime(asOfDate, index);

  // SECTOR layer — real where a mapping exists (5/2,950 symbols); honestly blocked otherwise
  const sectorLayer = sector
    ? computeSectorAccumulation(sector, asOfDate, index)
    : { status: 'DATA_INSUFFICIENT', reason: `${upperSymbol} has no real sector mapping in this dataset (5/2,950 real symbols mapped — see sectorLookup.js)` };

  // INDUSTRY layer — same real, sparse source (js/companyDatabase.js), reported as informational
  // context only (no aggregate industry-level calculation exists — would need >=2 symbols per
  // industry to compute one, and every real industry mapping in this dataset has exactly 1 symbol)
  const industryLayer = industry
    ? { status: 'REAL', industryName: industry, symbolCount: 1, reason: 'informational only — every real industry mapping in this dataset has exactly 1 symbol, insufficient for an industry-level aggregate (need >= 2, same floor as sectorAccumulationEngine.js)' }
    : { status: 'DATA_INSUFFICIENT', reason: `${upperSymbol} has no real industry mapping in this dataset (5/2,950 real symbols mapped)` };

  // VALUE CHAIN layer — permanently blocked, no fabrication
  const valueChainLayer = {
    status: 'VERIFICATION_BLOCKED',
    reason: 'no verified value-chain/supply-chain company relationship data exists anywhere in this repository — confirmed by search. This is a permanent block pending a genuine data source, not a temporary gap this module can compute around. No relationship is fabricated.'
  };

  // STOCK / DELIVERY / F&O / PRICE layers — real, canonical (dataContract.js, session 1)
  const stockLayer = contract.getMarketData(upperSymbol, asOfDate);
  const deliveryLayer = contract.getDeliveryData(upperSymbol, asOfDate);
  const futuresLayer = contract.getFuturesData(upperSymbol, asOfDate);
  const oiLayer = contract.getOIData(upperSymbol, asOfDate);
  const priceLayer = stockLayer.status === 'VALID' ? { status: 'VALID', close: stockLayer.data.close, prevClose: stockLayer.data.prev_close } : { status: stockLayer.status, reason: stockLayer.reason };

  const layers = [
    { name: 'MARKET', status: marketLayer.status === 'CLASSIFIED' ? 'REAL' : marketLayer.status, detail: marketLayer },
    { name: 'SECTOR', status: sectorLayer.status === 'CALCULATED' ? 'REAL' : sectorLayer.status, detail: sectorLayer },
    { name: 'INDUSTRY', status: industryLayer.status, detail: industryLayer },
    { name: 'VALUE_CHAIN', status: valueChainLayer.status, detail: valueChainLayer },
    { name: 'STOCK', status: stockLayer.status === 'VALID' ? 'REAL' : stockLayer.status, detail: stockLayer },
    { name: 'DELIVERY', status: deliveryLayer.status === 'VALID' ? 'REAL' : deliveryLayer.status, detail: deliveryLayer },
    { name: 'F&O', status: (futuresLayer.status === 'VALID' && oiLayer.status === 'VALID') ? 'REAL' : (futuresLayer.status === 'VALID' ? futuresLayer.status : oiLayer.status), detail: { futures: futuresLayer, oi: oiLayer } },
    { name: 'PRICE', status: priceLayer.status === 'VALID' ? 'REAL' : priceLayer.status, detail: priceLayer }
  ];

  // "Where evidence strengthens or weakens" (per original spec): a simple, honest
  // reading of which layers have real evidence vs which are blocked/insufficient —
  // never a fabricated composite score.
  const realLayers = layers.filter(l => l.status === 'REAL').map(l => l.name);
  const blockedOrInsufficientLayers = layers.filter(l => l.status !== 'REAL').map(l => ({ name: l.name, status: l.status }));

  return {
    symbol: upperSymbol,
    asOfDate,
    status: 'BUILT',
    chain: layers,
    evidenceSummary: {
      layersWithRealEvidence: realLayers,
      layersBlockedOrInsufficient: blockedOrInsufficientLayers,
      note: 'this lists which layers have real evidence vs which are blocked/insufficient at this date — it is not a fabricated composite "chain strength" score'
    },
    dataQualityStatus: blockedOrInsufficientLayers.length === 0 ? 'REAL' : 'PARTIAL',
    lookAheadStatus: 'NO_LOOK_AHEAD_VERIFIED', // inherited from every composed engine
    permanentLimitations: [
      'VALUE_CHAIN is permanently VERIFICATION_BLOCKED — no verified supply-chain/value-chain relationship data exists anywhere in this repository',
      'SECTOR/INDUSTRY layers are real but severely sparse (5/2,950 real symbols mapped) — see the session-6 conflict report against Nirmala',
      'INDUSTRY layer is informational only, never an aggregate — every real industry mapping in this dataset has exactly 1 symbol'
    ]
  };
}

module.exports = { buildAccumulationChain };
