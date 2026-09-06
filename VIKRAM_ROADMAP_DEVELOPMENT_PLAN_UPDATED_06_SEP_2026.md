# VIKRAM — MASTER ROADMAP & DEVELOPMENT PLAN — UPDATED 06 SEP 2026

## ROADMAP PRINCIPLE

Build in gates. Do not declare completion from code existence alone.

Every gate distinguishes:

- Code Complete
- Data Generated
- Tested
- Provider Tested
- Production Verified

No fabrication.

---

# PHASE 0 — BLUEPRINT FREEZE

**Status: FOUNDATION DEFINED**

Freeze terminology, data-trust policy, scoring philosophy, schemas, navigation, freshness labels, scanner architecture, detection-history rules, universe-selection rules, alert architecture, theme architecture, subscription architecture, VIKRAM Lite architecture, and security rules.

---

# PHASE 1 — UX FOUNDATION

**Status: IMPLEMENTED / CONTINUOUS POLISH**

Deliver:

- modern VIKRAM navigation
- responsive desktop/mobile layout
- sticky headers and readable tables
- freshness/data-status indicators
- pleasant Light/Dark/System modes
- six selectable themes: Aurora, Galaxy, Academic, NeoGlass, Calm, Duology
- beginner-friendly discovery pages
- simple filters and selectors without unnecessary Apply buttons
- subscription/plans UI foundation

Production deployment must still be visually verified.

---

# PHASE 2 — RESEARCH CORE

**Status: IMPLEMENTED / VERIFY**

Deliver:

- VIKRAM scoring
- pillars
- explainability
- risk penalty
- contradiction detection
- sector views
- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- freshness/data-status behavior

---

# PHASE 3 — SCANNER / OPTION B

**Status: IMPLEMENTED / FINAL VERIFICATION REQUIRED**

### Shared Universe Selector

All scanner surfaces must provide a simple immediate selector:

`ALL STOCKS | NIFTY 50 | NIFTY 200 | NIFTY 500`

No Apply button. Selection refreshes results immediately.

It applies to:

- Accumulation Scanner
- Hidden Gems
- Opportunity Radar
- Option B
- future saved presets and alerts

The selected universe must be visible with EOD status/date and constituent count. If constituent membership is unavailable or unverified, show `DATA N/A`.

Historical scans must use constituents effective on the historical EOD date. No today's-membership substitution.

### Option B

- Visual Rule Builder
- AND / OR / NOT
- nested groups
- field comparisons
- technical indicators
- VIKRAM-native conditions
- universe selection
- presets
- saved scans
- saved universe context
- match explanations
- historical match tracking when enabled
- `/api/scanner/query`
- regression tests

Option B must be verified independently from the Accumulation Scanner.

### Accumulation Scanner

- price
- volume
- delivery
- OBV
- Futures OI where applicable
- transparent score/verdict/Why
- selected universe
- **Caught for X trading days**
- **Caught Since date**
- latest detection date
- New Today state

---

# PHASE 4 — FULL NSE DATA FOUNDATION

**Status: CODE FOUNDATION EXISTS / REAL DATA PROOF REQUIRED**

Deliver:

- full supported NSE universe
- validated Nifty 50/200/500 constituent datasets
- legitimate EOD ingestion
- historical trading-day storage
- normalized market-data layer
- validation
- rolling history
- scanner materialization
- optimized snapshots/API
- detection-history materialization

Required evidence:

- exact universe count
- exact index constituent counts
- exact latest EOD date
- exact historical trading-day count
- exact period counts
- exact scanner counts
- exact detection-history coverage

---

# PHASE 5 — MULTI-PERIOD ANALYSIS

**Status: CODE FOUNDATION EXISTS / VERIFY DATA**

Required:

- 1D
- 1W
- 1M
- 3M
- 6M
- 1Y

No fabricated history.

---

# PHASE 6 — DETECTION HISTORY & STREAK INTELLIGENCE

**Status: REQUIREMENT DEFINED / IMPLEMENTATION REQUIRED**

This phase makes VIKRAM explain not only **what it catches today**, but **how long it has continuously caught it**.

### Engines covered

- Accumulation Scanner
- Opportunity Radar
- Hidden Gems
- Option B saved scans where historical match tracking is enabled

### Required display

Every eligible current result should support:

- **Caught for X trading days**
- **Since: DATE**
- **Last detected: DATE**
- **New today** when the current streak is one trading day
- selected universe

### Required fields

- `firstDetectedDate`
- `latestDetectedDate`
- `detectedTradingDays`
- `detectionStatus`
- `universe`

### Rules

1. Count trading sessions, not calendar days.
2. Current streak begins on the first consecutive qualifying trading session.
3. Any verified failed qualifying session ends the current streak.
4. Re-qualification begins a new streak.
5. Missing/invalid data must not silently extend a streak.
6. Each engine has its own independent streak.
7. Universe context is part of the streak context.
8. Historical results must come from genuine historical data.
9. Rule-version changes must be handled explicitly.
10. Historical index membership must use effective-date constituents.

### Verification

Test 1-day, 5-day, 10-day, 20-day, reset, re-entry, weekend/holiday, missing-data, engine-independence, universe-independence, and rule-version cases.

---

# PHASE 7 — HIDDEN GEMS + OPPORTUNITY RADAR

**Status: CODE IMPLEMENTED / FULL-UNIVERSE PROOF REQUIRED**

### Hidden Gems

- accumulation
- volume expansion
- delivery
- OBV
- OI where applicable
- multi-period confirmation
- liquidity/data quality
- WHY explanation
- selected universe
- **Caught for X trading days**
- **Caught Since date**
- latest detection date
- New Today state

### Opportunity Radar

Filters:

- ALL
- CONFIRMED
- STARTING
- HIDDEN GEMS
- VOLUME BREAKOUT
- HIGH DELIVERY
- OI BUILD-UP

Add:

- selected universe
- **Caught for X trading days**
- **Caught Since date**
- latest detection date
- New Today state

Both must operate on the actual supported universe, not legacy sample data.

---

# PHASE 8 — PORTFOLIO / SEARCH / STOCK ANALYSIS

**Status: IMPLEMENTED / VERIFY**

- full supported-universe search
- verified stock analysis
- verified portfolio prices
- N/A when unavailable
- no synthetic values

---

# PHASE 9 — VIKRAM LITE

**Status: FOUNDATION STARTED / MAJOR IMPLEMENTATION REMAINING**

Folder structure:

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

Control panel:

- NSE Bhav Copy
- NSE Delivery
- 52 Week High/Low
- BSE Bhav Copy
- Corporate Actions
- Shareholding
- Financial Results
- MF/FII/DII
- News / Announcements
- Update VIKRAM

Requirements:

- official/authorized sources only
- file/date/schema validation
- correct folder placement
- no fabricated fallback
- connect imported files to the research/scanner pipeline
- source and date provenance for every imported file
- true automatic local folder writing requires a local process/desktop/local server rather than GitHub Pages alone

---

# PHASE 10 — AUTOMATED DATA PIPELINE

**Status: PARTIAL — CRITICAL VERIFICATION REMAINING**

Target:

```text
Scheduler
→ EOD ingestion
→ validation
→ historical update
→ scanner generation
→ detection-history update
→ streak calculation
→ snapshot
→ deployment
```

Requirements:

- automated weekday execution
- on-demand update where appropriate
- validation before deployment
- invalid data blocks release
- no synthetic fallback
- universe membership validation before index-scoped scans

---

# PHASE 11 — ALERT ENGINE

**Status: CODE IMPLEMENTED / PRODUCTION VERIFICATION REMAINING**

Architecture:

```text
Scanner / Option B
→ New Match / Streak Change Detector
→ Alert Engine
→ Preferences
→ Providers
→ User
```

Alerts may include:

- new scanner match
- streak extended
- streak ended
- major verdict/category change

Alert context should retain engine, symbol, selected universe, detection date/streak context, and rule version where applicable.

Required: deduplication, once-per-stock-per-day, preferences, history, failure isolation, deep links, and multi-user support where accounts exist.

---

# PHASE 12 — EMAIL

**Status: CODE READY / REAL PROVIDER TEST REQUIRED**

- configure server-side provider
- configure secret
- configure sender identity
- controlled real test
- verify receipt
- verify alert history
- verify failure handling

---

# PHASE 13 — MOBILE / BROWSER PUSH

**Status: CODE READY / REAL DEVICE TEST REQUIRED**

- HTTPS
- service worker
- permission
- subscription/token
- secure persistence
- server-side sender
- controlled test
- actual notification verification
- deep link
- invalid subscription cleanup

Never claim DELIVERED without provider evidence.

---

# PHASE 14 — SUBSCRIPTIONS / ACCOUNT ACCESS

**Status: PRODUCT DESIGN DEFINED / PRODUCTION BILLING REMAINS**

Initial plans:

- **Free — ₹0**
- **VIKRAM PRO — ₹499/month**
- **VIKRAM PRO+ — ₹999/month**

Current product entitlements:

### Free
- basic stock search
- basic market analysis
- limited discovery views
- basic EOD intelligence

### PRO
- full Accumulation Scanner
- full Hidden Gems
- full Opportunity Radar
- advanced analysis and filters
- portfolio intelligence
- additional historical/research features

### PRO+
- everything in PRO
- advanced institutional/accumulation intelligence
- premium reports/insights
- priority features/data capabilities when supported

Prices are placeholders until production billing is finalized.

Required before charging users:

- secure payment/subscription provider
- server-side payment verification
- account/subscription state
- feature access control
- renewal/cancellation handling
- billing history
- payment failure handling

A pricing page does not constitute live billing. Paid access must not rely only on frontend checks.

---

# PHASE 15 — THEMES / DESIGN SYSTEM

**Status: ARCHITECTURE DEFINED / IMPLEMENTATION & PRODUCTION VERIFICATION CONTINUE**

One VIKRAM OS/platform with a shared engine and six selectable themes:

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

Theme changes presentation only. Data, scoring, scanner rules, detection history and trust rules remain shared.

The existing Galaxy/space-style student starter experience remains part of the architecture where defined; after entering the starter experience, the shared VIKRAM OS Theme Engine provides the selectable themes.

---

# PHASE 16 — LIVE MARKET DATA

**Status: FUTURE / INFRASTRUCTURE DEPENDENT**

Requires:

- authorized reliable provider
- timestamped feed
- secure backend
- provider abstraction
- actual LIVE verification

Keep EOD and LIVE physically/logically separated.

Future capabilities:

- LTP
- intraday
- live volume
- live OI
- options
- market regime
- live scans

---

# PHASE 17 — CLOUD / VPS PRODUCTION

**Status: TARGET ARCHITECTURE**

```text
Browser
→ Frontend
→ Secure Backend
→ PostgreSQL / Data Services
→ Authorized Providers
```

Requirements:

- central database
- scheduled jobs
- secrets management
- backups
- monitoring
- API security
- access control
- recovery

---

# PHASE 18 — FULL TEST + REGRESSION

**Status: FINAL EXECUTION REQUIRED**

Run all tests for:

- full-universe validation
- Nifty 50/200/500 membership and effective-date logic
- historical coverage
- six periods
- stale/malformed data
- exact-date OI
- scanner scoring
- Option B
- Accumulation Scanner
- detection streaks and dates
- Hidden Gems
- Opportunity Radar
- universe selector
- saved-scan universe persistence
- alert engine
- email
- push
- subscriptions/access control
- security
- cache freshness
- theme switching
- Light/Dark/System modes
- desktop/mobile UI

Do not reuse old test counts without rerunning.

---

# PHASE 19 — PRODUCTION VERIFICATION

### Desktop

Verify:

- Home
- Search
- Analysis
- Accumulation Scanner
- Option B
- Hidden Gems
- Opportunity Radar
- Portfolio
- Alerts
- VIKRAM Lite
- Plans/Billing
- Theme selector
- Light/Dark/System
- universe selector
- period switching
- detection dates and streaks

### Mobile

Verify the same critical flows, including table scrolling, filters, universe controls, theme controls, subscription UI, and detection-history display.

Check console errors, broken assets, stale data, overflow, and accessibility/readability issues.

---

# PHASE 20 — FINAL DATA-INTEGRITY AUDIT

Search active production code for:

- Math.random market values
- mock prices
- synthetic prices
- fake volume
- fake delivery
- fake OI
- hard-coded market dates
- five-stock restrictions
- fake scanner results
- fabricated historical detection streaks
- fabricated index membership

Preserve legitimate educational/fundamental content.

---

# PHASE 21 — FINAL RELEASE GATE

Release only after physical evidence proves:

1. source of truth identified
2. Option B verified
3. full NSE universe proven
4. Nifty 50/200/500 constituent datasets proven
5. historical data proven
6. six periods proven
7. scanner proven
8. detection-history/streak engine proven
9. universe selector proven
10. Hidden Gems proven
11. Opportunity Radar proven
12. VIKRAM Lite validated where enabled
13. validation proven
14. tests proven
15. automated scanning proven
16. email provider test proven where enabled
17. push provider test proven where enabled
18. subscriptions/access control verified before billing
19. themes and modes verified
20. deployment proven
21. desktop proven
22. mobile proven
23. no fabrication proven

If any mandatory item is UNVERIFIED or FAIL:

> **VIKRAM PHASE A — NOT COMPLETE**

Do not use a percentage as a substitute for evidence.

---

# FUTURE ROADMAP AFTER PHASE A

### Trading Intelligence

- daily trade-readiness
- rule-based setups
- live trade setups when live data exists
- market regime

### Live Infrastructure

- licensed live feeds
- intraday timeframes
- live OI/options
- live alerts
- regime engine

### Strategy Lab

- no-code strategy builder
- validated backtesting
- historical VIKRAM-score backtests

### Advanced Intelligence

- natural-language scanning
- AI-assisted research
- multi-provider live data
- authorized broker integration

---

# CURRENT PRIORITY ORDER

1. Verify the actual production source of truth.
2. Verify Option B independently.
3. Prove full NSE data generation.
4. Prove Nifty 50/200/500 membership datasets and historical effective dates.
5. Prove six historical periods.
6. Implement and test detection-history/streak intelligence for Accumulation, Radar and Hidden Gems.
7. Implement the shared All Stocks / Nifty 50 / Nifty 200 / Nifty 500 selector and connect it to all scanner surfaces.
8. Prove full-universe Hidden Gems and Radar.
9. Complete VIKRAM Lite official-file workflow.
10. Fix remaining data-integrity issues.
11. Make scanner + detection-history execution automatic.
12. Configure/test real notification providers.
13. Finalize subscription billing architecture before charging users.
14. Complete theme implementation/production verification.
15. Deploy and verify desktop/mobile.
16. Run final integrity audit.
17. Update final status documents.
18. Declare gates truthfully.

# ROADMAP END
