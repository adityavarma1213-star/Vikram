// VIKRAM — minimal, dependency-free "stored" (uncompressed) ZIP writer.
//
// Used only by the "Download Existing Dataset" feature on nse-data.html to bundle the REAL,
// already-statically-served data/market-history/*.json files into one file the browser can save.
// Deliberately uses ZIP method 0 (store, no compression): every byte of every entry is copied
// unchanged into the archive, so there is no compression algorithm that could introduce a subtle
// bug and silently corrupt real NSE data. This file does not fetch, generate, or alter any data —
// it only knows how to pack bytes it is given into a valid .zip container.
//
// Runs in both the browser (used by nseData.js) and Node (used by
// scripts/testZipStore.js for a real round-trip correctness check before this ships).
(function (root) {
  'use strict';

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(view, offset, value) { view.setUint16(offset, value, true); }
  function u32(view, offset, value) { view.setUint32(offset, value, true); }

  // Fixed DOS date/time (1980-01-01 00:00:00) — file modification time is filesystem metadata,
  // not part of the actual NSE data, so a constant valid value is used rather than trying to
  // infer or fabricate a "real" one.
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021;

  function textToBytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf-8')); // Node fallback for the test harness
  }

  /**
   * @param {Array<{name: string, data: Uint8Array}>} entries
   * @returns {Uint8Array} a complete, valid .zip file (store method, no compression)
   */
  function buildStoreZip(entries) {
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = textToBytes(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const crc = crc32(data);

      const local = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(local);
      u32(lv, 0, 0x04034b50);
      u16(lv, 4, 20);
      u16(lv, 6, 0);
      u16(lv, 8, 0);
      u16(lv, 10, DOS_TIME);
      u16(lv, 12, DOS_DATE);
      u32(lv, 14, crc);
      u32(lv, 18, data.length);
      u32(lv, 22, data.length);
      u16(lv, 26, nameBytes.length);
      u16(lv, 28, 0);
      new Uint8Array(local).set(nameBytes, 30);
      localChunks.push(new Uint8Array(local), data);

      const central = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(central);
      u32(cv, 0, 0x02014b50);
      u16(cv, 4, 20);
      u16(cv, 6, 20);
      u16(cv, 8, 0);
      u16(cv, 10, 0);
      u16(cv, 12, DOS_TIME);
      u16(cv, 14, DOS_DATE);
      u32(cv, 16, crc);
      u32(cv, 20, data.length);
      u32(cv, 24, data.length);
      u16(cv, 28, nameBytes.length);
      u16(cv, 30, 0);
      u16(cv, 32, 0);
      u16(cv, 34, 0);
      u16(cv, 36, 0);
      u32(cv, 38, 0);
      u32(cv, 42, offset);
      new Uint8Array(central).set(nameBytes, 46);
      centralChunks.push(new Uint8Array(central));

      offset += local.byteLength + data.length;
    }

    const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);
    const centralOffset = offset;

    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    u32(ev, 0, 0x06054b50);
    u16(ev, 4, 0);
    u16(ev, 6, 0);
    u16(ev, 8, entries.length);
    u16(ev, 10, entries.length);
    u32(ev, 12, centralSize);
    u32(ev, 16, centralOffset);
    u16(ev, 20, 0);

    const totalSize = offset + centralSize + 22;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const chunk of localChunks) { out.set(chunk, pos); pos += chunk.length; }
    for (const chunk of centralChunks) { out.set(chunk, pos); pos += chunk.length; }
    out.set(new Uint8Array(eocd), pos);
    return out;
  }

  const api = { buildStoreZip, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VikramZip = api;
})(typeof window !== 'undefined' ? window : globalThis);
