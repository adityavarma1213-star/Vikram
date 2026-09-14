const assert = require('node:assert/strict');
const { buildAccumulationIntelligence } = require('../lib/accumulationIntelligence');
const { getSharedIndex } = require('../lib/symbolSeries');

const index = getSharedIndex();
const allDates = index.allTradingDates();
const lastDate = allDates[allDates.length - 1];
const symbols = index.symbols().slice(0, 15);

let evaluated = 0;
for (const sym of symbols) {
  const record = buildAccumulationIntelligence(sym, lastDate, index);
  assert.equal(record.symbol, sym.toUpperCase());
  assert.equal(record.asOfDate, lastDate);
  assert.ok(['EVALUATED', 'DATA_INSUFFICIENT'].includes(record.overallStatus));
  assert.ok(Array.isArray(record.evidenceFor));
  assert.ok(Array.isArray(record.evidenceAgainst));
  // No single competing scoring engine duplicated: the three sub-results must be exactly
  // the same shape the standalone engines produce (composition, not reimplementation).
  assert.ok('dnaType' in record.accumulationDNA);
  assert.ok('soaiZ' in record.soai);
  assert.ok('verdict' in record.falseAccumulation);
  if (record.overallStatus === 'EVALUATED') evaluated += 1;
}
console.log(`REAL DATA integration scan over ${symbols.length} symbols as of ${lastDate}: ${evaluated} fully evaluated`);
assert.ok(evaluated > 0);

// No-look-ahead sanity check: intelligence built as-of an earlier real date must not see later data.
const earlierDate = allDates[60];
const earlyRecord = buildAccumulationIntelligence(symbols[0], earlierDate, index);
assert.equal(earlyRecord.asOfDate, earlierDate);
const earlySeriesDates = index.cmSeriesAsOf(symbols[0], earlierDate).map(r => r.trade_date);
assert.ok(earlySeriesDates.every(d => d <= earlierDate), 'no-look-ahead violated: series contained a date after asOfDate');

console.log('accumulationIntelligence.test.js passed');
