const { parse } = require('csv-parse/sync');

const NIFTY_INDEX_SOURCES = Object.freeze({
  'NIFTY 50': 'https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv',
  'NIFTY 200': 'https://www.niftyindices.com/IndexConstituent/ind_nifty200list.csv',
  'NIFTY 500': 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv'
});

function parseConstituentCsv(buffer) {
  const rows = parse(buffer.toString('utf8').replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
    bom: true
  });
  if (!rows.length) throw new Error('Index constituent CSV is empty');
  const headers = new Set(Object.keys(rows[0]));
  for (const required of ['Symbol', 'Series']) {
    if (!headers.has(required)) throw new Error(`Index constituent CSV missing ${required}`);
  }
  return new Set(rows
    .filter(row => String(row.Series || '').trim().toUpperCase() === 'EQ')
    .map(row => String(row.Symbol || '').trim().toUpperCase())
    .filter(Boolean));
}

async function fetchIndexUniverses(get) {
  const memberships = {};
  const sources = {};
  for (const [indexName, url] of Object.entries(NIFTY_INDEX_SOURCES)) {
    const symbols = parseConstituentCsv(await get(url));
    memberships[indexName] = symbols;
    sources[indexName] = url;
  }
  return { memberships, sources, status: 'VERIFIED' };
}

function membershipFor(symbol, memberships) {
  const normalized = String(symbol || '').trim().toUpperCase();
  return Object.keys(memberships || {}).filter(indexName => memberships[indexName]?.has(normalized));
}

module.exports = { NIFTY_INDEX_SOURCES, parseConstituentCsv, fetchIndexUniverses, membershipFor };
