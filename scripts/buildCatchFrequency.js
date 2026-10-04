#!/usr/bin/env node
'use strict';
// Builds daily/weekly/monthly catch-frequency from the immutable snapshots.
// Expected sessions = trading dates in data/market-history from the first snapshot onward.
// A session with no snapshot is MISSING_SNAPSHOT (never zero).
// Usage: node scripts/buildCatchFrequency.js [--dir data/v15-snapshots] [--out data/v15-catch-frequency.json]
const fs = require('fs');
const path = require('path');
const { statusForDate } = require('../server/src/v15SnapshotStore');
const { buildCatchFrequency } = require('../server/src/catchFrequency');

const root = path.resolve(__dirname, '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };

function main() {
  const dir = path.resolve(root, arg('--dir', 'data/v15-snapshots'));
  const out = path.resolve(root, arg('--out', 'data/v15-catch-frequency.json'));
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const first = index.entries.map(e => e.scanDate).sort()[0];
  const sessions = fs.readdirSync(path.join(root, 'data/market-history')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).filter(d => d >= first).sort();
  const records = sessions.map(date => {
    const st = statusForDate(dir, date);
    if (!st.snapshot) return { date, status: 'MISSING_SNAPSHOT' };
    const snap = JSON.parse(fs.readFileSync(path.join(dir, st.snapshot.file), 'utf8'));
    return { date, status: st.status, scanned: snap.counts.scanned, starting: snap.counts.starting, confirmed: snap.counts.confirmed, confirmedSymbols: snap.confirmedSymbols, source: snap.provenance && snap.provenance.source };
  });
  const result = { schema: 'v15-catch-frequency/1', firstSnapshotDate: first, sessions: records.length, ...buildCatchFrequency(records) };
  fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  const c = {}; for (const r of records) c[r.status] = (c[r.status] || 0) + 1;
  console.log(`wrote ${path.relative(root, out)} statuses=${JSON.stringify(c)}`);
}
if (require.main === module) main();
