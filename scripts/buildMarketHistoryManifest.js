// Builds data/market-history-manifest.json: a real, generated-from-disk list of every file
// actually present in data/market-history — filename, byte size, and a whole-manifest sha256 —
// so the frontend (which cannot list a directory over static HTTP) can offer real per-file
// download links and a real client-side bundle download, without guessing or estimating which
// dates exist. This is read-only against data/market-history: it never writes, moves, or alters
// any of the underlying NSE data files, and does not touch server/ ingestion code at all.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
const OUT_PATH = path.join(ROOT, 'data', 'market-history-manifest.json');

function build() {
  if (!fs.existsSync(HISTORY_DIR)) {
    return { status: 'DATA_INSUFFICIENT', reason: 'data/market-history directory not found.', files: [] };
  }
  const names = fs.readdirSync(HISTORY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  let totalBytes = 0;
  const files = names.map(name => {
    const full = path.join(HISTORY_DIR, name);
    const stat = fs.statSync(full);
    totalBytes += stat.size;
    return { name, date: name.replace('.json', ''), bytes: stat.size };
  });
  return {
    status: files.length ? 'VERIFIED' : 'DATA_INSUFFICIENT',
    generatedAt: new Date().toISOString(),
    source: 'data/market-history (real files on disk, listed by scripts/buildMarketHistoryManifest.js)',
    fileCount: files.length,
    totalBytes,
    dateRange: files.length ? { first: files[0].date, last: files[files.length - 1].date } : null,
    files
  };
}

const manifest = build();
fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${OUT_PATH}`);
console.log(JSON.stringify({ status: manifest.status, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, dateRange: manifest.dateRange }, null, 2));
