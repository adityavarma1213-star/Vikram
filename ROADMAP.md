# VIKRAM Improvement Roadmap

_Last updated: 06 September 2026_

This is the real, honest state of VIKRAM — not aspirational. Every item below reflects what is actually true in the codebase or what is explicitly required for the next development gate.

---

## ✅ Done / Foundation

- Search → honest research pipeline
- Modern VIKRAM UI foundation
- Accumulation Scanner foundation with price, volume, delivery, OBV and Futures OI where applicable
- Data freshness/status handling
- Opportunity Radar and Hidden Gems UI/data-engine integration work
- VIKRAM Lite official-file workflow foundation
- Detection-history requirement defined for Accumulation, Hidden Gems and Opportunity Radar
- Shared six-theme architecture defined: Aurora, Galaxy, Academic, NeoGlass, Calm, Duology
- Light/Dark/System mode architecture defined
- Subscription/plan structure defined

---

## 🔧 Current Development Priorities

| Priority | Task | Requirement |
|---|---|---|
| 1 | Full NSE universe | Prove genuine full supported universe and historical coverage |
| 2 | Index universe selector | Implement All Stocks / Nifty 50 / Nifty 200 / Nifty 500 across scanners |
| 3 | Detection history | Calculate and display Caught for X trading days + Since date + latest date |
| 4 | Hidden Gems | Full-universe proof + independent detection streak |
| 5 | Opportunity Radar | Full-universe proof + independent detection streak |
| 6 | Option B | Independently verify rule builder, saved scans and universe context |
| 7 | VIKRAM Lite | Complete official-file download/import/update workflow |
| 8 | Automation | Automate EOD ingestion, scans, detection history and streaks |
| 9 | Subscriptions | Complete secure account/access/billing architecture before charging |
| 10 | Themes | Complete production verification across all six themes and modes |

---

## 📊 Index Universe Selection

All major stock-scanning pages must have one simple beginner-friendly selector:

`ALL STOCKS | NIFTY 50 | NIFTY 200 | NIFTY 500`

### Behavior

- click/tap directly
- no Apply button
- immediate refresh
- show selected universe + data status + EOD date + constituents checked
- example: `NIFTY 200 • EOD VERIFIED • 05 Sep 2026 • 200 constituents checked`
- if membership data is unavailable/unverified → `DATA N/A`

### Applies to

- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- Option B
- future saved presets and alerts

Historical scans must use index membership effective on the historical EOD date. Never replace historical constituents with today's membership.

The selected universe must be stored with scan results, saved scans and alerts. Detection streaks remain separate by engine and universe context.

---

## 🕒 Detection History / Streak Intelligence

VIKRAM must show not only that a stock qualifies, but **how long it has continuously qualified**.

### Applies to

- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- Option B saved scans when historical tracking is enabled

### Display

- **Caught for X trading days**
- **Since: DATE**
- **Last detected: DATE**
- **New today** for a one-session streak
- selected universe

### Rules

- trading sessions, not calendar days
- failed qualifying session resets the streak
- re-qualification starts a new streak
- missing/invalid data cannot silently extend it
- each engine has an independent streak
- universe context is part of the streak
- historical rule-version changes are explicit
- historical results require genuine historical data

### Required tests

1-day, 5-day, 10-day, 20-day streaks; weekend/holiday gaps; reset; re-entry; missing data; engine independence; universe independence; exact Since date; latest detection date; New Today; rule-version changes; effective-date index membership.

---

## 🎨 Themes / UX

One shared VIKRAM OS/platform with six selectable themes:

1. **Aurora** — flagship/default
2. **Galaxy** — student/teen exploration
3. **Academic** — parents/teachers/schools
4. **NeoGlass** — premium alternative
5. **Calm** — focus/wellbeing
6. **Duology** — animated kids experience

Every theme supports **Light / Dark / System**.

Theme changes presentation only; the data and scoring engine remain shared. The Galaxy/space-style student starter experience remains part of the architecture where defined, followed by the shared Theme Engine.

---

## 💳 Subscriptions / Plans

Initial product structure:

### Free — ₹0
- basic stock search
- basic market analysis
- limited discovery views
- basic EOD intelligence

### VIKRAM PRO — ₹499/month
- full Accumulation Scanner
- full Hidden Gems
- full Opportunity Radar
- advanced analysis and filters
- portfolio intelligence
- additional historical/research features

### VIKRAM PRO+ — ₹999/month
- everything in PRO
- advanced institutional/accumulation intelligence
- premium reports/insights
- priority features/data capabilities when supported

These prices remain product placeholders until production billing is finalized.

Before charging users:

- secure payment/subscription provider
- server-side payment verification
- account/subscription state
- server-side access control
- renewal/cancellation handling
- billing history
- payment-failure handling

A pricing page alone does not mean billing is live.

---

## 📥 VIKRAM Lite / Official Downloadable Data

```text
VIKRAM DATA/
├── BhavCopy
├── Delivery
├── Corporate Actions
├── Financial Results
├── Shareholding
├── MF-FII-DII
├── 52 Week High Low
└── News
```

Control panel targets:

- NSE Bhav Copy
- NSE Delivery
- 52 Week High/Low
- BSE Bhav Copy
- Corporate Actions
- Shareholding
- Financial Results
- MF/FII/DII
- News / Announcements
- **Update VIKRAM**

Use official/authorized downloadable sources only. Validate source, date, schema and completeness. Place files into the correct folders and connect imported data to the scanner/research pipeline. Never use fabricated fallback values.

GitHub Pages/browser code cannot arbitrarily write local folders; true one-click folder placement requires a local process, desktop application, or local server.

---

## 🚨 Alerts + Automation

Target flow:

`EOD data → validation → historical update → scanner → detection history → streak calculation → new-match/streak-change detector → alert engine → email/push → deployment`

Alerts can include:

- New match today
- Streak extended
- Streak ended
- Major verdict/category change

Retain engine, symbol, universe, detection/streak context and rule version. Require deduplication, preferences, history, PENDING/SENT/FAILED states and provider-failure isolation.

---

## 🛡️ Data Integrity

VIKRAM says `DATA N/A` rather than guessing.

Audit for:

- fake prices
- fake volume
- fake delivery
- fake OI
- fabricated history
- fabricated streaks
- hard-coded market dates
- five-stock restrictions
- fabricated index membership
- synthetic scanner results

---

## 🚦 Final Release Gate

Do not declare VIKRAM complete from code existence alone. Production requires evidence for:

1. source of truth
2. full NSE universe
3. Nifty 50/200/500 constituent datasets
4. historical data + six periods
5. Accumulation Scanner
6. Option B
7. detection history/streaks
8. universe selector
9. Hidden Gems
10. Opportunity Radar
11. VIKRAM Lite where enabled
12. validation/tests
13. automation
14. real email/push provider tests where enabled
15. subscription access control before billing
16. all six themes + Light/Dark/System
17. desktop/mobile verification
18. final no-fabrication audit

If any mandatory item is UNVERIFIED or FAIL:

> **VIKRAM PHASE A — NOT COMPLETE**

No percentage should substitute for physical evidence.
