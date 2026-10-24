const {parse}=require('csv-parse/sync');
// Offline parser only; direct constituent downloads removed.
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

function membershipFor(symbol, memberships) {
  const normalized = String(symbol || '').trim().toUpperCase();
  return Object.keys(memberships || {}).filter(indexName => memberships[indexName]?.has(normalized));
}

module.exports={parseConstituentCsv,membershipFor};
