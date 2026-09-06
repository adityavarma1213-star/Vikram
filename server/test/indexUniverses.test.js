const assert = require('assert');
const { parseConstituentCsv, membershipFor } = require('../src/indexUniverses');

const csv = Buffer.from([
  'Company Name,Industry,Symbol,Series,ISIN Code',
  'Alpha Ltd.,IT,ALPHA,EQ,INE000A00000',
  'Beta Ltd.,Banking,BETA,EQ,INE000B00000',
  'Ignored Ltd.,IT,IGNORED,BE,INE000C00000'
].join('\n'));

const symbols = parseConstituentCsv(csv);
assert.deepStrictEqual([...symbols].sort(), ['ALPHA', 'BETA']);

const memberships = {
  'NIFTY 50': new Set(['ALPHA']),
  'NIFTY 200': new Set(['ALPHA', 'BETA']),
  'NIFTY 500': new Set(['ALPHA', 'BETA'])
};

assert.deepStrictEqual(membershipFor('alpha', memberships), ['NIFTY 50', 'NIFTY 200', 'NIFTY 500']);
assert.deepStrictEqual(membershipFor('BETA', memberships), ['NIFTY 200', 'NIFTY 500']);
assert.deepStrictEqual(membershipFor('UNKNOWN', memberships), []);

console.log('index universe tests passed');
