const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'data', 'scanner.json');
const MIN_UNIVERSE = Number(process.env.MIN_UNIVERSE || 1000);
const MIN_HISTORY = Number(process.env.MIN_HISTORY || 200);
const MAX_SNAPSHOT_AGE_DAYS = Number(process.env.MAX_SNAPSHOT_AGE_DAYS || 7);
const REQUIRED_PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y'];

function fail(message) {
  console.error(`SNAPSHOT VALIDATION FAILED: ${message}`);
  process.exit(1);
}
function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}
function parseYmd(value) {
  if (!isYmd(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function ageDays(ymd) {
  return Math.floor((Date.now() - parseYmd(ymd).getTime()) / 86400000);
}

if (!fs.existsSync(file)) fail('data/scanner.json does not exist.');
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!data || typeof data !== 'object' || Array.isArray(data)) fail('root must be a JSON object.');
if (data.status !== 'ok') fail(`status=${data.status}`);
if (data.dataStatus !== 'EOD VERIFIED') fail(`dataStatus=${data.dataStatus}; expected EOD VERIFIED`);
if (!parseYmd(data.asOf)) fail('missing/invalid asOf date');
if (ageDays(data.asOf) < 0) fail(`asOf=${data.asOf} is in the future`);
if (ageDays(data.asOf) > MAX_SNAPSHOT_AGE_DAYS) fail(`snapshot asOf=${data.asOf} is older than ${MAX_SNAPSHOT_AGE_DAYS} days`);
if (!Array.isArray(data.results) || data.results.length < MIN_UNIVERSE) fail(`universe has ${data.results?.length || 0} rows; minimum is ${MIN_UNIVERSE}`);
if (!Array.isArray(data.tradingDays) || data.tradingDays.length < MIN_HISTORY) fail(`history has ${data.tradingDays?.length || 0} trading days; minimum is ${MIN_HISTORY}`);
for (const period of REQUIRED_PERIODS) {
  if (!Array.isArray(data.periods?.[period])) fail(`missing periods.${period}`);
}

if (/Math\.random|synthetic|placeholder/i.test(JSON.stringify(data))) {
  fail('scanner snapshot contains forbidden synthetic/placeholder markers');
}

const seen = new Set();
for (const row of data.results) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('result row is not an object');
  if (!row.symbol || typeof row.symbol !== 'string') fail('result row missing symbol');
  if (seen.has(row.symbol)) fail(`duplicate symbol ${row.symbol}`);
  seen.add(row.symbol);
  if (row.tradeDate !== data.asOf) fail(`bad row date for ${row.symbol}: ${row.tradeDate}`);
  if (row.score != null && (!Number.isFinite(row.score) || row.score < 0 || row.score > 100)) {
    fail(`invalid score for ${row.symbol}`);
  }
  if (row.metrics?.oiExactDate && row.metrics?.futuresOi == null) {
    fail(`OI marked exact but missing for ${row.symbol}`);
  }

  const metrics = row.metrics || {};
  for (const [name, value] of Object.entries(metrics)) {
    if (typeof value === 'number' && !Number.isFinite(value)) fail(`non-finite metric ${name} for ${row.symbol}`);
  }
  if ([metrics.open, metrics.high, metrics.low, metrics.close].every(v => v != null)) {
    if (
      metrics.high < Math.max(metrics.open, metrics.close) ||
      metrics.low > Math.min(metrics.open, metrics.close) ||
      metrics.low > metrics.high
    ) {
      fail(`impossible OHLC relationship for ${row.symbol}`);
    }
  }
}

const tradingDays = data.tradingDays;
if (tradingDays.some(day => !parseYmd(day))) fail('tradingDays contains invalid dates');
if (new Set(tradingDays).size !== tradingDays.length) fail('tradingDays contains duplicates');
if (!tradingDays.includes(data.asOf)) fail('asOf is not present in tradingDays');

console.log(`SNAPSHOT VALIDATION PASSED: ${data.results.length} symbols, ${data.tradingDays.length} trading days, asOf=${data.asOf}`);
