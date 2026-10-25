'use strict';
// OFFLINE static audit (no network, no database). Complements noDirectNseAcquisition.test.js:
//   1. no acquisition-only dependency (zip/bhavcopy unpacker) is declared
//   2. operator docs do not tell anyone to run or schedule an ingest/download job
//   3. the backend route table has no mutating admin/ingest/backfill/download/acquire route
//   4. the frontend fetches only local stored data or the known API routes
//   5. every module reachable from server/src/index.js has no raw network or process-spawn use
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripLineComments = t => t.split('\n').filter(l => !/^\s*(\/\/|\*|#|<!--)/.test(l)).join('\n');

// 1. Dependencies
for (const pj of ['package.json', 'server/package.json', 'backtest/package.json']) {
  if (!fs.existsSync(path.join(ROOT, pj))) continue;
  const j = JSON.parse(read(pj));
  const deps = Object.assign({}, j.dependencies, j.devDependencies, j.optionalDependencies);
  for (const bad of ['unzipper', 'adm-zip', 'yauzl', 'puppeteer', 'playwright', 'axios', 'node-fetch', 'got', 'undici', 'cheerio', 'node-cron', 'cron']) {
    assert.ok(!(bad in deps), `${pj} declares acquisition-type dependency "${bad}"`);
  }
}

// 2. Operator documentation (deployment docs must not instruct a run/schedule of ingest)
const docsDir = path.join(ROOT, 'docs', 'deployment');
for (const f of fs.readdirSync(docsDir).filter(n => /\.md$/.test(n))) {
  const t = fs.readFileSync(path.join(docsDir, f), 'utf8');
  assert.ok(!/node\s+(src\/)?(ingest|backfillHistory)\.js/.test(t), `docs/deployment/${f} tells an operator to run an ingest script`);
  assert.ok(!/^\s*[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+.*(ingest|backfill|download)/mi.test(t), `docs/deployment/${f} contains an ingest cron entry`);
}

// 3. Backend routes (static parse of the Express route table)
const indexSrc = stripLineComments(read('server/src/index.js'));
const routes = [...indexSrc.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(m => ({ method: m[1], url: m[2] }));
assert.ok(routes.length > 10, 'route table parse failed');
for (const r of routes) {
  assert.ok(!/(ingest(?!ion-runs)|backfill|download|acquire|refresh|scrape|bhavcopy)/i.test(r.url), `acquisition-like route: ${r.method.toUpperCase()} ${r.url}`);
  if (/^\/api\/admin\//.test(r.url)) assert.equal(r.method, 'get', `admin route must be read-only: ${r.method.toUpperCase()} ${r.url}`);
}

// 4. Frontend fetch targets
const allowedFetch = [/^['"`]data\//, /^API_BASE\s*\+\s*['"]\/api\/auth\/(login|register)['"]/, /^url$/, /^API_BASE\s*\+\s*path/, /^`data\//];
for (const f of ['js/nseData.js', 'nse-data.html']) {
  const t = stripLineComments(read(f));
  assert.ok(!/(ingest\/run|\/backfill|\/download-nse|acquire)/i.test(t.replace(/Acquire[^'"`<]*no longer[^'"`<]*/gi, '')), `${f} references an acquisition endpoint`);
  for (const m of t.matchAll(/\bfetch\(\s*([^,)]+)/g)) {
    assert.ok(allowedFetch.some(rx => rx.test(m[1].trim())), `${f} fetches an unexpected target: ${m[1].trim()}`);
  }
  for (const m of t.matchAll(/authedFetch\(\s*(['"`][^'"`]+['"`])/g)) {
    assert.ok(/\/api\/admin\/ingestion-runs/.test(m[1]), `${f} calls unexpected API route ${m[1]}`);
  }
}

// 5. Call graph: everything reachable from the server entry point
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const t = stripLineComments(fs.readFileSync(file, 'utf8'));
  for (const m of t.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1];
    if (/^(node:)?(https?|net|tls|http2|child_process|worker_threads|cluster|dgram)$/.test(spec)) {
      assert.fail(`${path.relative(ROOT, file)} requires "${spec}" (raw network / process spawn)`);
    }
    if (spec.startsWith('.')) {
      const base = path.resolve(path.dirname(file), spec);
      const hit = [base, base + '.js', path.join(base, 'index.js')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (hit) visit(hit);
    }
  }
  assert.ok(!/\b(setInterval|node-cron)\b/.test(t), `${path.relative(ROOT, file)} schedules background work`);
}
visit(path.join(ROOT, 'server', 'src', 'index.js'));
assert.ok(seen.size > 10, 'call-graph walk found too few modules');
const reached = [...seen].map(f => path.relative(ROOT, f).split(path.sep).join('/'));
assert.ok(!reached.includes('server/src/backfillHistory.js'), 'server entry point reaches backfillHistory.js');
assert.ok(!reached.includes('server/src/staticSnapshot.js'), 'server entry point reaches staticSnapshot.js');

console.log(`noAcquisitionPaths.test.js passed (offline static audit; ${routes.length} routes, ${seen.size} modules reachable from server entry)`);
