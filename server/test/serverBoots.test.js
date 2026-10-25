'use strict';
// OFFLINE smoke test: the server entry point must load without throwing (e.g. ReferenceError for a
// removed import). It starts src/index.js with a dummy, unreachable database URL on a random local
// port, waits briefly, and kills it. No database, no NSE access, no outside network.
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const port = String(41000 + Math.floor(Math.random() * 2000));
const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
  cwd: path.join(__dirname, '..'),
  env: {
    PATH: process.env.PATH,
    PORT: port,
    AUTH_SECRET: 'offline-smoke-test-secret-0123456789',
    DATABASE_URL: 'postgres://nobody:nopass@127.0.0.1:1/none',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let out = '';
let err = '';
child.stdout.on('data', d => { out += d; });
child.stderr.on('data', d => { err += d; });

let finished = false;
child.on('exit', (code, signal) => {
  if (finished) return;
  finished = true;
  console.error(err.split('\n').slice(0, 12).join('\n'));
  assert.fail(`server exited early (code=${code}, signal=${signal}) instead of staying up`);
});

setTimeout(() => {
  if (finished) return;
  finished = true;
  const crashed = /ReferenceError|SyntaxError|Cannot find module|is not defined/.test(err);
  child.kill('SIGKILL');
  assert.ok(!crashed, `server logged a load error: ${err.slice(0, 300)}`);
  assert.ok(/listening on/.test(out), 'server never reported that it is listening');
  console.log('serverBoots.test.js passed (server entry point loads and listens; offline, no database)');
  process.exit(0);
}, 3000);
