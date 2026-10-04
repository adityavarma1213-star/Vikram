#!/usr/bin/env node
'use strict';
// Writes one immutable V15 daily snapshot from data/scanner.json (produced by the frozen engine).
// Exit codes: 0 = snapshot written/unchanged and data quality OK
//             2 = data quality DATA_INSUFFICIENT (snapshot still written, labelled; caller must NOT publish)
//             1 = error, or the stored snapshot chain failed verification (tampered / corrupted / broken)
// Usage: node scripts/writeV15Snapshot.js [--scanner data/scanner.json] [--dir data/v15-snapshots]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSnapshot, writeSnapshot, verifyChain } = require('../server/src/v15SnapshotStore');

const root = path.resolve(__dirname, '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function datasetVersion(historyDir) {
  if (!fs.existsSync(historyDir)) return null;
  const lines = fs.readdirSync(historyDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map(f => `${f.slice(0, 10)}:${sha256(fs.readFileSync(path.join(historyDir, f)))}`);
  return sha256(Buffer.from(lines.join('\n')));
}

function rawProvenance(date) {
  const file = path.join(root, 'data/raw-archive/manifest.json');
  if (!fs.existsSync(file)) return { rawArchive: 'NOT_AVAILABLE' };
  const entries = JSON.parse(fs.readFileSync(file, 'utf8')).filter(e => e.tradeDate === date);
  return { rawArchive: entries.length ? 'PRESENT' : 'NO_ENTRY_FOR_DATE', files: entries.map(e => ({ segment: e.segment, sha256: e.sha256, byteSize: e.byteSize, acquiredAt: e.acquiredAt })) };
}

function main() {
  const scannerPath = path.resolve(root, arg('--scanner', 'data/scanner.json'));
  const dir = path.resolve(root, arg('--dir', 'data/v15-snapshots'));
  const scanner = JSON.parse(fs.readFileSync(scannerPath, 'utf8'));
  const snapshot = buildSnapshot(scanner, {
    engineSha256: sha256(fs.readFileSync(path.join(root, 'accumulation/engine.js'))),
    configSha256: sha256(fs.readFileSync(path.join(root, 'accumulation/config.js'))),
    datasetVersion: datasetVersion(path.join(root, 'data/market-history')),
    provenance: { source: 'LIVE_SCAN', ...rawProvenance(scanner.asOf) }
  });
  const result = writeSnapshot(dir, snapshot);
  console.log(`${result.status} ${path.relative(root, result.file)} scanDate=${snapshot.scanDate} classification=${snapshot.classification} confirmed=${snapshot.counts.confirmed} starting=${snapshot.counts.starting}`);
  // Re-hash every stored snapshot and the chain. An UNCHANGED rewrite must not hide a tampered file.
  const chain = verifyChain(dir);
  if (!chain.ok) { console.error(`SNAPSHOT CHAIN VERIFICATION FAILED (${chain.problems.length} problem(s)):\n  ${chain.problems.join('\n  ')}`); process.exit(1); }
  console.log(`snapshot chain verified: ${chain.entries} entries, 0 problems`);
  if (snapshot.dataQuality.status !== 'OK') { console.error(`DATA_INSUFFICIENT: ${snapshot.dataQuality.reasons.join('; ')}`); process.exit(2); }
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exit(1); } }
module.exports = { datasetVersion, rawProvenance };
