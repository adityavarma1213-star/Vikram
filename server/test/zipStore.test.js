'use strict';
// Real round-trip correctness test for js/zipStore.js -- the byte-manipulation code behind the
// "Download Existing Dataset" feature on nse-data.html. No such test existed in the source this
// was merged from, despite that file's own header comment claiming one did (referencing a
// scripts/testZipStore.js that was not actually present). Rather than trust an uncompressed byte
// writer for a production download feature on the strength of a comment, this test builds a real
// archive and verifies it with Python's zipfile module -- a completely independent implementation
// -- rather than re-parsing it with the same code that wrote it (which would only prove internal
// self-consistency, not actual ZIP-format correctness).
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildStoreZip, crc32 } = require('../../js/zipStore.js');

const tmpZip = path.join(os.tmpdir(), `vikram-zipstore-test-${Date.now()}.zip`);

const entryA = { name: 'market-history/2026-09-11.json', data: new TextEncoder().encode(JSON.stringify({ tradeDate: '2026-09-11', sample: true })) };
const entryB = { name: 'market-history/2026-09-12.json', data: new TextEncoder().encode('x'.repeat(5000)) };
const zipBytes = buildStoreZip([entryA, entryB]);
fs.writeFileSync(tmpZip, Buffer.from(zipBytes));

try {
  const pyCheck = `
import zipfile, sys, json
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, "corrupt entry found"
names = z.namelist()
assert names == ["market-history/2026-09-11.json", "market-history/2026-09-12.json"], names
a = json.loads(z.read(names[0]))
assert a == {"tradeDate": "2026-09-11", "sample": True}, a
b = z.read(names[1]).decode()
assert b == "x" * 5000, "large entry content mismatch"
print("OK")
`;
  const out = execFileSync('python3', ['-c', pyCheck, tmpZip], { encoding: 'utf8' });
  assert.equal(out.trim(), 'OK', 'independent zipfile verification must pass');

  // Also confirm crc32 is a real CRC-32 (not a stub returning a constant) against a known vector.
  const known = crc32(new TextEncoder().encode('123456789'));
  assert.equal(known >>> 0, 0xCBF43926, 'crc32("123456789") must equal the standard CRC-32/ISO-HDLC test vector 0xCBF43926');

  console.log('zipStore tests passed (real round-trip verified by an independent tool, not the same code that wrote it; CRC-32 checked against the standard test vector)');
} finally {
  fs.unlinkSync(tmpZip);
}
