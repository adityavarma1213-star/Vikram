'use strict';
// OFFLINE deep guard on the REAL repository. Rules and limits: see lib/nseProhibitionScanner.js and
// docs/NSE_ACQUISITION_REMOVED.md. Never makes a request.
const assert = require('node:assert/strict');
const path = require('path');
const { scan } = require('./lib/nseProhibitionScanner');

const ROOT = path.resolve(__dirname, '..', '..');
const v = scan(ROOT);
const labels = {
  host: 'NSE host name (even split/obfuscated) found in code or config',
  net: 'Unreviewed network/process primitive in source (add to ALLOWED_NETWORK only after review)',
  fe: 'Frontend fetches an absolute external URL',
  sched: 'Scheduler artefact found',
  wf: 'Workflow command or trigger not allowed',
  cfg: 'Config/env switch for an NSE data provider or acquisition',
  removed: 'Removed downloader file came back'
};
for (const k of Object.keys(labels)) assert.deepEqual(v[k], [], `${labels[k]}:\n  ${v[k].join('\n  ')}`);
console.log('nseProhibitionDeep.test.js passed (offline static audit of the real repository)');
