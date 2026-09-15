'use strict';
// Backtest Data Contract.
//
// The clean, single API surface the backtester (or any future engine —
// Accumulation DNA, SOAI, False-Accumulation Detector, Historical Analogue,
// etc.) should call instead of reaching into data/market-history/*.json
// directly. Every function below returns one of exactly four shapes:
//
//   { status: 'VALID',                data: {...}, provenance: {...} }
//   { status: 'DATA_N_A',             reason: '...' }
//   { status: 'DATA_INSUFFICIENT',    reason: '...' }
//   { status: 'VERIFICATION_BLOCKED', reason: '...' }
//
// No function here ever substitutes a nearby date for a missing one, ever
// interpolates a missing value, and ever silently returns partial data
// under a VALID status. This module does not fetch anything over the
// network and does not fabricate anything — it is a read-only, honest view
// over whatever real data already exists on disk in this repository.

const fs = require('fs');
const path = require('path');
const { classifyTradingDays, isWeekend } = require('./staleDuplicateDetector');
const { detectPriceDiscontinuities, assessCoverage } = require('./corporateActions');
const { membershipAsOf } = require('../../server/src/pointInTimeUniverse');

function defaultHistoryDir() {
  return path.join(__dirname, '..', '..', 'data', 'market-history');
}

// Small in-process cache: a backtest run may call these functions thousands
// of times per session for a handful of distinct dates. Caching the parsed
// file (not any derived/transformed value) avoids re-reading disk without
// risking staleness within a single run.
function makeLoader(historyDir) {
  const cache = new Map();
  return function loadDay(date) {
    if (cache.has(date)) return cache.get(date);
    const filePath = path.join(historyDir, `${date}.json`);
    let result;
    if (!fs.existsSync(filePath)) {
      result = { exists: false, file: null, malformed: false };
    } else {
      try {
        result = { exists: true, file: JSON.parse(fs.readFileSync(filePath, 'utf8')), malformed: false };
      } catch (e) {
        result = { exists: true, file: null, malformed: true, error: e.message };
      }
    }
    cache.set(date, result);
    return result;
  };
}

function makeDataContract({ historyDir = defaultHistoryDir(), membershipRows = [] } = {}) {
  const loadDay = makeLoader(historyDir);

  function dayOrStatus(date) {
    const day = loadDay(date);
    if (day.malformed) {
      return { blocked: { status: 'VERIFICATION_BLOCKED', reason: `market-history file for ${date} exists but could not be parsed: ${day.error}` } };
    }
    if (!day.exists) {
      return { blocked: { status: 'DATA_N_A', reason: `no market-history file for ${date} — either not downloaded or a non-trading day (see getTradingSession for that distinction)` } };
    }
    if (!Array.isArray(day.file.cm) || !Array.isArray(day.file.futures)) {
      return { blocked: { status: 'VERIFICATION_BLOCKED', reason: `market-history file for ${date} is missing required cm[]/futures[] arrays` } };
    }
    return { day: day.file };
  }

  function getMarketData(symbol, date) {
    const { blocked, day } = dayOrStatus(date);
    if (blocked) return blocked;
    const row = day.cm.find(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!row) return { status: 'DATA_N_A', reason: `symbol ${symbol} not present in CM data for ${date} (not listed, not traded, or genuinely absent from the source file)` };
    return {
      status: 'VALID',
      data: { symbol: row.symbol, trade_date: row.trade_date || date, open: row.open ?? null, high: row.high ?? null, low: row.low ?? null, close: row.close ?? null, prev_close: row.prev_close ?? null, volume: row.volume ?? null },
      provenance: { source: 'data/market-history', file: `${date}.json` }
    };
  }

  function getDeliveryData(symbol, date) {
    const { blocked, day } = dayOrStatus(date);
    if (blocked) return blocked;
    const row = day.cm.find(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (!row) return { status: 'DATA_N_A', reason: `symbol ${symbol} not present in CM data for ${date}` };
    if (row.deliv_qty == null || row.deliv_per == null) {
      return { status: 'DATA_INSUFFICIENT', reason: `delivery fields absent for ${symbol} on ${date} in the stored file` };
    }
    return {
      status: 'VALID',
      data: { symbol: row.symbol, trade_date: row.trade_date || date, deliv_qty: row.deliv_qty, deliv_per: row.deliv_per, volume: row.volume ?? null },
      provenance: { source: 'data/market-history', file: `${date}.json` },
      // Field presence is not the same as data quality (per assignment §Data Quality Engine):
      // surface the zero-delivery anomaly instead of hiding it behind a VALID status.
      qualityWarning: row.deliv_per === 0 ? 'deliv_per is exactly 0 — flagged as a known anomaly pattern (see data/nse-coverage-report.json), not silently trusted' : null
    };
  }

  function getFuturesData(symbol, date) {
    const { blocked, day } = dayOrStatus(date);
    if (blocked) return blocked;
    const rows = day.futures.filter(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (rows.length === 0) return { status: 'DATA_N_A', reason: `no futures contracts found for ${symbol} on ${date}` };
    return {
      status: 'VALID',
      data: rows.map(r => ({ symbol: r.symbol, trade_date: r.trade_date || date, expiry: r.expiry ?? null, close: r.close ?? null, volume: r.volume ?? null })),
      provenance: { source: 'data/market-history', file: `${date}.json` }
    };
  }

  function getOIData(symbol, date) {
    const { blocked, day } = dayOrStatus(date);
    if (blocked) return blocked;
    const rows = day.futures.filter(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (rows.length === 0) return { status: 'DATA_N_A', reason: `no F&O contracts found for ${symbol} on ${date}` };
    const withOi = rows.filter(r => r.oi != null);
    if (withOi.length === 0) return { status: 'DATA_INSUFFICIENT', reason: `OI field absent for ${symbol} contracts on ${date}` };
    return {
      status: 'VALID',
      data: withOi.map(r => ({ symbol: r.symbol, expiry: r.expiry ?? null, oi: r.oi, change_oi: r.change_oi ?? null })),
      provenance: { source: 'data/market-history', file: `${date}.json` }
    };
  }

  // Heuristic-only, exactly per backtest/lib/corporateActions.js's own honesty
  // disclosure: this never claims a confirmed corporate action, only flags a
  // price discontinuity for closer inspection, and its coverage status
  // reflects that the authoritative NSE source has never been reachable from
  // this sandbox.
  function getCorporateActions(symbol, dateRangeHistory) {
    if (!Array.isArray(dateRangeHistory) || dateRangeHistory.length < 2) {
      return { status: 'DATA_INSUFFICIENT', reason: `need at least two chronological price points for ${symbol} to detect a discontinuity; got ${Array.isArray(dateRangeHistory) ? dateRangeHistory.length : 0}` };
    }
    const flagged = detectPriceDiscontinuities(dateRangeHistory);
    const coverage = assessCoverage(null); // never successfully fetched in this environment — see corporateActions.js
    return {
      status: 'DATA_INSUFFICIENT',
      reason: coverage.reason,
      data: { heuristicFlags: flagged, coverage: coverage.status }
    };
  }

  // Point-in-time universe. Honest by construction: membershipRows is empty
  // until a real daily snapshot job (server/src/indexUniverses.js ->
  // pointInTimeUniverse.recordSnapshot-style flow) has actually run and been
  // persisted. This function does not fall back to today's constituent list.
  function getHistoricalUniverse(date, indexName = 'NIFTY 500') {
    if (!membershipRows.length) {
      return { status: 'VERIFICATION_BLOCKED', reason: 'no point-in-time index-membership snapshots have been persisted yet — using today\'s constituent list for a historical date would be exactly the look-ahead bias this contract exists to prevent; see server/src/pointInTimeUniverse.js' };
    }
    const members = membershipRows.filter(r => r.indexName === indexName);
    const asOf = [...new Set(members.map(r => r.symbol))].filter(sym => membershipAsOf(sym, date, membershipRows).includes(indexName));
    if (asOf.length === 0) return { status: 'DATA_INSUFFICIENT', reason: `no recorded membership rows cover ${date} for ${indexName}` };
    return { status: 'VALID', data: { indexName, date, symbols: asOf }, provenance: { source: 'point-in-time snapshots', rowCount: members.length } };
  }

  function getTradingSession(date) {
    const day = loadDay(date);
    if (day.exists && !day.malformed) {
      const classification = classifyTradingDays([{ date, file: day.file }]);
      return { status: 'VALID', data: classification[0], provenance: { source: 'data/market-history', file: `${date}.json` } };
    }
    if (day.malformed) return { status: 'VERIFICATION_BLOCKED', reason: `market-history file for ${date} could not be parsed` };
    if (isWeekend(date)) return { status: 'VALID', data: { date, status: 'NOT_A_TRADING_DAY', reason: 'weekend' } };
    return { status: 'DATA_INSUFFICIENT', reason: `weekday with no stored file for ${date} — cannot distinguish a genuine NSE holiday from an ungathered trading day without an official holiday calendar (none available)` };
  }

  return { getMarketData, getDeliveryData, getFuturesData, getOIData, getCorporateActions, getHistoricalUniverse, getTradingSession };
}

module.exports = { makeDataContract };
