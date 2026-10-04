'use strict';
// Immutable daily V15 snapshots.
//
// Layout:  <dir>/<scanDate>/<scanTimestamp>.json   one file per scan, never overwritten
//          <dir>/index.json                        append-only hash chain over every snapshot
//
// - A snapshot file is write-once. Writing the same content again is a no-op; writing different
//   content to an existing path throws ImmutableSnapshotError.
// - A later scan never replaces an earlier one. Several scans of the same date coexist; the
//   "canonical" scan for a date is the latest one whose data quality is OK.
// - A date with no snapshot is MISSING_SNAPSHOT. It is never reported as zero confirmations.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assessDeliveryDay } = require('./dataQuality');

const SCHEMA_VERSION = 'v15-daily-snapshot/1';
const GENESIS = '0'.repeat(64);
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

class ImmutableSnapshotError extends Error {
  constructor(message) { super(message); this.name = 'ImmutableSnapshotError'; }
}

// Deterministic JSON (sorted keys) so a hash is stable across runs.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value === undefined ? null : value);
}

function confirmedEntry(r) {
  const m = r.metrics || {};
  return {
    symbol: r.symbol, close: m.close ?? null, score: r.score ?? null, verdict: r.verdict,
    volumeRatio: m.volumeRatio ?? null, obv: m.obv ?? null, obvTrend: m.obvTrend ?? null,
    deliveryPct: m.deliveryPct ?? null, futuresOi: m.futuresOi ?? null, changeOi: m.changeOi ?? null,
    priceChangePct: m.priceChangePct ?? null,
    gateFailures: r.confirmation && Array.isArray(r.confirmation.gateFailures) ? r.confirmation.gateFailures : [],
    components: r.components || []
  };
}

// scanner: the parsed data/scanner.json produced by the frozen engine. Pure function.
function buildSnapshot(scanner, { engineSha256, configSha256, datasetVersion = null, provenance = {} } = {}) {
  if (!scanner || !scanner.asOf || !Array.isArray(scanner.results)) throw new Error('buildSnapshot: scanner.json with asOf and results is required');
  if (!engineSha256 || !configSha256) throw new Error('buildSnapshot: engineSha256 and configSha256 are required');
  const results = scanner.results;
  const confirmed = results.filter(r => r.verdict === 'ACCUMULATION CONFIRMED');
  const starting = results.filter(r => r.verdict === 'ACCUMULATION STARTING');
  const gateFailureSummary = {};
  for (const r of results) {
    const gates = r.confirmation && Array.isArray(r.confirmation.gateFailures) ? r.confirmation.gateFailures : [];
    for (const g of gates) gateFailureSummary[g] = (gateFailureSummary[g] || 0) + 1;
  }
  const delivery = assessDeliveryDay(results.map(r => ({ deliv_per: r.metrics ? r.metrics.deliveryPct : null, deliv_qty: r.metrics ? r.metrics.deliveryQty : null })));
  const reasons = [];
  if (delivery.status !== 'OK') reasons.push(delivery.status);
  if (scanner.dataStatus !== 'EOD VERIFIED') reasons.push(`dataStatus=${scanner.dataStatus}`);
  const dataQuality = reasons.length ? { status: 'DATA_INSUFFICIENT', reasons } : { status: 'OK', reasons: [] };
  const classification = dataQuality.status !== 'OK' ? 'DATA_INSUFFICIENT' : (confirmed.length ? 'VERIFIED_CONFIRMATIONS' : 'VERIFIED_ZERO_CONFIRMATIONS');
  const symbols = results.map(r => r.symbol).sort();
  const body = {
    schemaVersion: SCHEMA_VERSION,
    scanDate: scanner.asOf, scanTimestamp: scanner.generatedAt || null, tradingSession: scanner.asOf,
    universe: { source: scanner.universeSource || null, version: sha256(symbols.join(',')), size: symbols.length },
    counts: { scanned: results.length, starting: starting.length, confirmed: confirmed.length },
    confirmedSymbols: confirmed.map(r => r.symbol),
    confirmed: confirmed.map(confirmedEntry),
    startingSymbols: starting.map(r => r.symbol),
    gateFailureSummary,
    dataCompleteness: {
      historyDays: scanner.historyDays ?? null, deliveryPositive: delivery.positive, deliveryZero: delivery.zero, deliveryMissing: delivery.missing,
      exactDateOiSymbols: results.filter(r => r.metrics && r.metrics.oiExactDate).length
    },
    dataStatus: scanner.dataStatus || null, dataQuality, classification,
    engineSha256, configSha256, datasetVersion, provenance
  };
  return { ...body, snapshotHash: sha256(canonicalJson(body)) };
}

function verifySnapshot(snapshot) {
  const { snapshotHash, ...body } = snapshot;
  return sha256(canonicalJson(body)) === snapshotHash;
}

const stamp = ts => String(ts || 'unknown').replace(/[^0-9A-Za-z]/g, '');
const fileFor = (dir, s) => path.join(dir, s.scanDate, `${stamp(s.scanTimestamp)}.json`);

function readIndex(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { return { schemaVersion: SCHEMA_VERSION, entries: [] }; }
}

function writeSnapshot(dir, snapshot) {
  if (!verifySnapshot(snapshot)) throw new ImmutableSnapshotError('snapshot hash does not match its content; refusing to write');
  const file = fileFor(dir, snapshot);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (existing.snapshotHash === snapshot.snapshotHash) return { status: 'UNCHANGED', file };
    throw new ImmutableSnapshotError(`${path.relative(dir, file)} already exists with different content; snapshots are immutable`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 1)}\n`, { flag: 'wx' });
  const index = readIndex(dir);
  const prev = index.entries.length ? index.entries[index.entries.length - 1].chainHash : GENESIS;
  index.entries.push({
    scanDate: snapshot.scanDate, scanTimestamp: snapshot.scanTimestamp, file: path.relative(dir, file),
    classification: snapshot.classification, snapshotHash: snapshot.snapshotHash, prevChainHash: prev, chainHash: sha256(prev + snapshot.snapshotHash)
  });
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  return { status: 'WRITTEN', file };
}

// Re-hashes every file and the chain. Returns { ok, problems[] }.
function verifyChain(dir) {
  const index = readIndex(dir); const problems = []; let prev = GENESIS;
  for (const e of index.entries) {
    if (e.prevChainHash !== prev) problems.push(`${e.file}: chain break`);
    if (sha256(prev + e.snapshotHash) !== e.chainHash) problems.push(`${e.file}: chainHash mismatch`);
    prev = e.chainHash;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, e.file), 'utf8'));
      if (!verifySnapshot(s) || s.snapshotHash !== e.snapshotHash) problems.push(`${e.file}: content hash mismatch`);
    } catch (err) { problems.push(`${e.file}: unreadable (${err.message})`); }
  }
  return { ok: problems.length === 0, problems, entries: index.entries.length };
}

// The canonical scan for a date = the latest scan whose data quality is OK. If none is OK the
// latest scan is returned with its DATA_INSUFFICIENT classification. No scan -> MISSING_SNAPSHOT.
function statusForDate(dir, date) {
  const entries = readIndex(dir).entries.filter(e => e.scanDate === date);
  if (!entries.length) return { date, status: 'MISSING_SNAPSHOT', snapshot: null };
  const byTime = entries.slice().sort((a, b) => String(a.scanTimestamp).localeCompare(String(b.scanTimestamp)));
  const ok = byTime.filter(e => e.classification !== 'DATA_INSUFFICIENT');
  const chosen = (ok.length ? ok : byTime).slice(-1)[0];
  return { date, status: chosen.classification, snapshot: chosen, versions: entries.length };
}

module.exports = { SCHEMA_VERSION, ImmutableSnapshotError, canonicalJson, buildSnapshot, verifySnapshot, writeSnapshot, verifyChain, readIndex, statusForDate };
