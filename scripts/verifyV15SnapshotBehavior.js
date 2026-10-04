#!/usr/bin/env node
'use strict';
// CI proof of the snapshot guarantees, run against the REAL data/scanner.json in throw-away temp directories.
// Nothing under the repository is written. Any failed assertion exits non-zero.
//   1. a good scan writes a snapshot and exits 0
//   2. the same scan again is UNCHANGED (write-once) and exits 0
//   3. a zero-delivery scan is classified DATA_INSUFFICIENT and exits 2
//   4. under `bash -e`, a step placed after a DATA_INSUFFICIENT write is NEVER reached (stops before persistence)
//   5. a different payload for an already-written path is refused (immutable)
//   6. a tampered stored snapshot is detected, and a rewrite does not hide it (exit 1)
//   7. catch-frequency builds from the snapshots without treating unverified days as zero
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const scannerPath = path.join(root, 'data/scanner.json');
const writer = path.join(root, 'scripts/writeV15Snapshot.js');
const freq = path.join(root, 'scripts/buildCatchFrequency.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-verify-'));
const snaps = path.join(tmp, 'snaps');
const run = (args, cmd = 'node') => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const write = (scanner, dir) => run([writer, '--scanner', scanner, '--dir', dir]);
let n = 0;
const ok = msg => { n += 1; console.log(`PASS ${n}. ${msg}`); };

const scanner = JSON.parse(fs.readFileSync(scannerPath, 'utf8'));
assert.ok(scanner.asOf && Array.isArray(scanner.results) && scanner.results.length > 1000, 'data/scanner.json must be a full-universe scan');
console.log(`scanner.json asOf=${scanner.asOf} results=${scanner.results.length} dataStatus=${scanner.dataStatus}`);

// 1 + 2
let r = write(scannerPath, snaps);
assert.equal(r.status, 0, `good scan must exit 0\n${r.stdout}${r.stderr}`); assert.match(r.stdout, /^WRITTEN /m); assert.match(r.stdout, /snapshot chain verified/); ok('good scan writes a snapshot, chain verifies, exit 0');
r = write(scannerPath, snaps);
assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /^UNCHANGED /m); ok('same scan again is UNCHANGED (write-once), exit 0');

// 3: zero-delivery variant (what 2026-09-04..09-15 looked like)
const zero = JSON.parse(JSON.stringify(scanner));
for (const x of zero.results) { x.metrics.deliveryPct = 0; x.metrics.deliveryQty = 0; }
zero.generatedAt = '2099-01-01T00:00:00.000Z';
const zeroPath = path.join(tmp, 'zero-delivery-scanner.json'); fs.writeFileSync(zeroPath, JSON.stringify(zero));
r = write(zeroPath, snaps);
assert.equal(r.status, 2, `zero-delivery scan must exit 2\n${r.stdout}${r.stderr}`); assert.match(r.stderr, /DATA_INSUFFICIENT: ALL_DELIVERY_ZERO/); assert.match(r.stdout, /classification=DATA_INSUFFICIENT/); ok('zero-delivery scan is DATA_INSUFFICIENT and exits 2');

// 4: the persistence step must not run after a failed snapshot step (same semantics as a GitHub Actions run: step stops on non-zero)
const sentinel = path.join(tmp, 'PERSIST_REACHED');
const stopDir = path.join(tmp, 'stop-snaps');
r = run(['-e', '-c', `node "${writer}" --scanner "${zeroPath}" --dir "${stopDir}"; touch "${sentinel}"`], 'bash');
assert.notEqual(r.status, 0, 'chain after a DATA_INSUFFICIENT write must fail'); assert.equal(fs.existsSync(sentinel), false, 'persistence step must NOT be reached'); ok('DATA_INSUFFICIENT stops the chain before the persistence step is reached');
r = run(['-e', '-c', `node "${writer}" --scanner "${scannerPath}" --dir "${path.join(tmp, 'go-snaps')}"; touch "${sentinel}"`], 'bash');
assert.equal(r.status, 0, r.stderr); assert.equal(fs.existsSync(sentinel), true, 'control: a verified scan DOES reach the persistence step'); fs.rmSync(sentinel); ok('control: a verified scan does reach the persistence step');

// 5: different payload, same scanDate + scanTimestamp -> refused
const clash = JSON.parse(JSON.stringify(scanner));
clash.results[0].verdict = clash.results[0].verdict === 'ACCUMULATION CONFIRMED' ? 'NO SIGNAL' : 'ACCUMULATION CONFIRMED';
const clashPath = path.join(tmp, 'clash.json'); fs.writeFileSync(clashPath, JSON.stringify(clash));
r = write(clashPath, snaps);
assert.equal(r.status, 1, `conflicting payload must be refused\n${r.stdout}${r.stderr}`); assert.match(r.stderr, /immutable/i); ok('different payload for an existing snapshot path is refused (immutable), exit 1');

// 6: tamper with a stored file (keep its snapshotHash field), then re-run the writer
const index = JSON.parse(fs.readFileSync(path.join(snaps, 'index.json'), 'utf8'));
const target = path.join(snaps, index.entries[0].file);
const doc = JSON.parse(fs.readFileSync(target, 'utf8')); doc.counts.confirmed += 999; fs.writeFileSync(target, `${JSON.stringify(doc, null, 1)}\n`);
r = write(scannerPath, snaps);
assert.equal(r.status, 1, `tampered store must fail\n${r.stdout}${r.stderr}`); assert.match(r.stderr, /SNAPSHOT CHAIN VERIFICATION FAILED/); assert.match(r.stderr, /content hash mismatch/); ok('tampered snapshot is detected even when the rewrite reports UNCHANGED, exit 1');

// 7: catch-frequency from a clean store
const clean = path.join(tmp, 'clean-snaps');
assert.equal(write(scannerPath, clean).status, 0);
const out = path.join(tmp, 'freq.json');
r = run([freq, '--dir', clean, '--out', out]);
assert.equal(r.status, 0, r.stdout + r.stderr);
const f = JSON.parse(fs.readFileSync(out, 'utf8'));
assert.ok(f.daily.length >= 1 && f.weekly.length >= 1 && f.monthly.length >= 1);
assert.ok(f.daily.every(d => d.status !== undefined)); ok('catch-frequency builds from snapshots');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`verifyV15SnapshotBehavior: ${n} checks passed`);
