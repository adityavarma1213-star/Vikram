// Closes the exact gap found in AUDIT.md §2/§15: the production gate previously
// trusted whatever the manifest claimed about a SUCCESS+VALID entry, without
// ever re-checking that the raw file still exists, is unmodified, or that a
// normalized file was actually produced from it. This module re-derives trust
// from the actual files on disk, every time the gate runs. It never repairs
// anything — a mismatch is reported and the backtest is refused.

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./validators');

const BACKTEST_ROOT = path.join(__dirname, '..');

function expectedNormalizedPath(segment, ymd) {
  return path.join(BACKTEST_ROOT, 'data', 'normalized', segment.toLowerCase(), `${ymd}.json`);
}

// Returns { ok: boolean, violations: [{ segment, trading_date, reason }] }.
// Never throws for a routine mismatch — that is the caller's decision
// (requireRealBacktest treats any violation as fatal). Throws only for a
// manifest so structurally broken it cannot be interpreted at all.
function verifyManifestIntegrity(manifestData) {
  const violations = [];
  const entries = Object.values(manifestData.entries || {});
  const successValidEntries = entries.filter(e => e.download_status === 'SUCCESS' && e.validation_status === 'VALID');

  for (const entry of successValidEntries) {
    const { segment, trading_date: ymd, file_path: relFilePath, sha256: recordedSha } = entry;
    const label = `${segment} ${ymd}`;

    if (!relFilePath) { violations.push({ segment, trading_date: ymd, reason: `${label}: manifest entry has no file_path recorded` }); continue; }
    const absFilePath = path.join(BACKTEST_ROOT, relFilePath);

    if (!fs.existsSync(absFilePath)) {
      violations.push({ segment, trading_date: ymd, reason: `${label}: raw file MISSING at ${relFilePath} — manifest claims SUCCESS+VALID but the file is gone` });
      continue;
    }

    if (!recordedSha) {
      violations.push({ segment, trading_date: ymd, reason: `${label}: manifest entry has no recorded SHA-256 to verify against` });
      continue;
    }

    const actualBytes = fs.readFileSync(absFilePath);
    const actualSha = sha256(actualBytes);
    if (actualSha !== recordedSha) {
      violations.push({
        segment, trading_date: ymd,
        reason: `${label}: SHA-256 MISMATCH — manifest recorded ${recordedSha}, raw file on disk currently hashes to ${actualSha}. File was altered, corrupted, or the manifest was edited after the fact.`
      });
      continue;
    }

    const normPath = expectedNormalizedPath(segment, ymd);
    if (!fs.existsSync(normPath)) {
      violations.push({ segment, trading_date: ymd, reason: `${label}: normalized file MISSING at ${path.relative(BACKTEST_ROOT, normPath)} even though the manifest marks this SUCCESS+VALID` });
    }
  }

  return { ok: violations.length === 0, checkedCount: successValidEntries.length, violations };
}

module.exports = { verifyManifestIntegrity, expectedNormalizedPath };
