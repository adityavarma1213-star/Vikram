// AUDIT FOLLOW-UP (§4): confirmTradeDate() previously assumed every NSE date
// column's first 10 characters were already ISO YYYY-MM-DD. That is true for
// some formats and false for others, and this sandbox cannot make a live NSE
// request to determine which format the archive actually returns for any
// given date/segment/era. Rather than guess a single format, this module
// explicitly supports every date representation actually referenced by the
// URL families this downloader uses:
//
//   - ISO:            2021-09-01                 (assumed possible for UDiFF TradDt)
//   - DD-MON-YYYY:     01-SEP-2021 / 01-Sep-2021  (NSE's documented legacy
//                                                   sec_bhavdata_full DATE1
//                                                   convention)
//   - DD-MM-YYYY:      01-09-2021                 (an alternate UDiFF TradDt
//                                                   convention seen in some
//                                                   NSE circulars/samples)
//   - DD/MM/YYYY:      01/09/2021                 (defensive: seen in some
//                                                   older NSE downloads)
//
// IMPORTANT — this is still UNVERIFIED against a live NSE response, because
// this sandbox has no NSE network access (see AUDIT.md). What changed is
// that the pipeline no longer silently assumes ONE specific format and fails
// closed on every other one; it recognizes all formats known to have been
// used by NSE's own archives for these specific file families, and fails
// loudly (returns null, not a guess) for anything it doesn't recognize, so a
// genuinely new NSE format change still surfaces as a clear validation
// failure rather than a silent misparse.

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

function pad2(n) { return String(n).padStart(2, '0'); }

// Returns an ISO 'YYYY-MM-DD' string, or null if the input matches none of
// the known formats. Never throws — an unrecognized format is a validation
// finding for the caller to report, not a normalizer crash.
function normalizeNseDateToIso(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD (allow a trailing time component, take the date part)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD-MON-YYYY (e.g. 01-SEP-2021, 01-Sep-2021)
  m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].toUpperCase()];
    if (!month) return null;
    return `${m[3]}-${pad2(month)}-${m[1]}`;
  }

  // DD-MM-YYYY (numeric, dash-separated)
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // DD/MM/YYYY (slash-separated)
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return null; // genuinely unrecognized — do not guess
}

module.exports = { normalizeNseDateToIso, MONTHS };
