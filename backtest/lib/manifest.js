const fs = require('fs');
const path = require('path');

// The manifest is the single auditable record of what was actually attempted,
// downloaded, and validated. It is written after EVERY date so a killed or
// interrupted download process can resume exactly where it left off (checkpoint
// + resume, per requirement #4) instead of re-downloading or losing state.

// Pure function, exported standalone so the production gate can summarize a
// raw manifest data object directly (and so it is trivially unit-testable
// without touching disk).
function summarize(data) {
  const entries = Object.values(data.entries || {});
  const bySegment = {};
  for (const e of entries) {
    bySegment[e.segment] = bySegment[e.segment] || { success_valid: 0, failed: 0, blocked: 0, invalid: 0, not_trading_day: 0, total: 0 };
    const s = bySegment[e.segment];
    s.total += 1;
    if (e.download_status === 'SUCCESS' && e.validation_status === 'VALID') s.success_valid += 1;
    else if (e.download_status === 'BLOCKED') s.blocked += 1;
    else if (e.download_status === 'NOT_A_TRADING_DAY') s.not_trading_day += 1;
    else if (e.download_status === 'FAILED') s.failed += 1;
    else s.invalid += 1;
  }
  const realDataRecords = entries.filter(e => e.download_status === 'SUCCESS' && e.validation_status === 'VALID').reduce((a, e) => a + (e.row_count || 0), 0);
  const tradingSessions = new Set(entries.filter(e => e.segment === 'CM' && e.download_status === 'SUCCESS' && e.validation_status === 'VALID').map(e => e.trading_date));
  return {
    data_provenance: data.data_provenance,
    real_data_records: realDataRecords,
    trading_sessions_confirmed: tradingSessions.size,
    date_range: [...tradingSessions].sort(),
    by_segment: bySegment
  };
}

class Manifest {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    if (fs.existsSync(this.filePath)) {
      try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
      catch (e) { throw new Error(`Manifest at ${this.filePath} is corrupt and cannot be trusted for resume: ${e.message}`); }
    }
    return {
      created_at: new Date().toISOString(),
      data_provenance: 'REAL_NSE',
      entries: {} // key: `${segment}|${ymd}` -> entry
    };
  }

  key(segment, ymd) { return `${segment}|${ymd}`; }

  get(segment, ymd) { return this.data.entries[this.key(segment, ymd)] || null; }

  // Resume support: a date/segment is considered already done only if it was
  // both downloaded successfully AND passed validation. Anything else
  // (FAILED, BLOCKED, INVALID, MALFORMED) is retried on the next run.
  isDone(segment, ymd) {
    const e = this.get(segment, ymd);
    return !!e && e.download_status === 'SUCCESS' && e.validation_status === 'VALID';
  }

  record(segment, ymd, entry) {
    this.data.entries[this.key(segment, ymd)] = {
      segment,
      trading_date: ymd,
      source_url: entry.source_url || null,
      download_status: entry.download_status, // SUCCESS | FAILED | BLOCKED | NOT_A_TRADING_DAY
      sha256: entry.sha256 || null,
      file_path: entry.file_path || null,
      validation_status: entry.validation_status || 'NOT_APPLICABLE', // VALID | INVALID | MALFORMED | DUPLICATE | NOT_APPLICABLE
      validation_errors: entry.validation_errors || [],
      row_count: entry.row_count ?? null,
      attempt_count: entry.attempt_count ?? 1,
      recorded_at: new Date().toISOString()
    };
    this._save(); // checkpoint immediately, not batched
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    // Atomic-ish write: write to temp then rename, so a crash mid-write never
    // corrupts the checkpoint file resume depends on.
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  summary() { return summarize(this.data); }
}

module.exports = { Manifest, summarize };
