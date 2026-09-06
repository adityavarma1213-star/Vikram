# VIKRAM Improvement Roadmap

_Last updated: 06 September 2026_

This is the real, honest state of VIKRAM — not aspirational. Every item below reflects what is actually true in the codebase or what is explicitly required for the next development gate.

---

## ✅ Done and Working

- Search → honest research pipeline
- Modern VIKRAM UI foundation
- Accumulation Scanner foundation with price, volume, delivery, OBV and Futures OI where applicable
- Data freshness/status handling
- Opportunity Radar and Hidden Gems UI/data-engine integration work
- VIKRAM Lite official-file workflow foundation
- Detection-history requirement defined for Accumulation, Hidden Gems and Opportunity Radar

---

## 🔧 Current Development Priorities

| Priority | Task | Requirement |
|---|---|---|
| 1 | Full NSE universe | Prove genuine full supported universe and historical coverage |
| 2 | Index universe selector | Add Nifty 50 / Nifty 200 / Nifty 500 / All Stocks selection to scanners |
| 3 | Detection history | Calculate and display Caught for X trading days + Since date |
| 4 | Hidden Gems | Full-universe proof + independent detection streak |
| 5 | Opportunity Radar | Full-universe proof + independent detection streak |
| 6 | Option B | Independently verify rule builder and scanner API |
| 7 | VIKRAM Lite | Complete official-file download/import/update workflow |
| 8 | Automation | Automate EOD ingestion, scans and detection history |

---

## 📊 Index Universe Selection — NEW

All major stock-scanning pages must have a simple beginner-friendly universe selector.

### User-selectable universes

- **ALL STOCKS** — all stocks in VIKRAM's validated supported universe
- **NIFTY 50** — scan only current/effective Nifty 50 constituents for the selected EOD date
- **NIFTY 200** — scan only Nifty 200 constituents
- **NIFTY 500** — scan only Nifty 500 constituents

The user should be able to click the choice directly, for example:

`ALL STOCKS | NIFTY 50 | NIFTY 200 | NIFTY 500`

No Apply button should be required for this simple selector; changing the selection should immediately refresh the displayed scan results.

### Applies to

- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- Option B Rule Builder / Scanner
- Future scanner presets and alerts where a universe is part of the saved scan

### Data integrity rule

Index membership must come from a validated constituent dataset. Historical scans must use the constituent set effective on the relevant historical EOD date; VIKRAM must not silently use today's constituents to create false historical results.

The selected universe must be stored with scan results and saved scans so that a result can always be understood in context.

Example:

> NIFTY 200 • EOD VERIFIED • 05 Sep 2026 • 200 constituents checked

If a constituent list is unavailable or unverified, the selector must not pretend the universe was scanned. Show `DATA N/A` instead.

---

## 🕒 Detection History / Streaks

For Accumulation, Hidden Gems and Opportunity Radar:

- first detected date
- latest detected date
- consecutive detected trading days
- New Today state
- streak reset after a failed qualifying session
- re-qualification starts a new streak
- trading sessions, not calendar days
- missing/invalid data cannot extend a streak

---

## 🛡️ Core Principle

VIKRAM says "I don't know" when it does not know, instead of guessing. No fake confidence, invented numbers, fabricated history, or synthetic scanner matches.

---

## 🚀 Later Gates

### Automated alerts

Scanner → new match/streak change → alert engine → preferences → email/push.

### Subscriptions

Free / PRO / PRO+ access control with real server-side payment verification before charging users.

### Live infrastructure

Authorized live provider → secure backend → timestamped live data → live scans/alerts.

### Strategy Lab

No-code strategy builder and validated backtesting after sufficient historical data exists.

---

## Final Release Rule

Do not declare VIKRAM complete from code existence alone. A release requires validated data, tests, automation, deployment and production verification.
