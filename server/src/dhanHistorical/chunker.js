'use strict';
const { addDays, diffDays } = require('./dates');

// Split [start, end] (both inclusive calendar dates) into chunks of at most `chunkDays` days.
// Returns [{from, to}] with inclusive dates, no gaps, no overlap.
function chunkRange(start, end, chunkDays) {
  if (!Number.isInteger(chunkDays) || chunkDays < 1) throw new Error('chunkDays must be a positive integer');
  if (diffDays(start, end) < 0) throw new Error('start must not be after end');
  const out = [];
  let cur = start;
  while (diffDays(cur, end) >= 0) {
    const last = addDays(cur, chunkDays - 1);
    const to = diffDays(last, end) < 0 ? end : last;
    out.push({ from: cur, to });
    cur = addDays(to, 1);
  }
  return out;
}

module.exports = { chunkRange };
