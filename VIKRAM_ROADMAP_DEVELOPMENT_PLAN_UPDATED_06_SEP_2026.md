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

Freeze terminology, data-trust policy, scoring philosophy, schemas, navigation, freshness labels, scanner architecture, detection-history rules, alert architecture, theme architecture, subscription architecture, and security rules.

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

### Option B

- Visual Rule Builder
- AND / OR / NOT
- nested groups
- field comparisons
- technical indicators
- VIKRAM-native conditions
- presets
- saved scans
- match explanations
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
- **Caught for X trading days**
- **Caught Since date**
- latest detection date
- New Today state

---

# PHASE 4 — FULL NSE DATA FOUNDATION

**Status: CODE FOUNDATION EXISTS / REAL DATA PROOF REQUIRED**

Deliver:

- full supported NSE universe
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

**Status: NEW REQUIREMENT / IMPLEMENTATION REQUIRED**

This phase makes VIKRAM explain not only **what it catches today**, but **how long it has continuously caught it**.

### Engines covered

- Accumulation Scanner
- Opportunity Radar
- Hidden Gems
- Option B saved scans where historical match tracking is enabled

### Required fields

- `firstDetectedDate`
- `latestDetectedDate`
- `detectedTradingDays`
- `detectionStatus`

### Rules

1. Count trading sessions, not calendar days.
2. Current streak begins on the first consecutive qualifying trading session.
3. Any verified failed qualifying session ends the current streak.
4. Re-qualification begins a new streak.
5. Missing/invalid data must not silently extend a streak.
6. Each engine has its own independent streak.
7. Historical results must come from genuine historical data.

### UI examples

> **Caught for 8 trading days**  
> **Since: 27 Aug 2026**  
> **Last detected: 05 Sep 2026**

New result:

> **New today**  
> **Since: 05 Sep 2026**

### Verification

Test 1-day, multi-day, reset, re-entry, weekend/holiday, missing-data, and engine-independence cases.

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
- **Caught for X trading days**
- **Caught Since date**
- latest detection date

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

- **Caught for X trading days**
- **Caught Since date**
- latest detection date
- New Today state

Both must operate on the actual supported full NSE universe, not legacy sample data.

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

---

# PHASE 11 — ALERT ENGINE

**Status: CODE IMPLEMENTED / PRODUCTION VERIFICATION REMAINING**

Architecture:

```text
Scanner
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

- Free — ₹0
- VIKRAM PRO — ₹499/month
- VIKRAM PRO+ — ₹999/month

These are initial plan placeholders until production billing is finalized.

Required before charging users:

- secure payment/subscription provider
- server-side payment verification
- account/subscription state
- feature access control
- renewal/cancellation handling
- billing history
- payment failure handling

A pricing page alone does not constitute live billing.

---

# PHASE 15 — LIVE MARKET DATA

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

# PHASE 16 — CLOUD / VPS PRODUCTION

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

# PHASE 17 — FULL TEST + REGRESSION

**Status: FINAL EXECUTION REQUIRED**

Run all tests for:

- full-universe validation
- historical coverage
- six periods
- stale/malformed data
- exact-date OI
- scanner scoring
- Option B
- Accumulation Scanner
- detection streaks
- Hidden Gems
- Opportunity Radar
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

# PHASE 18 — PRODUCTION VERIFICATION

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
- period switching
- detection dates and streaks

### Mobile

Verify the same critical flows, including table scrolling, filters, theme controls, subscription UI, and detection-history display.

Check console errors, broken assets, stale data, overflow, and accessibility/readability issues.

---

# PHASE 19 — FINAL DATA-INTEGRITY AUDIT

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

Preserve legitimate educational/fundamental content.

---

# PHASE 20 — FINAL RELEASE GATE

Release only after physical evidence proves:

1. source of truth identified
2. Option B verified
3. full NSE universe proven
4. historical data proven
5. six periods proven
6. scanner proven
7. detection-history/streak engine proven
8. Hidden Gems proven
9. Opportunity Radar proven
10. VIKRAM Lite validated where enabled
11. validation proven
12. tests proven
13. automated scanning proven
14. email provider test proven where enabled
15. push provider test proven where enabled
16. subscriptions verified before billing activation
17. deployment proven
18. desktop proven
19. mobile proven
20. no fabrication proven

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
4. Prove six historical periods.
5. Implement and test detection-history/streak intelligence for Accumulation, Radar and Hidden Gems.
6. Prove full-universe Hidden Gems and Radar.
7. Complete VIKRAM Lite official-file workflow.
8. Fix remaining data-integrity issues.
9. Make scanner + detection-history execution automatic.
10. Configure/test real notification providers.
11. Finalize subscription billing architecture before charging users.
12. Deploy and verify desktop/mobile.
13. Run final integrity audit.
14. Update final status documents.
15. Declare gates truthfully.

# ROADMAP END
