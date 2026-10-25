'use strict';
// OFFLINE regression fixtures for the NSE prohibition scanner. Every case is built from harmless text in a
// temporary folder; the files are only SCANNED, never executed, and nothing contacts NSE.
//   * 20 prohibited cases must each be flagged by the rule that is expected to catch them
//   * the approved clean baseline and legitimate offline/local cases must produce NO violations
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('./lib/nseProhibitionScanner');

const H1 = 'nse' + 'india';
const H2 = 'nse' + 'archives';
const WF = (extra) => 'name: t\non:\n' + (extra.on || '  push:\n    branches: [main]\n') + 'jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n' + extra.steps;

// approved clean baseline (small stand-in for the real tree; includes legitimate users the allow-list covers)
const CLEAN = {
  'render.yaml': 'services:\n  - type: web\n    name: vikram-api\n    startCommand: node server/src/index.js\n',
  '.github/workflows/ci.yml': WF({ steps: '      - run: npm ci\n      - run: node --check server/src/index.js\n      - run: node scripts/buildNseCoverageReport.js\n      - run: |\n          node test/a.test.js\n          node scripts/verifyV15SnapshotBehavior.js\n' }),
  'server/src/index.js': "const express = require('express');\nmodule.exports = express;\n",
  'server/src/liveData/indstocksClient.js': 'module.exports = async u => fetch(u); // reviewed third-party provider (allow-listed)\n',
  'scripts/reconstructSnapshotsFromGit.js': "const { execFileSync } = require('child_process');\nexecFileSync('git', ['log']);\n",
  'js/app.js': "fetch('data/scanner.json').then(r => r.json());\n",
  'docs/policy.md': 'VIKRAM must never download from ' + H1 + '.com. Documents are not scanned.\n'
};
// legitimate extras that must NOT be flagged
const LEGIT = {
  L1: { 'scripts/analyse.js': "const fs = require('fs');\nconst rows = fs.readFileSync('data/x.csv', 'utf8').split('\\n');\nconsole.log(rows.length);\n" },
  L2: { 'tools/summarise.py': 'import csv, json\nrows = list(csv.reader(open("data/x.csv")))\nprint(len(rows))\n' },
  L3: { 'accumulation/engine.js': 'module.exports = { score: x => x * 2 };\n' },
  L4: { 'js/more.js': "fetch(`data/market-history/${'d'}.json`);\n" },
  L5: { 'server/src/config.js': 'module.exports = { port: process.env.PORT || 3000, db: process.env.DATABASE_URL };\n' },
  L6: { '.github/workflows/tests.yml': WF({ steps: '      - run: cd server && npm ci\n      - run: npm test\n' }) }
};
// the 20 prohibited cases: files to add (+ text appended to existing files) and the rule that must fire
const BAD = [
  ['F1a', 'direct NSE request via https', { 'server/src/fx.js': "const https = require('https');\nhttps.get('https://www." + H1 + ".com/api/x');\n" }, {}, 'host'],
  ['F1b', 'direct NSE request via global fetch', { 'server/src/fx.js': "module.exports = () => fetch('https://" + H2 + '.' + H1 + ".com/a.zip');\n" }, {}, 'host'],
  ['F1c', 'NSE host split into parts', { 'server/src/fx.js': "const h = ['www', 'nse' + 'india', 'com'].join('.');\nmodule.exports = () => fetch('https://' + h);\n" }, {}, 'host'],
  ['F2a', 'node wrapper runs curl on an env URL', { 'scripts/fx.js': "const { execFileSync } = require('child_process');\nexecFileSync('curl', [process.env.SRC_URL]);\n" }, {}, 'net'],
  ['F2b', 'shell wrapper runs curl on an env URL', { 'scripts/fx.sh': '#!/bin/sh\ncurl -sL "$SRC_URL" -o out.zip\n' }, {}, 'net'],
  ['F2c', 'python downloader with requests', { 'scripts/fx.py': "import os, requests\nrequests.get(os.environ['SRC_URL'])\n" }, {}, 'net'],
  ['F3a', 'workflow with a cron schedule', { '.github/workflows/fx.yml': WF({ on: "  schedule:\n    - cron: '0 1 * * *'\n", steps: '      - run: npm ci\n' }) }, {}, 'wf'],
  ['F3b', 'render worker', {}, { 'render.yaml': '  - type: worker\n    name: fx\n    startCommand: node scripts/fx.js\n' }, 'sched'],
  ['F3c', 'setInterval polling loop in server code', { 'server/src/fx.js': 'setInterval(() => fetch(process.env.SRC_URL), 3600000);\n' }, {}, 'sched'],
  ['F3d', 'systemd timer and service', { 'deploy/fx.timer': '[Timer]\nOnCalendar=daily\n', 'deploy/fx.service': '[Service]\nExecStart=/usr/bin/node /srv/fx.js\n' }, {}, 'sched'],
  ['F3e', 'crontab text file', { 'deploy/crontab.txt': '30 13 * * 1-5 node /srv/vikram/scripts/fx.js\n' }, {}, 'sched'],
  ['F4a', 'workflow curl to a literal NSE host', { '.github/workflows/fx.yml': WF({ steps: '      - run: curl -sL https://' + H2 + '.' + H1 + '.com/x -o x.zip\n' }) }, {}, 'host'],
  ['F4b', 'workflow runs a new downloader script', { '.github/workflows/fx.yml': WF({ steps: '      - run: node scripts/fx.js\n' }) }, {}, 'wf'],
  ['F4c', 'workflow runs an old script name', { '.github/workflows/fx.yml': WF({ steps: '      - run: node server/src/backfillHistory.js\n' }) }, {}, 'wf'],
  ['F5a', 'old downloader file name returns', { 'tools/vikram-lite-downloader.js': '// fixture\n' }, {}, 'removed'],
  ['F5b', 'renamed downloader with literal host', { 'backtest/lib/marketFetcher.js': "module.exports = 'https://" + H2 + '.' + H1 + ".com/c';\n" }, {}, 'host'],
  ['F5c', 'renamed fetcher using env URL and global fetch', { 'server/src/fx.js': "module.exports = async d => (await fetch(process.env.SRC_BASE + '/' + d)).text();\n" }, {}, 'net'],
  ['F5d', 'new HTTP client library (undici)', { 'server/src/fx.js': "const { request } = require('undici');\nmodule.exports = u => request(u);\n" }, {}, 'net'],
  ['F6a', 'render env var selecting an NSE provider', {}, { 'render.yaml': '    envVars:\n      - key: DATA_PROVIDER\n        value: ' + 'NSE' + '_DIRECT\n' }, 'cfg'],
  ['F6b', 'config module selecting an NSE provider', { 'server/src/fx.js': "module.exports = { provider: process.env.DATA_PROVIDER || 'x' };\n" }, {}, 'cfg']
];

function build(extraFiles, appendFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nseguard-'));
  const put = (rel, text, append) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (append) fs.appendFileSync(p, text); else fs.writeFileSync(p, text);
  };
  for (const [r, t] of Object.entries(CLEAN)) put(r, t);
  for (const [r, t] of Object.entries(extraFiles || {})) put(r, t);
  for (const [r, t] of Object.entries(appendFiles || {})) put(r, t, true);
  return dir;
}
const rm = d => fs.rmSync(d, { recursive: true, force: true });

// 1. approved clean baseline: zero violations
let dir = build();
try { const v = scan(dir); assert.equal(v.total, 0, 'clean baseline must have no violations:\n' + JSON.stringify(v, null, 1)); } finally { rm(dir); }

// 2. legitimate offline / local cases: zero violations (no false positives)
for (const [id, files] of Object.entries(LEGIT)) {
  dir = build(files);
  try { const v = scan(dir); assert.equal(v.total, 0, id + ' (legitimate case) was wrongly flagged:\n' + JSON.stringify(v, null, 1)); } finally { rm(dir); }
}

// 3. the 20 prohibited cases: each must be flagged by the expected rule
const results = [];
for (const [id, desc, files, append, rule] of BAD) {
  dir = build(files, append);
  try {
    const v = scan(dir);
    assert.ok(v[rule].length > 0, id + ' (' + desc + ') was NOT caught by rule "' + rule + '". Found: ' + JSON.stringify(v));
    results.push(id);
  } finally { rm(dir); }
}
assert.equal(results.length, 20, 'all 20 prohibited cases must be exercised');
console.log('nseProhibitionFixtures.test.js passed (20 prohibited cases caught, clean baseline and ' + Object.keys(LEGIT).length + ' legitimate cases not flagged)');
