// Port of the honesty contract found in the companion scaffold package
// (src/pipeline_contract.py, src/backtest_gate.py): a real VIKRAM backtest may
// only proceed if real NSE data is present with provenance recorded, and the
// engine being used is the actual production engine, not a placeholder.
//
// AUDIT FOLLOW-UP (remediation pass): the gate previously trusted the
// manifest's self-reported status. It now re-verifies every SUCCESS+VALID
// entry against the actual files on disk (see manifestIntegrity.js) before
// trusting the record-count. This closes the exact gap AUDIT.md flagged:
// "a hand-edited manifest.json claiming fake success would currently pass
// undetected."

const { verifyManifestIntegrity } = require('./manifestIntegrity');
const { summarize } = require('./manifest');

function assertProductionEngine(engine) {
  if (engine.is_synthetic) {
    throw new Error('REFUSED: synthetic adapter cannot be used for a REAL VIKRAM backtest.');
  }
  if (!engine.is_production_vikram) {
    throw new Error('REFUSED: production VIKRAM engine is not verified. Refusing real backtest.');
  }
}

// manifestData is the RAW manifest object ({ data_provenance, entries }), not
// a pre-computed summary — this function derives the summary itself AND
// re-verifies every SUCCESS+VALID entry against the actual files on disk
// (manifestIntegrity.js) before trusting any of it. This is deliberate: a
// caller must not be able to bypass integrity checking by handing in a
// pre-massaged summary object.
function requireRealBacktest(manifestData, engine) {
  const reasons = [];
  const summary = manifestData ? summarize(manifestData) : null;

  if (!summary || summary.real_data_records <= 0) {
    reasons.push('REAL DATA REQUIRED: manifest contains no real market records.');
  }
  if (!summary || summary.data_provenance !== 'REAL_NSE') {
    reasons.push('REAL DATA REQUIRED: provenance is not REAL_NSE.');
  }
  if (!engine || !engine.is_production_vikram) {
    reasons.push('PRODUCTION VIKRAM ENGINE REQUIRED.');
  }
  if (engine && engine.is_synthetic) {
    reasons.push('SYNTHETIC ENGINE REFUSED FOR REAL BACKTEST.');
  }

  // Only worth checking file-level integrity once the basic shape looks
  // plausible — otherwise we'd be re-hashing files for a manifest we're
  // already refusing for more fundamental reasons.
  let integrity = null;
  if (manifestData && summary && summary.real_data_records > 0) {
    integrity = verifyManifestIntegrity(manifestData);
    if (!integrity.ok) {
      for (const v of integrity.violations) reasons.push(`MANIFEST INTEGRITY VIOLATION: ${v.reason}`);
    }
  }

  if (reasons.length) {
    const err = new Error(reasons.join(' '));
    err.gateFailures = reasons;
    err.integrityCheck = integrity;
    throw err;
  }

  return { summary, integrity };
}

module.exports = { assertProductionEngine, requireRealBacktest };
