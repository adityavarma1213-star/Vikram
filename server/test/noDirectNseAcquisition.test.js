'use strict';
// OFFLINE guard: proves direct NSE acquisition cannot come back unnoticed. Static checks only;
// it never makes a network request. See docs/NSE_ACQUISITION_REMOVED.md.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'VIKRAM DATA', 'quarantine']);
// Host names are built from parts so this file does not itself match the search it performs.
const HOSTS = new RegExp(['nse' + 'india', 'nse' + 'archives', 'nifty' + 'indices'].join('|'), 'i');
// Files that may MENTION an NSE host: evidence/provenance reports, a comment citing a circular,
// and test fixtures that use the text as a label. None of them can make a request.
const ALLOWED_MENTIONS = new Set([
  'backtest/lib/nseHolidayCalendar.js',            // comment citing an NSE circular
  'backtest/test/provenanceRequired.test.js',      // fixture string in manifest tests
  'server/test/pointInTimeUniverse.test.js',       // label string in membership test
  'server/test/noDirectNseAcquisition.test.js',    // this file
  'backtest/reports/FINAL_REPORT.json',            // preserved evidence
  'backtest/reports/download_run_summary.json',    // preserved evidence
  'backtest/reports/live_network_probe_result.txt',// preserved evidence
  'CHECKSUMS.json'                                 // preserved provenance
]);
const CODE_EXT = /\.(js|mjs|cjs|html|yml|yaml|py|sh|json|txt)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else out.push(path.join(dir, e.name));
  }
  return out;
}
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const files = walk(ROOT).filter(f => CODE_EXT.test(f));

// 1. No NSE host name in any code/config file except the allow-listed non-request mentions.
const hostHits = files.filter(f => !ALLOWED_MENTIONS.has(rel(f)) && HOSTS.test(fs.readFileSync(f, 'utf8'))).map(rel);
assert.deepEqual(hostHits, [], `NSE host name found in: ${hostHits.join(', ')}`);

// 2. Removed downloader files must stay removed.
for (const gone of ['backtest/nseDownloader.js', 'backtest/lib/httpClient.js', 'tools/vikram-lite-downloader.js']) {
  assert.ok(!fs.existsSync(path.join(ROOT, gone)), `${gone} must not exist`);
}

// 3. Removed acquisition functions must not be defined or exported anywhere in source.
const REMOVED = ['fetchCm', 'fetchFo', 'fetchUniverse', 'ingestLatest', 'ingestCm', 'ingestFo', 'runIncrementalIngest',
  'runRangeBackfill', 'fetchWithBackoff', 'fetchIndexUniverses', 'fetchCorporateActionsRaw', 'writeHistory'];
const jsFiles = files.filter(f => /\.(js|mjs|cjs)$/.test(f) && rel(f) !== 'server/test/noDirectNseAcquisition.test.js');
for (const f of jsFiles) {
  const text = fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  for (const name of REMOVED) {
    assert.ok(!new RegExp(`(function\\s+${name}\\b|\\b${name}\\s*[:,}]|\\b${name}\\s*=)`).test(text), `${name} reappears in ${rel(f)}`);
  }
}

// 4. No admin route or UI call that starts an ingest.
for (const f of files.filter(f => /\.(js|html)$/.test(f) && rel(f) !== 'server/test/noDirectNseAcquisition.test.js')) {
  assert.ok(!/admin\/ingest\/run/.test(fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|<!--)/.test(l)).join('\n')),
    `ingest-start route referenced in ${rel(f)}`);
}

// 5. No scheduled download: render cron, workflow schedules, package scripts.
const render = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
assert.ok(!/type:\s*cron/.test(render), 'render.yaml must not define a cron job');
for (const wf of fs.readdirSync(path.join(ROOT, '.github', 'workflows'))) {
  const t = fs.readFileSync(path.join(ROOT, '.github', 'workflows', wf), 'utf8');
  assert.ok(!/^\s*schedule:/m.test(t), `${wf} must not have a schedule trigger`);
  assert.ok(!/(backfillHistory|staticSnapshot)\.js\s*$/m.test(t.split('\n').filter(l => /^\s*run:/.test(l) || /^\s*node /.test(l)).filter(l => !/--check/.test(l)).join('\n')),
    `${wf} must not run the former acquisition scripts`);
}
for (const pj of ['server/package.json', 'backtest/package.json', 'package.json']) {
  const p = path.join(ROOT, pj); if (!fs.existsSync(p)) continue;
  const scripts = JSON.parse(fs.readFileSync(p, 'utf8')).scripts || {};
  for (const [k, v] of Object.entries(scripts)) {
    assert.ok(!/^(ingest|download|backfill)/.test(k), `${pj} script "${k}" looks like an acquisition command`);
    assert.ok(!/nseDownloader|ingest\.js|backfillHistory\.js|staticSnapshot\.js/.test(v.replace(/node test\/[^&]*/g, '')), `${pj} script "${k}" runs an acquisition file`);
  }
}

// 6. Source folders (excluding tests) must not call fetch/http(s) against a literal non-allowlisted URL.
const SRC_DIRS = ['server/src', 'backtest', 'scripts', 'tools', 'accumulation'];
const ALLOWED_NON_NSE_URL_FILES = new Set(['server/src/liveData/tokenManager.js', 'server/src/liveData/indstocksClient.js', 'server/src/alerts/providers/email.js', 'server/src/index.js']);
for (const d of SRC_DIRS) {
  for (const f of walk(path.join(ROOT, d)).filter(f => /\.(js|mjs|cjs|py)$/.test(f) && !/[\\/]test[\\/]|\.test\./.test(f))) {
    const t = fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|#)/.test(l)).join('\n');
    if (/https?:\/\//.test(t)) assert.ok(ALLOWED_NON_NSE_URL_FILES.has(rel(f)), `unexpected URL literal in ${rel(f)}`);
    assert.ok(!/require\(['"](node:)?https?['"]\)/.test(t), `raw http(s) client in ${rel(f)}`);
  }
}
console.log('noDirectNseAcquisition.test.js passed (offline static guard)');
