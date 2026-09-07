const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'data', 'market-history');
if (!fs.existsSync(dir)) process.exit(0);

let removed = 0;
for (const name of fs.readdirSync(dir).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))) {
  const file = path.join(dir, name);
  const date = name.slice(0, 10);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { snapshot = null; }
  const rows = Array.isArray(snapshot?.cm) ? snapshot.cm : [];
  const rowDates = new Set(rows.map(r => String(r?.trade_date || '').slice(0, 10)).filter(Boolean));
  const invalid = day === 0 || day === 6 || !snapshot || String(snapshot.tradeDate || '').slice(0, 10) !== date || rowDates.size > 1 || (rowDates.size === 1 && !rowDates.has(date));
  if (invalid) {
    fs.unlinkSync(file);
    removed += 1;
    console.log(`REMOVED INVALID MARKET HISTORY: ${name}`);
  }
}
console.log(`Market-history cleanup complete: removed ${removed} invalid snapshot(s).`);
