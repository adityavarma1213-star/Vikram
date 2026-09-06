# VIKRAM — MASTER BLUEPRINT — UPDATED 06 SEP 2026

## 1. Product Vision

VIKRAM is an Indian stock-market intelligence platform built around trustworthy NSE data, explainable research, rule-based scanning, accumulation intelligence, hidden-gem discovery, opportunity discovery, VIKRAM Lite official-file workflows, subscriptions, themes, detection-history intelligence, and future live-market/alert infrastructure.

### Governing principle

> Build only what the data can honestly support.

Never fabricate prices, volume, delivery, Futures OI, fundamentals, ownership data, history, scores, scanner matches, probabilities, detection dates, detection durations, or alert delivery status.

---

## 2. Core Architecture

```text
NSE EOD / Authorized Providers / VIKRAM Lite Official Files
                         ↓
                  Data Ingestion
                         ↓
            Validation + Provenance + Freshness
                         ↓
                Normalized Market Data
                         ↓
             Historical Trading-Day Storage
                         ↓
              Research + Scanner Engines
                  ↙       ↓        ↘
       Accumulation   Hidden Gems   Opportunity Radar
                  \       |        /
                   Detection History
                         ↓
                Option B Rule Builder
                         ↓
                   Match Detector
                         ↓
                    Alert Engine
                         ↓
                  Email / Browser Push
                         ↓
                    VIKRAM Web App
```

The browser receives optimized snapshots/API responses, not raw NSE archives.

---

## 3. Data Trust Architecture

Every market-data feature must expose its status where applicable:

- `EOD VERIFIED`
- `LIVE`
- `LIVE-READY`
- `DATA N/A`
- `STALE`
- `INSUFFICIENT_HISTORY`

Rules:

- EOD data must never be presented as LIVE.
- Missing data remains N/A.
- Insufficient history remains N/A/INSUFFICIENT_HISTORY.
- Exact-date Futures OI is required for OI-confirmed accumulation evidence.
- Invalid snapshots must not deploy.
- No NSE WAF/CAPTCHA/rate-limit bypass.

---

## 4. Scanner Universe Selection — ALL STOCKS / NIFTY 50 / NIFTY 200 / NIFTY 500

Every major scanner must support one simple, beginner-friendly universe selector:

`ALL STOCKS | NIFTY 50 | NIFTY 200 | NIFTY 500`

### Meaning

- **ALL STOCKS** — all stocks in VIKRAM's validated supported universe.
- **NIFTY 50** — constituents effective for the selected EOD date.
- **NIFTY 200** — constituents effective for the selected EOD date.
- **NIFTY 500** — constituents effective for the selected EOD date.

### UX rule

- Click/tap a universe directly.
- No Apply button.
- Selection immediately refreshes results.
- Clearly show the selected universe, data status, EOD date, and number of constituents checked.
- Example: `NIFTY 200 • EOD VERIFIED • 05 Sep 2026 • 200 constituents checked`.
- If membership data is unavailable/unverified, show `DATA N/A`; never imply that the universe was successfully scanned.

### Scope

The selector applies to:

- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- Option B Rule Builder / Scanner
- future saved scanner presets
- alerts generated from saved scans

### Historical integrity

Index membership is time-dependent. Historical scans must use the constituent set effective on the historical EOD date. Today's membership must not be substituted for historical membership.

A validated constituent record should contain:

```text
indexName
symbol
effectiveFrom
effectiveTo
source
sourceDate
status
```

The selected universe must be stored with scan results, saved scans, and alerts so the result remains interpretable.

Detection streaks are scoped by engine and universe context; changing from All Stocks to an index must not merge unrelated streaks.

---

## 5. Historical Detection / Streak Intelligence

VIKRAM must not only say that a stock currently qualifies. It must show **how long the stock has continuously qualified** for each discovery engine and relevant saved scan.

This applies independently to:

- Accumulation Scanner
- Opportunity Radar
- Hidden Gems
- Option B saved scans where historical match tracking is enabled

### Required fields

Every eligible discovery result should support:

- `firstDetectedDate` — first verified trading date of the current continuous qualifying streak
- `latestDetectedDate` — latest verified trading date on which it qualified
- `detectedTradingDays` — number of consecutive verified trading sessions in the current streak
- `detectionStatus` — Active / New / N/A as appropriate
- selected `universe`

### User-facing presentation

Examples:

> **Caught for 8 trading days**  
> **Since: 27 Aug 2026**  
> **Last detected: 05 Sep 2026**

For a newly qualifying stock:

> **New today**  
> **Since: 05 Sep 2026**

### Streak rules

- Count **trading sessions**, not calendar days.
- A stock remains in the same streak only while it qualifies on consecutive available trading sessions.
- If it fails the relevant engine's qualifying rule, the current streak ends.
- A later re-qualification starts a new streak.
- Missing/invalid source data must not silently extend a streak.
- Historical VIKRAM scores must be calculated only from genuine historical data; never fabricate retroactive matches.
- Each engine has its own qualification definition.
- Universe context is part of the streak context.
- Rule-version changes must be handled explicitly and must not create false continuity.

### Required storage model

A detection-history record should contain at least:

```text
engine
symbol
tradeDate
qualifies
score (when applicable)
verdict (when applicable)
dataStatus
universe
reason/version of rule
```

The UI may derive the current streak from verified historical detection records, or consume precomputed streak metadata from the backend/snapshot.

---

## 6. Historical Data Foundation

Required analytical periods:

- 1D
- 1W
- 1M
- 3M
- 6M
- 1Y

Historical data supports trend calculations, volume ratios, OBV, moving averages, technical indicators, accumulation evidence, Hidden Gems, Opportunity Radar, detection streaks, and future backtesting.

Never fabricate retroactive history or VIKRAM scores.

---

## 7. Accumulation Scanner

The EOD Accumulation Scanner uses genuine evidence:

- price
- volume
- delivery
- OBV
- Futures OI where applicable
- multi-period confirmation
- liquidity/data quality

Outputs:

- score
- verdict
- Why explanation
- data status
- selected universe
- **Caught for X trading days**
- **Caught since DATE**
- latest detection date
- New Today when the current streak is one trading day

The streak is based on the Accumulation Scanner's own qualifying rule, not merely whether the stock appeared in a previous snapshot.

Unavailable metrics remain N/A.

---

## 8. Hidden Gems

Hidden Gems operates on the full supported NSE universe or the selected index universe.

Evidence can include:

- accumulation
- volume expansion
- delivery
- OBV
- OI where applicable
- multi-period confirmation
- liquidity/data quality

Every candidate must explain WHY it qualifies.

### Detection history

Hidden Gems must also show:

- **Caught for X trading days**
- **Caught since DATE**
- latest detected date
- New today when the current streak is one trading day
- selected universe

Hidden Gems streaks are independent from Accumulation and Radar streaks.

---

## 9. Opportunity Radar

Filters:

- ALL
- CONFIRMED
- STARTING
- HIDDEN GEMS
- VOLUME BREAKOUT
- HIGH DELIVERY
- OI BUILD-UP

Primary columns include Rank, Stock, Price, Change, Accumulation, Volume, Delivery, OI, Score, and WHY.

### Detection history

Opportunity Radar must show:

- **Caught for X trading days**
- **Caught since DATE**
- latest detected date
- current radar category
- selected universe
- New Today state where applicable

The streak must follow the Radar qualification rule/category and must reset when the stock stops qualifying.

---

## 10. Option B — Visual Rule Builder

Option B is the Chartink-style inbuilt scanner.

Expected capabilities:

- AND / ALL
- OR / ANY
- NOT / NONE
- nested groups
- field-to-field comparisons
- technical indicators
- price conditions
- volume conditions
- delivery conditions
- supported fundamental/ownership fields
- VIKRAM-native conditions
- universe selector: All Stocks / Nifty 50 / Nifty 200 / Nifty 500
- presets
- saved scans
- selected universe stored with saved scans
- match explanations
- historical match tracking when enabled
- proper N/A and insufficient-history behavior

Option B remains independent of notification infrastructure.

---

## 11. VIKRAM Lite

VIKRAM Lite is the offline-friendly official-file workflow.

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

Daily/regular sources should use legitimate official downloadable files where available. VIKRAM must clearly identify the source and date of each imported file.

The Lite control panel should provide:

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

The workflow must validate file date, schema, source and completeness before importing data. Unsupported/unavailable sources must be marked unavailable rather than replaced with invented values.

Browser-only GitHub Pages cannot write arbitrary local folders; true automatic folder placement requires a local process/desktop/local server.

---

## 12. Themes and UX

VIKRAM has one shared engine with selectable themes:

1. **Aurora** — flagship/default
2. **Galaxy** — student/teen exploration
3. **Academic** — parents/teachers/schools
4. **NeoGlass** — premium alternative
5. **Calm** — focus/wellbeing
6. **Duology** — animated kids experience

Every theme supports:

- Light
- Dark
- System

Theme selection changes presentation only; the underlying data, scoring, scanner rules, detection history and trust model remain shared.

The UI should be beautiful, pleasant, readable, beginner-friendly, and not excessively white. Tables, filters, subscription controls and detection-history labels must remain understandable across themes and mobile layouts.

---

## 13. Subscription / Plans

VIKRAM may provide a free tier and paid plans. Subscription state belongs to the account/billing layer, not the scanner engine.

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

Prices are product-plan placeholders and must be finalized before production billing is enabled. No payment is considered live merely because a pricing UI exists.

Required production billing controls:

- secure provider integration
- server-side verification
- subscription status
- renewal/cancellation handling
- access-control enforcement
- billing history
- failure handling

Plan entitlements must be enforced server-side for protected capabilities; the frontend must not be the sole authority for paid access.

---

## 14. Portfolio / Search / Stock Analysis

Search must work beyond any legacy five-stock sample.

Stock Analysis must load actual verified market/scanner data.

Portfolio must use verified prices where available and show N/A where unavailable.

No fake values.

---

## 15. Alert Architecture

```text
SCANNER / OPTION B
       ↓
NEW MATCH + STREAK CHANGE DETECTOR
       ↓
ALERT ENGINE
       ↓
USER PREFERENCES
       ↓
EMAIL / PUSH
       ↓
USER
```

Alerts may distinguish:

- New match today
- Streak extended
- Streak ended
- Important verdict/category change

Alert records should retain the relevant engine, symbol, selected universe, detection date/streak context, and rule version where applicable.

Required: deduplication, once-per-stock-per-day, preferences, history, PENDING/SENT/FAILED, provider failure isolation, deep links, and multiple users where accounts exist.

Scanner success must not depend on notification success.

---

## 16. Automated Execution

Target:

```text
Scheduler
→ latest valid data
→ historical update
→ scanner generation
→ detection-history update
→ streak calculation
→ new-match/streak-change detector
→ alert engine
→ notifications
→ validated deployment
```

Do not require the user to manually open the website for scheduled processing.

---

## 17. Security

- no provider secrets in frontend
- no private keys in GitHub
- server-side environment secrets
- no frontend notification sending
- no insecure credential workarounds
- no exchange security bypass
- billing secrets server-side
- API security and access control required for production

---

## 18. Testing

Add explicit tests for detection history:

- first qualifying day
- second consecutive qualifying day
- 5/10/20 trading-day streaks
- weekend/holiday gaps counted correctly
- failed qualification resets streak
- re-qualification starts a new streak
- missing data does not extend a streak
- separate engine streaks remain independent
- separate universe streaks remain independent
- exact `Caught Since` date
- latest detection date
- one-day `New today` state
- historical rule-version changes handled explicitly
- historical index membership uses effective-date constituents
- unavailable/unverified constituent lists produce DATA N/A
- saved scans retain universe context

Also retain existing tests for data, exact-date OI, scoring, Option B, alerts, security, cache freshness, and UI.

---

## 19. Production Release Gate

Production release requires physical evidence for:

- source of truth
- full supported NSE universe
- validated index constituent datasets
- historical data
- six periods
- scanner
- Hidden Gems
- Opportunity Radar
- detection streaks/dates
- universe selector
- VIKRAM Lite where enabled
- subscription access control before billing
- theme switching and responsive UX
- validation
- tests
- automation
- real provider tests where applicable
- deployment
- desktop verification
- mobile verification
- integrity audit
- no fabrication

Do not declare completion from code existence alone.

### Status model

```text
CODE COMPLETE
DATA GENERATED
TESTED
PROVIDER TESTED
PRODUCTION VERIFIED
```

These states must remain distinct.

---

## 20. Future Expansion

After the production foundation is proven:

- intraday timeframes
- authorized live feeds
- live OI/volume
- options
- market-regime engine
- live scans
- alerts
- no-code Strategy Lab
- validated backtesting
- natural-language scanning
- AI-assisted research
- multi-provider architecture
- authorized broker integration

Do not implement a feature before its required data foundation exists.
