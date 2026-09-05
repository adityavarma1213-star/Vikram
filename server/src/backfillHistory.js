const fs = require('fs');
const path = require('path');
const { toIstCalendarDate, addDays, formatYmd } = require('./istDate');
const { fetchCm, fetchFo, writeHistory } = require('./staticSnapshot');
const { MATERIALIZE_LOOKBACK_DAYS } = require('./scanMaterializer');

const ROOT = path.resolve(__dirname, '../..');
const HISTORY_DIR = path.join(ROOT, 'data', 'market-history');
const BACKFILL_CALENDAR_DAYS = Number(process.env.BACKFILL_CALENDAR_DAYS || 370);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function existingDates() {
  if (!fs.existsSync(HISTORY_DIR)) return new Set();
  return new Set(fs.readdirSync(HISTORY_DIR)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => name.slice(0, 10)));
}

async function fetchWithBackoff(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = /NSE (429|5\d\d)/.exec(error.message)?.[1];
      const wait = status === '429' ? 30000 * attempt : 2000 * attempt;
      console.warn(`${label} attempt ${attempt}/3 failed: ${error.message}`);
      if (attempt < 3) await sleep(wait);
    }
  }
  throw lastError;
}

async function main() {
  const anchor = toIstCalendarDate();
  const existing = existingDates();
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Backfill target: ${BACKFILL_CALENDAR_DAYS} calendar days; retention ${MATERIALIZE_LOOKBACK_DAYS} snapshots.`);

  for (let i = 0; i < BACKFILL_CALENDAR_DAYS; i += 1) {
    const date = addDays(anchor, -i);
    const key = formatYmd(date);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    try {
      const cm = await fetchWithBackoff(() => fetchCm(date), `CM ${key}`);
      let futures = [];
      try {
        futures = await fetchWithBackoff(() => fetchFo(date), `F&O ${key}`);
      } catch (error) {
        console.warn(`F&O unavailable for ${key}; CM data will still be stored: ${error.message}`);
      }
      writeHistory({ tradeDate: key, cm, futures, generatedAt: new Date().toISOString() });
      fetched += 1;
      console.log(`BACKFILLED ${key}: ${cm.length} CM rows, ${futures.length} futures rows`);
      // Respectful sequential requests; no concurrency or WAF/CAPTCHA bypass.
      await sleep(400);
    } catch (error) {
      // Weekends/holidays normally land here because no daily archive exists.
      failed += 1;
      console.log(`SKIP ${key}: ${error.message}`);
    }
  }

  console.log(`Backfill complete: fetched=${fetched}, existing=${skipped}, unavailable=${failed}`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });

module.exports = { existingDates, fetchWithBackoff, main };
