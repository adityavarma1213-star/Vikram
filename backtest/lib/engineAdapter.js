// Wraps the ACTUAL production engine at ../../accumulation/engine.js.
// This file adds NO scoring logic of its own — it only attaches the
// provenance flags the production gate checks for, and records the exact
// SHA-256 of the engine file it loaded, so a report can prove which engine
// code produced the results.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENGINE_PATH = path.join(__dirname, '..', '..', 'accumulation', 'engine.js');
const engineSource = fs.readFileSync(ENGINE_PATH, 'utf8');
const engineSha256 = crypto.createHash('sha256').update(engineSource).digest('hex');

// eslint-disable-next-line import/no-dynamic-require, global-require
const realEngine = require(ENGINE_PATH);

if (typeof realEngine.evaluate !== 'function') {
  throw new Error(`FATAL: ${ENGINE_PATH} does not export an evaluate() function. Cannot integrate real VIKRAM engine.`);
}

module.exports = {
  evaluate: realEngine.evaluate,
  is_production_vikram: true,
  is_synthetic: false,
  source_file: path.relative(path.join(__dirname, '..', '..'), ENGINE_PATH),
  source_sha256: engineSha256
};
