'use strict';
// Historical Verdict Store.
//
// Distinct from backtest/lib/signalEventStore.js (which only records Hidden-Gem-relevant events)
// — this store records EVERY scanner verdict for EVERY symbol on EVERY evaluated trading date, so
// VIKRAM can always answer: "what did VIKRAM actually say about symbol X on date T?" This is a
// governance/audit requirement (Blueprint §10), not a trading signal.
//
// Guarantees:
//   - append-only: a (symbol, tradeDate, engineVersion, configVersion) record, once written, is
//     never overwritten. A later re-evaluation of the same symbol/date under the same engine and
//     config is a duplicate write and is rejected, not silently merged.
//   - reconstructable: querying by symbol returns its full verdict history in order.
//   - version/config traceability: every record carries which exact engine build and config
//     version produced it, so a later engine/threshold change can never be mistaken for the
//     historical record having changed retroactively.

function recordKey(symbol, tradeDate, engineVersion, configVersion) {
  return `${String(symbol).toUpperCase()}|${String(tradeDate)}|${engineVersion}|${configVersion}`;
}

class HistoricalVerdictStore {
  constructor() {
    this._records = []; // append-only
    this._byKey = new Map(); // recordKey -> index, for O(1) duplicate detection
  }

  // Records one verdict. Throws (does not silently overwrite) if this exact
  // (symbol, tradeDate, engineVersion, configVersion) combination was already recorded — that
  // would mean either a re-run producing a DIFFERENT result under the identical version (a real
  // non-determinism bug worth surfacing) or an accidental duplicate write.
  append({ symbol, tradeDate, engineVersion, configVersion, verdict, score = null, components = null, detection = null, dataConfidence = null, universeContext = [] }) {
    if (!symbol || !tradeDate || !engineVersion || !configVersion || !verdict) {
      throw new Error('HistoricalVerdictStore.append requires symbol, tradeDate, engineVersion, configVersion, and verdict — refusing a partial/fabricated record');
    }
    const key = recordKey(symbol, tradeDate, engineVersion, configVersion);
    if (this._byKey.has(key)) {
      throw new Error(`Duplicate verdict record for ${key} — historical verdicts are append-only and cannot be overwritten`);
    }
    const record = Object.freeze({
      symbol: String(symbol).toUpperCase(),
      tradeDate: String(tradeDate),
      engineVersion,
      configVersion,
      verdict,
      score,
      components: components ? Object.freeze({ ...components }) : null,
      detection: detection ? Object.freeze({ ...detection }) : null,
      dataConfidence,
      universeContext: Object.freeze([...universeContext]),
      recordedAt: new Date().toISOString()
    });
    this._records.push(record);
    this._byKey.set(key, this._records.length - 1);
    return this._records.length - 1;
  }

  // Reconstructs the full verdict history for one symbol, in chronological order — this is the
  // direct answer to "what did VIKRAM say about symbol X over time?"
  history(symbol) {
    const sym = String(symbol || '').toUpperCase();
    return this._records.filter(r => r.symbol === sym).slice().sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  }

  // The exact answer to "what did VIKRAM say about symbol X on date T?" — returns null if no
  // record exists for that exact date (never interpolates or substitutes a nearby date).
  verdictOn(symbol, tradeDate) {
    const sym = String(symbol || '').toUpperCase();
    return this._records.find(r => r.symbol === sym && r.tradeDate === String(tradeDate)) || null;
  }

  all() {
    return this._records.slice();
  }

  size() {
    return this._records.length;
  }
}

module.exports = { HistoricalVerdictStore, recordKey };
