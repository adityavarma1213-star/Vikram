// AUDIT FOLLOW-UP (§6, §8): the backtest previously treated every single
// CONFIRMED day as an independent signal, with no concept of "this is the
// same ongoing detection as yesterday." This module gives the backtest the
// same conceptual event semantics the live VIKRAM scanner already uses for
// "today" (server/src/staticSnapshot.js's buildCurrentDetection): a
// contiguous run of CONFIRMED days is one EVENT, with a first detection
// date/price, a latest detection date/price, and a trading-session streak
// count. A day that fails to qualify ends the event; a later requalification
// starts a brand-new event, never a continuation of the old one.
//
// This module does not call or modify accumulation/engine.js. It only
// consumes the verdict stream the engine already produces, one day at a
// time, and groups it.

// verdictStream: chronologically ordered array of
//   { date, close, verdict } for ONE symbol, where verdict is whatever
//   engine.evaluate(...).verdict returned for that day (already computed
//   with a look-ahead-safe, past-only history slice by the caller).
//
// Returns an array of events:
//   {
//     symbol, eventIndex,
//     firstDetectionDate, firstDetectionPrice,
//     latestDetectionDate, latestDetectionPrice,
//     tradingSessionStreak,     // number of consecutive confirmed sessions
//     status,                   // 'New' (streak === 1) | 'Active' (streak > 1)
//     endedDate                 // first date AFTER the streak that failed to
//                                // requalify, or null if the streak is still
//                                // running at the end of the provided series
//   }
const CONFIRMED_VERDICT = 'ACCUMULATION CONFIRMED';

function buildDetectionEvents(symbol, verdictStream) {
  const events = [];
  let current = null;

  for (let i = 0; i < verdictStream.length; i += 1) {
    const day = verdictStream[i];
    const isConfirmed = day.verdict === CONFIRMED_VERDICT;

    if (isConfirmed) {
      if (!current) {
        // Reset after failed qualification (or very first day): requalifying
        // starts a brand-new event, never extends a previous one.
        current = {
          symbol,
          eventIndex: events.length,
          firstDetectionDate: day.date,
          firstDetectionPrice: day.close,
          latestDetectionDate: day.date,
          latestDetectionPrice: day.close,
          tradingSessionStreak: 1,
          status: 'New',
          endedDate: null
        };
      } else {
        current.latestDetectionDate = day.date;
        current.latestDetectionPrice = day.close;
        current.tradingSessionStreak += 1;
        current.status = 'Active';
      }
    } else if (current) {
      // Streak broken. The event is finalized as of its last confirmed day;
      // this day's date is recorded as when it ended.
      current.endedDate = day.date;
      events.push(current);
      current = null;
    }
  }
  if (current) events.push(current); // still running at the end of the series

  return events;
}

module.exports = { buildDetectionEvents, CONFIRMED_VERDICT };
