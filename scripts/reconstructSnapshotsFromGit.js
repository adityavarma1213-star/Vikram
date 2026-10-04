#!/usr/bin/env node
'use strict';
// Rebuilds immutable snapshots from historical data/scanner.json git versions.
// Only versions produced while accumulation/engine.js AND config.js equal the frozen hashes are used.
// Every snapshot is labelled provenance.source = RECONSTRUCTED_FROM_GIT with the commit SHA.
// Days whose delivery data was zero/missing are classified DATA_INSUFFICIENT by buildSnapshot.
// Usage: node scripts/reconstructSnapshotsFromGit.js [--dir data/v15-snapshots] [--since 9704b95]
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSnapshot, writeSnapshot } = require('../server/src/v15SnapshotStore');

const root = path.resolve(__dirname, '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 512 * 1024 * 1024 });
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const frozen = JSON.parse(fs.readFileSync(path.join(root, 'docs/recovery/frozen-hashes.json'), 'utf8'));

function frozenHash(key) {
  const v = frozen[key] || (frozen.files && frozen.files[key]);
  return typeof v === 'string' ? v : v && v.sha256;
}

function main() {
  const dir = path.resolve(root, arg('--dir', 'data/v15-snapshots'));
  const since = arg('--since', '9704b95');
  const engineFrozen = frozenHash('accumulation/engine.js');
  const configFrozen = frozenHash('accumulation/config.js');
  const commits = git('log', '--reverse', '--format=%H', `${since}^..HEAD`, '--', 'data/scanner.json').toString().trim().split('\n').filter(Boolean);
  const report = [];
  for (const c of commits) {
    let engine; let config;
    try { engine = sha256(git('show', `${c}:accumulation/engine.js`)); config = sha256(git('show', `${c}:accumulation/config.js`)); } catch { report.push({ commit: c.slice(0, 7), status: 'SKIPPED_NO_ENGINE_FILES' }); continue; }
    if (engine !== engineFrozen || config !== configFrozen) { report.push({ commit: c.slice(0, 7), status: 'SKIPPED_ENGINE_NOT_FROZEN_VERSION' }); continue; }
    let scanner;
    try { scanner = JSON.parse(git('show', `${c}:data/scanner.json`).toString('utf8')); } catch (e) { report.push({ commit: c.slice(0, 7), status: 'SKIPPED_UNREADABLE', error: e.message }); continue; }
    if (!scanner.asOf || !Array.isArray(scanner.results)) { report.push({ commit: c.slice(0, 7), status: 'SKIPPED_NO_RESULTS' }); continue; }
    const snapshot = buildSnapshot(scanner, {
      engineSha256: engine, configSha256: config, datasetVersion: null,
      provenance: { source: 'RECONSTRUCTED_FROM_GIT', commit: c, note: 'Rebuilt from a committed data/scanner.json; not a live-captured snapshot.' }
    });
    let r;
    try { r = writeSnapshot(dir, snapshot); } catch (e) {
      if (e.name !== 'ImmutableSnapshotError') throw e;
      // Same scanDate + scanTimestamp already stored from an earlier commit: first write wins, never overwritten.
      report.push({ commit: c.slice(0, 7), scanDate: snapshot.scanDate, scanTimestamp: snapshot.scanTimestamp, classification: snapshot.classification, confirmed: snapshot.counts.confirmed, starting: snapshot.counts.starting, status: 'SKIPPED_SAME_TIMESTAMP_ALREADY_STORED' });
      continue;
    }
    report.push({ commit: c.slice(0, 7), scanDate: snapshot.scanDate, scanTimestamp: snapshot.scanTimestamp, classification: snapshot.classification, confirmed: snapshot.counts.confirmed, starting: snapshot.counts.starting, status: r.status });
  }
  console.table(report);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'RECONSTRUCTION_REPORT.json'), `${JSON.stringify(report, null, 1)}\n`);
}
if (require.main === module) main();
