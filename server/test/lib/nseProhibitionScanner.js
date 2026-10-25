'use strict';
// OFFLINE static scanner for the permanent rule: "VIKRAM must never download, scrape or automatically
// fetch data from NSE-hosted sites". It never makes a request and never executes scanned files.
// scan(root) returns the violations found, grouped by rule:
//   host     NSE host names, even when split or joined in code ('nse'+'india')
//   net      network / process-spawn primitives outside the reviewed allow-list
//   fe       frontend code fetching an absolute external URL
//   sched    schedulers: timers, services, crontab lines, render worker/cron, node-cron, server setInterval
//   wf       workflow schedules, banned words in run commands, unreviewed script runs
//   cfg      environment/config switches that select an NSE provider or enable acquisition
//   removed  removed downloader files that came back
// Adding a new legitimate network user means adding it to ALLOWED_NETWORK ON PURPOSE, in review.
const fs = require('fs');
const path = require('path');

// Host names are built from parts so this file does not match its own search.
const HOST_PARTS = ['nse' + 'india', 'nse' + 'archives', 'nifty' + 'indices'];
const HOST = new RegExp(HOST_PARTS.join('|'));

const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'VIKRAM DATA', 'quarantine']);
const SKIP_PREFIX = ['backtest/data/', 'backtest/recovered/', 'backtest/reports/', 'docs/'];
const TEXT = /\.(js|mjs|cjs|ts|py|sh|yml|yaml|html|json|toml|service|timer|txt|cron|crontab)$|(^|\/)(Dockerfile|crontab|\.env[^/]*)$/;

// Files that may contain the host-name text without being able to make a request.
const HOST_ALLOWED = new Set([
  'server/test/noDirectNseAcquisition.test.js',
  'server/test/nseProhibitionDeep.test.js',
  'server/test/nseProhibitionFixtures.test.js',
  'server/test/lib/nseProhibitionScanner.js',
  'backtest/test/provenanceRequired.test.js',
  'server/test/pointInTimeUniverse.test.js'
]);

// Reviewed network / process users: file -> why it is allowed.
const ALLOWED_NETWORK = {
  'server/src/liveData/indstocksClient.js': 'licensed third-party broker API (not NSE-hosted); gated by LIVE_MARKET_DATA_ENABLED',
  'server/src/liveData/instrumentMapping.js': 'same third-party provider instrument list; gated',
  'server/src/liveData/tokenManager.js': 'same third-party provider token call; gated',
  'server/src/alerts/providers/email.js': 'Resend e-mail API',
  'scripts/reconstructSnapshotsFromGit.js': 'runs local git only',
  'scripts/verifyV15SnapshotBehavior.js': 'spawns local node tests only',
  'tools/repair_data_surfaces.py': 'JS text kept in a .py file; fetches local data/scanner.json only'
};
const FRONTEND = /^(js\/|accumulation\/api\.js$|sw\.js$|index\.html$|nse-data\.html$|[a-z-]+\.html$|[A-Za-z]+Engine\.js$|ui\.js$|app\.js$)/;

const NET = /require\(\s*['"](node:)?(https?|net|tls|http2|dgram|child_process|worker_threads|undici|axios|got|node-fetch|superagent|needle|request|puppeteer|playwright|cheerio|unzipper|adm-zip|yauzl)['"]\s*\)|from\s+['"](undici|axios|got|node-fetch|puppeteer|playwright)['"]|\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bimport\s+(requests|httpx|aiohttp|urllib|selenium)|\b(requests|httpx|urllib\.request)\.[a-z]+\(|\b(curl|wget)\b|\b(execSync|execFileSync|spawnSync|spawn|fork)\s*\(|\b(cp|child_process|childProcess)\.exec\s*\(/;

const SCRIPT_OK = [/\.test\.js$/, /^scripts\/(buildNseCoverageReport|verifyV15SnapshotBehavior)\.js$/, /^backtest\/scripts\/buildResearchIntelligence\.js$/,
  /^(server\/)?src\/(migrate|index)\.js$/, /^[\w./-]*(repair|remove|apply|patch|fix)[\w./-]*\.(js|mjs|py)$/i];

const REMOVED_FILES = ['backtest/nseDownloader.js', 'backtest/lib/httpClient.js', 'tools/vikram-lite-downloader.js'];

const isTest = r => /(^|\/)(test|tests)\//.test(r) || /\.test\.(js|mjs|cjs)$|_test\.py$/.test(r);
const isComment = l => /^\s*(\/\/|\*|\/\*|#|<!--)/.test(l);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); } else out.push(p);
  }
  return out;
}

function scan(root, opts = {}) {
  const allowedNetwork = opts.allowedNetwork || ALLOWED_NETWORK;
  const hostAllowed = opts.hostAllowed || HOST_ALLOWED;
  const rel = f => path.relative(root, f).split(path.sep).join('/');
  const read = f => fs.readFileSync(f, 'utf8');
  const codeLines = f => read(f).split('\n').map((t, i) => ({ t, n: i + 1 })).filter(x => !isComment(x.t));
  const files = walk(root).filter(f => {
    const r = rel(f);
    if (SKIP_PREFIX.some(p => r.startsWith(p))) return false;
    if (/package-lock\.json$|^CHECKSUMS\.json$/.test(r)) return false;
    if (!TEXT.test(r)) return false;
    if (r.endsWith('.json') && fs.statSync(f).size > 300000) return false;
    return true;
  });
  const v = { host: [], net: [], fe: [], sched: [], wf: [], cfg: [], removed: [] };

  // host names, tolerant of string splitting (each code line reduced to letters+digits)
  for (const f of files) {
    const r = rel(f);
    if (hostAllowed.has(r)) continue;
    for (const { t, n } of codeLines(f)) if (HOST.test(t.toLowerCase().replace(/[^a-z0-9]/g, ''))) v.host.push(`${r}:${n}`);
  }
  // network / spawn primitives outside tests, outside the frontend, outside the allow-list
  for (const f of files) {
    const r = rel(f);
    if (isTest(r) || allowedNetwork[r] || FRONTEND.test(r) || !/\.(js|mjs|cjs|ts|py|sh)$/.test(r)) continue;
    for (const { t, n } of codeLines(f)) if (NET.test(t)) v.net.push(`${r}:${n}  ${t.trim().slice(0, 70)}`);
  }
  // frontend: only local data files or the app's own API, never an absolute external URL
  for (const f of files) {
    const r = rel(f);
    if (!FRONTEND.test(r) || isTest(r) || !/\.(js|html)$/.test(r)) continue;
    for (const { t, n } of codeLines(f)) for (const m of t.matchAll(/\bfetch\(\s*(['"`])(https?:\/\/[^'"`]+)/g)) v.fe.push(`${r}:${n} ${m[2].slice(0, 60)}`);
  }
  // schedulers
  for (const f of files) {
    const r = rel(f);
    if (/\.(timer|cron|crontab)$|(^|\/)crontab$/.test(r)) v.sched.push(`${r} (scheduler file)`);
    if (/\.service$/.test(r)) v.sched.push(`${r} (systemd service file)`);
  }
  for (const f of files) {
    const r = rel(f);
    if (!/\.(txt|cron|sh)$/.test(r) || isTest(r)) continue;
    for (const { t, n } of codeLines(f)) if (/^\s*[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+\S+/.test(t)) v.sched.push(`${r}:${n} crontab-style line`);
  }
  const renderPath = path.join(root, 'render.yaml');
  if (fs.existsSync(renderPath)) for (const m of read(renderPath).matchAll(/type:\s*(cron|worker|pserv|job)\b/g)) v.sched.push(`render.yaml has "type: ${m[1]}" (only the web service is allowed)`);
  for (const f of files) {
    const r = rel(f);
    if (isTest(r) || !/\.(js|mjs|cjs)$/.test(r) || FRONTEND.test(r)) continue;
    if (/^(server|scripts|tools|backtest|accumulation)\//.test(r)) {
      for (const { t, n } of codeLines(f)) if (/node-cron|\bsetInterval\s*\(|\bcrontab\b|agenda|bull\b|bree\b/.test(t)) v.sched.push(`${r}:${n} background scheduling`);
    }
  }
  // workflows
  const wfDir = path.join(root, '.github', 'workflows');
  const banned = new RegExp('\\b(curl|wget|' + HOST_PARTS.join('|') + '|ingest|backfill|download|bhav)', 'i');
  if (fs.existsSync(wfDir)) {
    for (const wf of fs.readdirSync(wfDir)) {
      const lines = read(path.join(wfDir, wf)).split('\n');
      if (lines.some(l => /^\s*schedule:|^\s*-?\s*cron:/.test(l))) v.wf.push(`${wf}: has a schedule`);
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
        if (!m) continue;
        const cmds = [];
        if (/^[|>][-+]?\s*$/.test(m[2])) {
          const ind = lines[i + 1] ? lines[i + 1].match(/^(\s*)/)[1].length : 0;
          for (let j = i + 1; j < lines.length && lines[j].match(/^(\s*)/)[1].length >= ind && lines[j].trim(); j++) cmds.push(lines[j].trim());
        } else cmds.push(m[2].trim());
        for (const c of cmds) {
          const benign = /\.test\.js\b/.test(c) || /^node --check\b/.test(c) || (/^[\w./ \\-]+\.js\s*\\?$/.test(c) && !/^(node|python)/.test(c));
          if (!benign && banned.test(c)) v.wf.push(`${wf}: run "${c.slice(0, 60)}"`);
          else {
            const sm = c.match(/^(?:node|python3?)\s+(?!--check|--version|-e\b|-m\b|-\s|-$)(?:--[\w-]+\s+)*(\S+\.(?:js|mjs|cjs|py))\b/);
            if (sm && !SCRIPT_OK.some(rx => rx.test(sm[1].replace(/^\.\//, '')))) v.wf.push(`${wf}: unreviewed script "${sm[1]}"`);
            const nm = c.match(/^npm run ([\w:-]+)/);
            if (nm && !/^test/.test(nm[1])) v.wf.push(`${wf}: unreviewed npm script "${nm[1]}"`);
          }
        }
      }
    }
  }
  // config / environment switches
  for (const f of files) {
    const r = rel(f);
    if (isTest(r)) continue;
    for (const { t, n } of codeLines(f)) {
      if (/\b(DATA_PROVIDER|DATA_SOURCE|MARKET_DATA_PROVIDER|NSE_[A-Z_]+|ENABLE_(INGEST|DOWNLOAD|BACKFILL)[A-Z_]*|AUTO_(INGEST|DOWNLOAD|BACKFILL)[A-Z_]*)\b/.test(t)) v.cfg.push(`${r}:${n}  ${t.trim().slice(0, 70)}`);
    }
  }
  // removed downloader files
  for (const gone of REMOVED_FILES) if (fs.existsSync(path.join(root, gone))) v.removed.push(`${gone} must not exist`);
  v.total = Object.values(v).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0);
  return v;
}

module.exports = { scan, HOST_PARTS, ALLOWED_NETWORK, HOST_ALLOWED, FRONTEND, REMOVED_FILES };
