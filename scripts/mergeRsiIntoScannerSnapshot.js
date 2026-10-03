#!/usr/bin/env node
// Adds `rsi: {daily, weekly, monthly}` onto each row of data/scanner.json,
// reading from the canonical data/rsi-snapshot.json. This is additive only:
// every existing field (score, verdict, components, confirmation, metrics,
// technical.rsi14, ...) is left byte-for-byte as it already was. Run
// buildRsiSnapshot.js first.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCANNER_FILE = path.join(ROOT, 'data', 'scanner.json');
const RSI_FILE = path.join(ROOT, 'data', 'rsi-snapshot.json');

function build() {
  const scanner = JSON.parse(fs.readFileSync(SCANNER_FILE, 'utf8'));
  const rsiSnapshot = JSON.parse(fs.readFileSync(RSI_FILE, 'utf8'));
  const bySymbol = rsiSnapshot.bySymbol || {};

  let matched = 0;
  for (const row of scanner.results) {
    const r = bySymbol[row.symbol];
    row.rsi = r || { daily: { value: null, direction: null, zone: null, asOf: null },
                      weekly: { value: null, direction: null, zone: null, asOf: null },
                      monthly: { value: null, direction: null, zone: null, asOf: null } };
    if (r) matched += 1;
  }
  scanner.rsiMeta = {
    source: 'Canonical RSI engine (js/rsiEngine.js) — informational only, not a V15 input',
    asOf: rsiSnapshot.asOf,
    generatedAt: rsiSnapshot.generatedAt,
    rsiPeriod: rsiSnapshot.rsiPeriod,
    matchedSymbols: matched,
    totalSymbols: scanner.results.length
  };
  fs.writeFileSync(SCANNER_FILE, JSON.stringify(scanner));
  console.log(`scanner.json: rsi attached to ${matched}/${scanner.results.length} rows`);
}

if (require.main === module) build();
module.exports = { build };
