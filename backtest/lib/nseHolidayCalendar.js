'use strict';
// Canonical NSE trading-holiday calendar — ONLY for the date range actually covered by the
// current dataset (2025-09-02 .. 2026-09-04, see backtest/data/manifest.json). Every entry below
// was verified against a specific real source before being added; none are estimated or copied
// from a "typical year" template. Do not extend this list by pattern-matching (e.g. assuming a
// date is a holiday because a similar festival fell nearby last year) — add an entry only when a
// specific circular/reliable news source names that exact date.
//
// Sources:
//  - 2025 exchange holidays: NSE-notified list as reported by Business Standard, "Is the stock
//    market open on New Year? Check BSE, NSE 2025 holiday list" (accessed 2026-09-12), and
//    corroborating single-date reporting for Guru Nanak Jayanti (2025-11-05, multiple outlets,
//    accessed 2026-09-12).
//  - 2026 exchange holidays: NSE Circular NSE/CMTR/71775 dated 2025-12-12 ("Trading holidays for
//    the calendar year 2026"), fetched directly from
//    https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf on 2026-09-12.
//  - 2026-01-15 is NOT in NSE/CMTR/71775 (that circular predates the event). It was declared as a
//    late, ad-hoc, partial modification to NSE/CMTR/71775 on 2026-01-12, for the Maharashtra
//    Municipal Corporation (BMC) elections — reported by Business Today, Upstox, and Paytm Money
//    (all accessed 2026-09-12). This is exactly the kind of holiday a static annual calendar
//    built in advance will miss, which is why the automated stale-duplicate detector in
//    staleDuplicateDetector.js exists as a second, independent line of defense (see below) rather
//    than relying on this list alone.
const KNOWN_HOLIDAYS = Object.freeze({
  '2025-10-02': { reason: 'Mahatma Gandhi Jayanti / Dussehra (Vijaya Dashami)', source: 'Business Standard, "Stock market holiday: Will BSE, NSE remain closed on October 2?" (2025-10-01/02)' },
  '2025-10-21': { reason: 'Diwali Laxmi Pujan (Muhurat Trading only)', source: 'NSE Circular COM65590 (2025); Business Standard 2025 holiday list' },
  '2025-10-22': { reason: 'Diwali Balipratipada', source: 'Business Standard, "Is the stock market open on New Year? Check BSE, NSE 2025 holiday list"' },
  '2025-11-05': { reason: 'Guru Nanak Jayanti (Gurpurab)', source: 'Business Standard / India TV / The Hans India / Samco, all dated 2025-11-05' },
  '2025-12-25': { reason: 'Christmas', source: 'Business Standard 2025 holiday list' },
  '2026-01-15': { reason: 'Ad-hoc trading holiday, BMC/Maharashtra Municipal Corporation elections (partial modification to NSE/CMTR/71775, issued 2026-01-12)', source: 'Business Today, Upstox, Paytm Money (2026-01-14/15)' },
  '2026-01-26': { reason: 'Republic Day', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-03-03': { reason: 'Holi', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-03-26': { reason: 'Shri Ram Navami', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-03-31': { reason: 'Shri Mahavir Jayanti', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-04-03': { reason: 'Good Friday', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-04-14': { reason: 'Dr. Baba Saheb Ambedkar Jayanti', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-05-01': { reason: 'Maharashtra Day', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-05-28': { reason: 'Bakri Id', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' },
  '2026-06-26': { reason: 'Muharram', source: 'NSE Circular NSE/CMTR/71775 (2025-12-12)' }
});

function isKnownHolidayDate(dateStr) {
  return Object.prototype.hasOwnProperty.call(KNOWN_HOLIDAYS, dateStr);
}

function holidayInfo(dateStr) {
  return KNOWN_HOLIDAYS[dateStr] || null;
}

module.exports = { KNOWN_HOLIDAYS, isKnownHolidayDate, holidayInfo };
