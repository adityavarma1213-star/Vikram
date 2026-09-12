# VIKRAM HIDDEN GEMS — ALGORITHM SPECIFICATION (RESEARCH DRAFT)

Status: **RESEARCH / DESIGN DOCUMENT — NOTHING HERE IS IMPLEMENTED IN PRODUCTION**
Scope: forensic audit of the current codebase (both ZIPs, treated as one repo tree —
`Vikram-main/` contains the app, `accumulation/`, `server/`, and `backtest/` all in one place)
plus a from-scratch design proposal for a statistically defensible Hidden Gems system.

No production files were modified to produce this document. `accumulation/engine.js` and the
production Accumulation Scanner were read-only inputs.

Every claim below cites the actual file/function it comes from. Every number that is not
literally present in the code today is labeled `REQUIRES BACKTESTING` and must not be read as
a recommendation to ship that number.

---

## LABEL KEY (used throughout)

- **APPROVED CONCEPT** — sound reasoning, no numeric commitment yet; safe to build the *shape* of.
- **RESEARCH HYPOTHESIS** — plausible, argued from first principles, unproven on VIKRAM data.
- **REQUIRES BACKTESTING** — any specific number, weight, or cutoff. None are final.
- **DATA REQUIRED** — the idea depends on a data source that does not exist yet in the repo.
- **NOT IMPLEMENTED** — explicitly out of scope for this pass; do not build yet.
- **REJECTED** — evaluated and found unsound; kept here so it isn't proposed again without new evidence.

---

# A. CURRENT IMPLEMENTATION AUDIT

## A.1 Headline finding

**There is no single Hidden Gems implementation.** There are three independent, mutually
inconsistent code paths that each paint over the label "Hidden Gems," plus two dead stub files
that look like a fourth was planned and abandoned. None of them measure recognition,
institutional ownership, index tier, or detection-to-recognition lead time. All of them are
downstream re-slices of a score that already exists for another purpose (the Accumulation
Scanner's evidence score). This matches the owner's stated suspicion in the brief ("simply a
filtered Accumulation Scanner view") — confirmed, and worse than a single filtered view: it's
three different, contradictory filtered views shipping simultaneously.

## A.2 The three live implementations, with exact evidence

**1. `js/discoveryRepair.js`, function `boot()` (line 18)**
```
const gems = rows.filter(r => r.score != null && r.score >= 55 && r.score < 75
                             && r.verdict !== 'DISTRIBUTION');
```
- Source of `rows`: `data/scanner.json`, the static snapshot produced by
  `server/src/staticSnapshot.js`, which is itself built from `server/src/scannerEngine.js`
  (a server-side port of the same logic as `accumulation/engine.js`).
- Definition of "Hidden Gem" here: **any stock whose Accumulation Scanner score falls in the
  55–74.9 band** — i.e., exactly the scanner's own `verdicts.starting` tier
  (`accumulation/config.js` line 15: `starting: 55`, `confirmed: 75`). This file does not add
  any evidence; it relabels an existing Accumulation Scanner verdict tier as "Hidden Gems."
- Renders into `#hiddenGemsPreview` on `index.html`.

**2. `js/app.js`, function `renderVerifiedDataSurfaces` → `renderDerived('Hidden Gems','hidden')` (line 359–382)**
```
if (!Number.isFinite(score) || score < 75 || verdict.includes('DISTRIBUTION')) return false;
if (mode === 'hidden') return delivery >= 45 && obv > 0;
```
- Same `data/scanner.json` source.
- Definition of "Hidden Gem" here: score **≥ 75** (i.e. the `ACCUMULATION CONFIRMED` tier) **and**
  delivery ≥ 45% **and** OBV trend > 0.
- This directly **contradicts** implementation #1: #1 requires score < 75, this one requires
  score ≥ 75. A stock cannot satisfy both. If both scripts run against the same page (they can:
  both attach to DOM elements searched by id/heading text), the two "Hidden Gems" surfaces on
  the same session can show completely disjoint stock lists under the same heading, with no
  indication to the user that two different definitions are in play.

**3. `js/ui.js` (and duplicate root `ui.js`), function `renderHiddenGems` (line 346)**
```
const sortedByCap = [...results].sort((a,b) => a.marketCapValue - b.marketCapValue);
const medianCap = sortedByCap[Math.floor(sortedByCap.length/2)].marketCapValue;
const gems = results.filter(r => r.marketCapValue <= medianCap && (r.score ?? 0) >= 60);
```
- Source of `results`: `scanAllCompanies()` (line 253), which reads `window.VIKRAM_COMPANY_DATABASE`
  (`js/companyDatabase.js`) and calls `window.VIKRAM_ENGINE.analyzeAsset(ticker)` (`js/engine.js`)
  — a **third, separate scoring engine** ("VIKRAM Score" + BUY/AVOID rating), not
  `accumulation/engine.js` and not `server/src/scannerEngine.js`.
- `js/companyDatabase.js` / `js/financialData.js` contain **exactly 5 hardcoded companies**
  (CDSL, NEWGEN, TCS, INFY, RELIANCE) with hand-typed fundamentals and a single static
  institutional-holding snapshot dated "approximately the March 2026 quarter"
  (`js/financialData.js`, header comment, lines 9–20).
- Definition of "Hidden Gem" here: **below the median market cap of whichever 5 stocks happen
  to be in the demo database**, and VIKRAM Score ≥ 60. This is a third, disjoint definition,
  running on a third, disjoint dataset that has nothing to do with the real 5-year NSE pipeline.
  With only 5 stocks, "below the median" is a relative, database-size-dependent filter, not a
  market-wide statement about anything (the code's own doc-comment on line 342 admits this).

**4. Dead stubs**: `js/hiddenGems.js` and `js/opportunity.js` are **both 0 bytes**. They are
referenced nowhere else. Whatever module was meant to live there was either never written or
was removed and left as an empty file. Treat this as evidence that a dedicated Hidden Gems
module was *planned* but never actually built — the three implementations above are, at best,
UI-layer patches ("`discoveryRepair`", `renderVerifiedDataSurfaces`'s own comment calls itself
"VIKRAM DATA SURFACES REPAIR") on top of Accumulation Scanner output, not a designed subsystem.

## A.3 Point-by-point answers to the audit questions

| Question | Answer | Evidence |
|---|---|---|
| Is Hidden Gems independent, or a filtered Accumulation Scanner view? | **A filtered/relabeled view**, three different ways, none independent. | §A.2 above |
| Current formula? | None. Each of the 3 paths uses a **threshold filter**, not a score/formula of its own. | §A.2 |
| Current thresholds? | 55–74.9 (path 1); ≥75 & delivery≥45 & OBV>0 (path 2); below-median-cap & score≥60 (path 3). Mutually contradictory. | §A.2 |
| Current data? | Paths 1–2: real EOD data via `data/scanner.json` (see §A.4 on how "real" that data currently is). Path 3: a 5-stock hardcoded demo object. | §A.2 |
| Current universe? | Paths 1–2: whatever symbols are in the latest `data/scanner.json` snapshot (see `server/src/staticSnapshot.js`, `NSE_EQUITY_UNIVERSE`). Path 3: the 5 demo tickers only. No universe selector is wired to any of the three (contrast with the *already-designed* selector requirement in the index-universe blueprint addendum — §A.6). | §A.2, §A.6 |
| Does NIFTY 50/200/500 membership affect selection? | **No**, in all three paths. Index membership is computed and attached to scanner rows (`server/src/staticSnapshot.js` line 79, `indexMembership: ... membershipFor(...)`) but none of the three Hidden Gems code paths reads that field. | §A.5 |
| Is institutional ownership used? | **No**, not in any of the three. `institutionEngine.js` exists and is called, but only from `frameworkEngine.js` for the single-stock "Analysis" view of the 5 demo companies — never from any Hidden Gems path. | §A.7 |
| Is MF/FII/DII participation used? | Only as a static, single-date, 5-company hand-typed table (`js/financialData.js`), and only reachable through the demo Analysis page, not Hidden Gems. | §A.7 |
| Is market recognition measured? | **No.** There is no attention/news/breakout-recognition signal computed anywhere in Hidden Gems. `js/newsEngine.js` exists but takes manually supplied counts (`positiveNews`, `negativeNews`) as function *parameters* — there is no automated news ingestion, and it is not called from any Hidden Gems path. | §A.2, §A.8 |
| Is VIKRAM first detection measured? | Partially, but not for Hidden Gems. `server/src/staticSnapshot.js`, function `buildCurrentDetection` (line 66), computes a **consecutive-day streak of `ACCUMULATION CONFIRMED`**, walking backward from today until the verdict breaks — giving `firstDetectedDate` / `detectedTradingDays` / `New`-or-`Active`. This is real and well-built, but (a) it is scoped to the Accumulation Scanner's CONFIRMED verdict, not any Hidden Gems concept, (b) it only exists in the live server snapshot pipeline, not in the `backtest/` 5-year pipeline, and (c) it is a *streak length*, not a *lead time to external recognition* — it never asks "did anyone else notice, and when." | §A.9 |
| First detection date/price? | Date: yes, via the streak above (`firstDetectedDate`), for currently-confirmed stocks only, not persisted as an immutable historical event log. Price at that date: **not captured anywhere** — `buildCurrentDetection` returns dates, not prices. | §A.9 |
| Lead time? | **No.** Nothing in the repo computes "sessions between VIKRAM detection and external recognition." There is no definition of "recognition" to measure a lead time against. | §A.9, §G |
| Post-detection performance? | Not for Hidden Gems specifically. The **general** Accumulation signal (`verdict === 'ACCUMULATION CONFIRMED'`) does have a real forward-return harness: `backtest/backtestRunner.js`, function `detectSignalsAndForwardReturns` (line 56), computing 1D/5D/20D/60D/120D forward returns with correct no-look-ahead slicing (`history.slice(0, i+1)`, line 62) and `INSUFFICIENT_FUTURE_DATA` handling when a horizon runs past the end of real data (line 81). This is good infrastructure and is the right base to extend for Hidden Gems — but it currently backtests one signal only (CONFIRMED), with no Hidden/Emerging/Recognized/Ordinary segmentation, and it has **never actually been run against real data** (see §A.4). | §A.4, §K |
| Can it distinguish hidden / emerging / already-recognized / ordinary accumulation / insufficient data? | **No.** The only categories that exist anywhere are the Accumulation Scanner's own three verdicts — `ACCUMULATION CONFIRMED`, `ACCUMULATION STARTING`, `DISTRIBUTION`/`UNCONFIRMED/MIXED` (`accumulation/engine.js` lines 126–133) — plus a `DATA N/A` state for missing F&O evidence (`server/src/scanMaterializer.js` line 78). None of these encode "recognized by whom" or "hidden from whom." | §A.2 |

## A.4 Critical infra finding: the 5-year backtest has never run on real data

This matters enormously for everything the owner is asking for in sections O/14 and P/15, so it
is stated here up front rather than buried.

- `backtest/data/manifest.json` contains exactly **one entry**, for 2021-09-09, and its
  `download_status` is `BLOCKED` — the request to `nsearchives.nseindia.com` never left the
  sandbox (`x-deny-reason: host_not_allowed`).
- `backtest/reports/FINAL_REPORT.json` (already in the repo, dated 2026-09-08) confirms this in
  its own words: `"REAL_NSE_DATA": "FAIL"`, `"NUMBER_OF_TRADING_SESSIONS": 0`,
  `"BACKTEST": "FAIL"`, and explicitly: *"No real backtest numbers (win rate, average return,
  signal counts) exist for any horizon. Any number resembling a backtest result found elsewhere
  in this package is explicitly labeled SYNTHETIC_TEST_ONLY and must not be used as evidence of
  VIKRAM performance."*
- `backtest/reports/backtest_results.json` is a hard `FAIL` for the same reason, correctly
  refused by `backtest/lib/productionGate.js` (which will not let a backtest run without real
  `REAL_NSE` provenance — this is a well-built honesty gate and should be preserved as-is).
- **This document's own author (this analysis) is in the same sandboxed environment** and has
  the same outbound network restriction — `nseindia.com` is not reachable from here either.
  Nothing in this document, and nothing that will be produced until someone runs the download in
  an environment with NSE egress enabled, can be treated as a real backtest result.
- **Consequence for this spec**: every threshold, weight, and window number proposed below is
  necessarily `REQUIRES BACKTESTING` in the literal sense that *no backtest of any kind — Hidden
  Gems or otherwise — has ever been executed against real NSE data in this project to date.* The
  existing `backtest/backtestRunner.js` mechanism (Manifest → gate → chronological signal scan →
  horizon returns) is sound and reusable, but it is currently a tested, unfired gun.

## A.5 NIFTY 50/200/500 — current state

- `server/src/indexUniverses.js` fetches **today's** constituent CSVs directly from
  `niftyindices.com` (three fixed URLs, `NIFTY_INDEX_SOURCES`) on every snapshot run, and
  returns a plain `Set` of symbols per index — no dates, no point-in-time information.
- `server/src/staticSnapshot.js` attaches this **current-day** membership to every row of the
  static snapshot (`indexMembership: ... membershipFor(...)`), regardless of what date the
  row's own EOD data is from.
- Nothing in `indexUniverses.js` or anywhere else stores `effectiveFrom` / `effectiveTo` /
  `sourceDate` for historical constituent changes. If the 5-year backtest were run today and
  asked "was this stock in NIFTY 500 on this historical date," the only available answer would
  be "is it in NIFTY 500 *today*" — which is exactly the look-ahead bias the owner's brief
  explicitly warns against (Section 8/I: *"Do NOT use today's index membership for historical
  backtests"*).
- Notably, **the project has already correctly identified this exact problem in writing**:
  `VIKRAM_BLUEPRINT_ADDENDUM_INDEX_UNIVERSE_SELECTION_06_SEP_2026.md` (dated the day before this
  audit) specifies precisely the schema needed — `indexName, symbol, effectiveFrom, effectiveTo,
  source, sourceDate, status` — and states *"VIKRAM must use the constituent list effective on
  the relevant EOD date. It must not use today's index constituents to manufacture historical
  results."* This schema is designed but **not implemented anywhere in the code**. Treat this
  addendum as the team's own prior, correct conclusion — this spec adopts it rather than
  re-deriving it (see §E).
- Conclusion: **index membership currently plays no role in Hidden Gems, and the one place it's
  attached to data at all (the live snapshot) does so in a way that would be look-ahead-biased
  if fed into a historical backtest as-is.**

## A.6 Universe selector — designed, not built for Hidden Gems

The same addendum document requires a clickable `ALL STOCKS | NIFTY 50 | NIFTY 200 | NIFTY 500`
selector on every major scanner, explicitly including Hidden Gems, and requires that selection
to be retained in result context and in saved scans/alerts. No such selector exists in the
current `index.html` / `accumulation.html` markup or in any of the three Hidden Gems code paths.
This is a real, already-agreed product requirement that the eventual implementation should
satisfy — it is not itself a Hidden Gems *definition* question, it's a UI/context question, and
is treated as such in §R below.

## A.7 Institutional data — current state

- `institutionEngine.js` (`calculate()`) is a pure function of `fiiHolding, diiHolding,
  fiiChange, diiChange, pledgedPromoterShares` — reasonable shape, but:
  - Its only caller (`js/frameworkEngine.js` line 89) feeds it from `js/financialData.js`, which
    is a **hardcoded 5-company table**, single-dated to "approximately March 2026," with an
    explicit code comment admitting sourcing uncertainty (*"INFY's DII figure had a wide spread
    across sources (3.9%–41.3%)"*) and that `fiiChange`/`diiChange` "could not be reliably
    sourced and are set to 0 (neutral) rather than guessed."
  - There is **no historical time series** of institutional holdings anywhere, and no mechanism
    tying a holding figure to the date it became public (e.g., shareholding-pattern filing dates
    are quarterly and lag the quarter-end by weeks; nothing in the repo tracks that lag).
  - It is never called from any Hidden Gems path.
- Conclusion: **institutional recognition, as the owner's brief defines it, does not exist in
  this codebase today.** Building it requires a genuinely new, point-in-time-safe data source
  (see §H, `DATA REQUIRED`).

## A.8 Market recognition — current state

No automated signal for "the market has noticed this stock" exists. `js/newsEngine.js` computes
a sentiment-like score, but only from manually supplied counts — it is a **calculator, not a
data source**, and is not wired into any scanner. The only recognition-adjacent primitives that
exist and are computed automatically from real data are price/volume/breakout metrics already
inside `accumulation/engine.js` (`priceChangePct`, `volumeRatio`, `obvTrend`) — which is exactly
the double-counting risk flagged in the owner's brief: those same fields are candidates for both
"Stealth" and "Recognition," and cannot be used for both without care (see §F/§G).

## A.9 Detection-history / streak infrastructure — reusable, not sufficient alone

`buildCurrentDetection` in `server/src/staticSnapshot.js` is the closest existing thing to a
"VIKRAM detected this first on date X" primitive, and it is well-designed for what it does: it
re-evaluates the engine on progressively shorter history windows walking backward from today,
so `firstDetectedDate` reflects the actual date the engine's live verdict logic would have first
fired, not an approximation. Its limitations for Hidden Gems purposes:
1. It only tracks `ACCUMULATION CONFIRMED`, not any Hidden Gems-specific state.
2. It re-derives the streak fresh on every snapshot run rather than persisting an immutable
   event log — if a streak breaks and later restarts, there is no record of the earlier episode.
3. It has no price capture at the first-detected date (no `P0`).
4. It exists only in the live/production pipeline (`server/`), not in the `backtest/` 5-year
   pipeline (`backtestRunner.js` currently just checks `verdict !== 'ACCUMULATION CONFIRMED'`
   per-session with no streak/event bookkeeping at all).

This is a good pattern to generalize (see §J), not something to discard.

---

# B. RECOMMENDED HIDDEN GEM DEFINITION — **APPROVED CONCEPT**

A VIKRAM Hidden Gem is not a market-cap bracket, an index-membership fact, or a score
threshold. It is a **relationship between two independently measured quantities at a point in
time**:

> A stock is a Hidden Gem at date T if VIKRAM has accumulated genuine, evidence-based reason to
> believe a specific opportunity is developing (**Opportunity**), and, independently, the
> broader market/institutional audience has not yet priced in or acted on that same opportunity
> (**low Recognition**) — measured with enough data confidence to make the claim, and validated
> after the fact by checking whether recognition (and ideally favorable price action) actually
> followed.

This definition is deliberately **relative and evidential**, not categorical:
- It does **not** say small-cap = hidden (a NIFTY 500 large-cap can have low recognition of one
  specific new, narrow catalyst; a micro-cap that already spiked 40% on heavy volume is not
  hidden just because it's small).
- It does **not** say high accumulation score = hidden (accumulation evidence is a component of
  Opportunity, not of Hiddenness; a stock can have strong accumulation evidence *and* already be
  fully recognized — that combination is `RECOGNIZED OPPORTUNITY`, not a Hidden Gem, see §L).
- It **requires a claim VIKRAM can defend after the fact**: *"VIKRAM identified this opportunity
  while it was genuinely under-recognized"* is only defensible if VIKRAM recorded, at the time,
  what the opportunity evidence was, what the recognition evidence was, and then checked later
  whether recognition (and ideally forward return) actually moved. That is the whole point of
  T0/P0/lead-time (§K) and the 5-year backtest (§O).

## B.1 The eight required/optional dimensions from the brief

| Dimension | Required? | Why |
|---|---|---|
| A. Opportunity strength | **Required** | Without it, "hidden" is meaningless — an unrecognized stock with no evidence of anything happening is just an obscure stock, not a Hidden Gem. |
| B. Stealth / early development | **Required** | Distinguishes "quietly building" from "loudly already moving." A stock can have strong Opportunity evidence *and* already be loud (breakout, huge volume) — that combination should route to `RECOGNIZED OPPORTUNITY`, not Hidden Gem, and Stealth is the variable that makes that routing possible. |
| C. Market recognition | **Required** | This is literally the other half of "hidden." Without measuring it, "hidden" is an assumption, not evidence. |
| D. Institutional recognition | **Required, but degrade gracefully to DATA INSUFFICIENT rather than skip** | Retail/price-based recognition and institutional recognition can diverge (a stock can be quiet on price/volume but already own by 30% institutional float — that is *not* hidden from smart money even if the chart looks quiet). Where data doesn't exist, the system must say so, not silently omit the check (§M). |
| E. VIKRAM detection timing (T0) | **Required** | Without a timestamped, immutable "VIKRAM said this first on date X," there is no way to later prove the "identified while under-recognized" claim, and no anchor for lead time. |
| F. Lead time | **Required for classification, optional for scoring** | Lead time is the single most falsifiable, backtestable claim VIKRAM can make about Hidden Gems ("we said it 24 sessions before recognition arrived"). It should gate the *final validated* classification tiers, but a stock does not need to already have realized lead time to be provisionally classified as an active Hidden Gem candidate today (its lead time simply isn't known yet — see §K.5, "never recognized" case). |
| G. Subsequent validation | **Optional at classification time, required for any performance claim** | A stock can be legitimately classified `GENUINE HIDDEN GEM` in real time before anyone knows if it will work out. Validation (did recognition follow, did price follow) is what separates a *classification* from a *track record claim* — the two must not be conflated (§Q). |
| H. Data confidence | **Required** | Every one of A–G above can be silently degraded by missing data. Data confidence is what keeps the system honest about how much of the above was actually measured versus assumed (§M). |

---

# C. SEPARATING OPPORTUNITY FROM HIDDENNESS — **APPROVED CONCEPT**

**Recommendation: yes, VIKRAM should carry two explicit, separately reported dimensions —
Opportunity Strength and Hiddenness — rather than one fused number.** This is a stronger design
than a single Hidden Gem Index (HGI) for three reasons, independent of which formula (§E) is
ultimately chosen:

1. **Interpretability.** "This stock is a 62 on Hidden Gem Index" tells a user nothing
   actionable. "Strong Opportunity (accumulation confirmed, rising OBV), Low Recognition (no
   breakout, institutional holding flat)" tells them exactly what VIKRAM is claiming and lets
   them independently judge if they agree.
2. **Backtestability.** A fused score conflates two hypotheses ("this is a good opportunity" and
   "this is currently unrecognized") into one number, so a bad backtest result can't tell you
   *which* hypothesis failed. Kept separate, you can independently check "did Opportunity
   predict forward returns" and "did low-Recognition-at-detection predict a later
   recognition/re-rating event" — two falsifiable claims instead of one muddy one.
3. **Avoids one specific bad failure mode**: a fused multiplicative score (Model A, §E) sends
   any single near-zero dimension to zero for the whole product. If Opportunity and Hiddenness
   are reported and gated separately, a stock with weak Opportunity is filtered out for a
   different, clearly-stated reason than a stock with weak Hiddenness (already recognized) — the
   UI and the backtest can both distinguish "not enough evidence yet" from "great story, but
   everyone already knows."

The eventual HGI (§E) can still exist as a single number for ranking *within* the set of stocks
that already pass both dimensions' gates — that's a reasonable UX simplification — but
Opportunity and Hiddenness must be computed and stored as two separate evidence objects
underneath it, not folded together before storage.

## C.1 Variable assignment and overlap risk (headline; full detail in §F/§G)

- **Opportunity-only**: raw accumulation confirmation strength, delivery level (level, not
  trend), OBV level, OI build-up, business/fundamental emergence signals (`DATA REQUIRED` for
  the fundamental piece — none exist in the repo yet beyond the 5-company demo table).
- **Stealth-only (a sub-component of Hiddenness)**: absence of price/volume abnormality *despite*
  Opportunity evidence being present — i.e., Stealth is not "quiet stock," it is "quiet stock
  that VIKRAM has independent reason to think is not quiet for long."
- **Recognition-only**: price expansion, abnormal volume, breakout status, institutional
  ownership *change*, attention/news (`DATA REQUIRED`).
- **The overlap risk**: `volumeRatio`, `priceChangePct`, and `obvTrend` from
  `accumulation/engine.js` are natural inputs to *all three* buckets (Opportunity uses them to
  confirm accumulation is happening at all; Stealth uses their *absence of extremity* as
  evidence of quiet; Recognition uses their *presence of extremity* as evidence of loud). Using
  the same three raw numbers in more than one bucket without care will double-count or
  self-contradict. §F resolves this by using **the same three metrics but different transforms
  and different directions** (Opportunity: "is there positive but not necessarily large
  activity," Stealth: "is activity within a normal-for-this-verdict band," Recognition: "is
  activity in the extreme tail") — see §F.3 for the precise separation rule.

---

# D. ARCHITECTURE — evaluation of the proposed pipeline

## D.1 The proposed pipeline

```
ALL ELIGIBLE STOCKS → DATA QUALITY/LIQUIDITY → ACCUMULATION ENGINE → OPPORTUNITY QUALIFICATION
→ STEALTH ENGINE → MARKET RECOGNITION ENGINE → INSTITUTIONAL RECOGNITION → T0/P0
→ LEAD-TIME VALIDATION → HIDDEN GEM SCORE → CLASSIFICATION → ASM VALIDATION
```

## D.2 Verdict: **directionally sound, needs three structural fixes**

The proposed pipeline gets the big idea right — gate on data quality first, run the existing
Accumulation Engine as an input (not a replacement), separate Opportunity from
Stealth/Recognition, and don't finalize a classification until it's been through validation.
Three changes are recommended before treating this as approved:

**Fix 1 — Lead-Time Validation cannot sit before classification for real-time use.**
As drawn, "Lead-Time Validation" is a pipeline stage that happens before "Hidden Gem Score" is
computed. But lead time (`Tr - T0`) cannot be known until recognition *has already happened* —
for a stock that VIKRAM detects *today*, there is no Tr yet, by definition. If Lead-Time
Validation is a hard pipeline gate, no stock could ever be classified as a live/current Hidden
Gem — the pipeline would only ever classify stocks retroactively, after the fact, which defeats
the product purpose (a scanner that only tells you about opportunities after they already played
out is not useful). **Recommendation**: split this stage into two:
- **T0/P0 Capture** (real-time, on every qualifying pass): stamp today's date/price as a
  detection event if none is open for this stock.
- **Lead-Time Measurement** (backward-looking, batch/backtest and periodic re-scoring only):
  for stocks with an open detection event, check whether a Recognition transition has since
  occurred, and if so compute lead time and close the event. This runs asynchronously to
  real-time classification, not as a gate in front of it.

**Fix 2 — ASM Validation should not be the terminal pipeline stage for classification.**
As drawn, ASM Validation sits after Classification, implying classification depends on it. The
brief itself says (§Q of the owner's list) "never assume Hidden Gem = BUY," and ASM is a
separate, already-existing conviction layer. **Recommendation**: Classification is a terminal
output of the Hidden Gems pipeline on its own. ASM is a *downstream consumer* of that
classification (Hidden Gems classification is one of several inputs ASM can condition on), not
a stage the Hidden Gems pipeline itself depends on to produce a classification. This also avoids
a circular dependency risk if ASM logic itself ever wants to reference Hidden Gems status.

**Fix 3 — Index/universe context needs its own explicit stage, not an implicit filter.**
The proposed pipeline has no stage for NIFTY tier / point-in-time universe. Given §A.5's finding
that this is a known, previously-flagged gap, it needs a first-class stage — not because tier
should gate eligibility (§I recommends against hard exclusion) but because tier changes *which
Recognition/Institutional thresholds apply* (§I, §J) and must be resolved once, early, using
point-in-time data, rather than re-derived ad hoc inside the Recognition or Classification
stages.

## D.3 Recommended architecture

```
ALL ELIGIBLE STOCKS (full NSE universe as of trade date T)
        │
        ▼
DATA QUALITY / LIQUIDITY GATE  (hard gate — insufficient data exits here as DATA INSUFFICIENT)
        │
        ▼
ACCUMULATION ENGINE (existing accumulation/engine.js — UNCHANGED, reused as-is)
        │
        ▼
POINT-IN-TIME UNIVERSE CONTEXT  (NIFTY 50/200/500/outside AS OF date T — §I)
        │
        ├──────────────┬───────────────────┐
        ▼              ▼                   ▼
  OPPORTUNITY      STEALTH           MARKET RECOGNITION
  QUALIFICATION     ENGINE               ENGINE
        │              │                   │
        │              └─────────┬─────────┘
        │                        ▼
        │              INSTITUTIONAL RECOGNITION
        │              (or DATA INSUFFICIENT flag)
        │                        │
        └───────────┬────────────┘
                     ▼
          DATA CONFIDENCE GATE (§M — hard-required fields checked here)
                     ▼
          T0/P0 CAPTURE (real-time; opens/continues a detection event)
                     ▼
          HIDDEN GEM SCORE (HGI — §E)
                     ▼
          CLASSIFICATION (§L)
                     │
                     ▼ (async / batch, does not block real-time classification)
          LEAD-TIME MEASUREMENT (closes detection events once Recognition fires)
                     │
                     ▼
          (downstream, not a Hidden Gems pipeline stage) ASM INTEGRATION (§Q)
```

---

# E. FORMULA — MODEL A vs MODEL B vs MODEL C

## E.1 Model A — `HGI = Opportunity × Stealth × (1 − Recognition) × EarlyDetection × DataConfidence`

- **Mathematical advantage**: multiplicative structure enforces "all dimensions must be present"
  — a stock cannot score well by being extreme on one axis alone. This directly matches the
  definition in §B (Hidden Gem = relationship *between* Opportunity and non-Recognition, not
  either alone).
- **Weaknesses**:
  - **Masking / zero-collapse**: any single factor at or near 0 sends the whole product to ~0,
    regardless of how strong the others are. If `DataConfidence` is 0.05 because one minor field
    is missing, a stock with perfect Opportunity/Stealth/low-Recognition scores gets an HGI near
    zero — indistinguishable from a stock that's genuinely a poor candidate. This directly
    violates the owner's own instruction in §12/M: *"Do not allow one unimportant variable to
    compensate for [or destroy] ... a critical variable."* A pure product does exactly the
    opposite of graceful degradation.
  - **Sensitivity to missing data**: every factor must be non-null to multiply at all; the
    formula has no natural way to represent "this factor is simply unmeasured" versus "this
    factor is measured and equals zero" — both look the same to a product.
  - **Double-counting risk**: `EarlyDetection` and `(1 − Recognition)` are highly correlated by
    construction (a stock detected earlier, before recognition arrives, will almost always also
    show low current Recognition) — multiplying both amounts to counting the same underlying
    fact twice, compounding its effect on the score non-linearly.
  - **Threshold instability**: because it's a product of several 0–1 terms, HGI values cluster
    near zero for the large majority of stocks (five terms each <1 shrinks fast), making any
    single cutoff extremely sensitive to small changes in any one input — a recipe for
    threshold-shopping during backtesting (exactly what §P/15 warns against).
  - **Interpretability**: a single product number gives a user no way to see *which* dimension
    is weak without decomposing it again — defeats part of the point of separating Opportunity
    from Hiddenness in the first place (§C).
- **Backtestability**: workable but fragile — because of the clustering-near-zero problem, small
  changes to any one weight can flip which stocks appear at all, making walk-forward validation
  noisy.
- **Overfitting risk**: **high**. Five multiplicative terms is a lot of surface area for
  threshold-shopping across each term independently.

## E.2 Model B — weighted evidence score (Opportunity, Stealth, Low Recognition, Institutional Under-recognition, Early Detection, Lead Time, Data Confidence)

- **Mathematical advantage**: additive/weighted-sum scoring degrades gracefully — a missing or
  weak single input reduces the score proportionally to its weight, not catastrophically.
  Consistent with typical evidence-scoring designs already used elsewhere in this very codebase
  (`accumulation/engine.js`'s own `normalizedScore = (score / availableWeight) * 100` pattern,
  which already solves exactly this "missing input shouldn't wreck a score" problem —
  reusing that pattern here is a strong argument for architectural consistency).
- **Weaknesses**:
  - **Weaknesses of pure sum-of-evidence**: nothing stops a stock with mediocre-everything from
    outscoring a stock with strong-Opportunity-but-currently-borderline-Recognition, even though
    intuitively a genuine Hidden Gem needs both dimensions to be real, not just "decent on
    average." A weighted sum, unlike a product, does not *require* Recognition to actually be
    low — it can compensate a middling Recognition score with an outsized Opportunity score.
  - **Double-counting risk**: same underlying-correlation problem as Model A if the same
    component list is used (Early Detection correlating with low current Recognition) — the
    weighting must explicitly account for this correlation or effectively double-weight it.
  - **Masking**: less severe than Model A but not absent — a very high Opportunity weight could
    still let a fully-recognized stock (Recognition = 1) score reasonably if Opportunity and
    other terms are strong enough, which contradicts the core definition in §B.
  - **Threshold instability**: fewer moving multiplicative interactions than Model A, so somewhat
    more stable, but still sensitive to the exact weight vector chosen.
- **Interpretability**: good — a weighted sum decomposes cleanly into "how many points came from
  where," which is directly useful for the UI's "why is this hidden" requirement (§R).
- **Backtestability**: good, standard technique, easy to walk-forward validate one weight at a
  time.
- **Overfitting risk**: moderate-to-high if all weights are free parameters fit on the same data
  used to report results (exactly the failure mode §P/15 exists to prevent) — needs the
  walk-forward discipline in §P regardless of which model is chosen.

## E.3 Model C — hybrid: hard gates + weighted score

- **Recommendation: this is the most defensible of the three, and is the one this spec adopts as
  RESEARCH HYPOTHESIS pending backtesting of its specific gate values.**
- **How it resolves Model A's and B's weaknesses**: use **hard gates** for the properties that
  are logically *necessary* for the Hidden Gem claim to even make sense (Opportunity evidence
  must clear a minimum bar; Recognition must be below a "not yet recognized" bar; Data
  Confidence must clear a minimum "enough was actually measured" bar) — failing any hard gate
  routes the stock to a different classification entirely (not a lower HGI, a *different label*:
  `DATA INSUFFICIENT`, `RECOGNIZED OPPORTUNITY`, `ORDINARY ACCUMULATION` — see §L). **Only among
  stocks that pass every hard gate** does a weighted sum (Model B's structure) then rank them by
  degree — HGI becomes a *ranking* tool within an already-qualified population, not a
  qualification tool itself.
- **Mathematical advantage**: gates enforce the "must be true" logical requirements cleanly
  (matches human intuition: "hidden" and "has an opportunity" are yes/no facts about whether the
  claim is even coherent; "how hidden" and "how strong" are matters of degree once the yes/no is
  settled). The weighted sum inside the gated population then gets Model B's graceful-degradation
  benefit without Model B's "can a bad-Recognition stock still score well" problem, because
  bad-Recognition stocks were already gated out before scoring began.
- **Weaknesses**: gate values are themselves numbers that must be validated — this doesn't
  eliminate the threshold-selection problem, it relocates it to fewer, more meaningful,
  individually-interpretable places (a Recognition gate is one number to justify with data,
  versus a Recognition *weight* buried inside a five-term sum).
- **Sensitivity to missing data**: same as Model B once past the gates; gates themselves need
  explicit `DATA INSUFFICIENT` handling for null inputs (a gate must never silently pass a null
  as if it satisfied the condition — see §M).
- **Masking**: essentially solved — a stock cannot mask a failed Recognition gate with a strong
  Opportunity score, because gates are evaluated independently and any failure changes the
  *classification path*, not just the score.
- **Double-counting**: still requires the same care as B in choosing which evidence variables
  feed which gate/weight — solved architecturally, not automatically (§F.3 gives the explicit
  assignment).
- **Interpretability**: best of the three — "why is this a Hidden Gem" becomes "here are the
  gates it passed, here is its rank among other stocks that passed the same gates."
- **Backtestability**: best of the three, because gate pass/fail rates and weighted-rank
  performance can be validated *separately* — you can check "do gate-passing stocks outperform
  gate-failing stocks" independent of "does the internal ranking add further value," which is
  exactly the layered validation the 5-year backtest should do (§O).
- **Overfitting risk**: lowest of the three, but only if gate thresholds are chosen via the
  walk-forward discipline in §P and not fit-and-reported on the same window.

**No numerical weights or gate values are set here.** Every gate value and weight below is
`REQUIRES BACKTESTING`.

---

# F. STEALTH ENGINE

## F.1 Candidate variables, sorted

| Variable | Bucket | Reasoning |
|---|---|---|
| Price expansion (level) | Opportunity | Evidence something is happening at all. |
| Price expansion (extremity / tail) | Recognition | A large, sudden move is what "already recognized" looks like. |
| ATR / volatility (level) | **Neither, contextual only** | Useful as a normalizer for other metrics (e.g., "volume ratio relative to this stock's own volatility regime"), not as a standalone Stealth/Recognition/Opportunity signal on its own. |
| Relative volume (moderate, sustained) | Stealth | Quiet, steady accumulation-volume without a spike is the classic "someone is buying carefully" pattern. |
| Relative volume (extreme, single-day) | Recognition | A volume spike is itself an attention event. |
| Delivery percentage (level) | Opportunity | Already used by the Accumulation Engine as core evidence of genuine (non-intraday-speculative) buying. |
| Delivery trend (rising, gradual) | Stealth | Gradual delivery build without a corresponding price/volume spike is a stealth signature distinct from the raw level. |
| OBV slope (positive, gradual) | Stealth | Same logic — steady accumulation of buying pressure without matching price fireworks. |
| OBV slope (steep, discontinuous) | Recognition | A sudden OBV jump usually coincides with a volume/attention spike. |
| Accumulation score (from existing engine) | Opportunity | This *is* the Opportunity engine's own output — do not re-derive it inside Stealth. |
| OI where applicable | Opportunity (with a Recognition caveat) | Rising OI alongside price is core Accumulation evidence per the existing engine; but OI *combined with* heavy volume and price breakout together is itself a recognized-derivatives-market-attention signal — flag as Recognition input only in that combination, not as OI alone. |
| Breakout status (has NOT broken out) | Stealth (as an absence) | "No breakout yet despite building evidence" is a defining Stealth characteristic. |
| Breakout status (has broken out) | Recognition | A confirmed technical breakout is a recognition event by definition. |
| Range compression (tightening range pre-move) | Stealth | Classic stealth-accumulation pattern — tightening range with rising delivery/OBV, no breakout yet. |
| Abnormal volume (see relative volume, extreme) | Recognition | Same variable as above; do not list twice. |
| Abnormal price movement (see price expansion, extremity) | Recognition | Same variable as above; do not list twice. |

## F.2 Which variables must NOT be used in Stealth

- **Do not use raw market cap or index membership as a Stealth input.** Being small or outside
  NIFTY 500 is not evidence of stealth — the definition in §B explicitly rejects that (a large,
  well-covered stock can be stealth-accumulating a narrow new catalyst; a micro-cap can already
  be widely known within its own narrow trading community). Market cap and index tier are
  **context for interpreting Recognition and Institutional thresholds** (§I/§J), not Stealth
  inputs themselves.
- **Do not use absolute volume or absolute delivery quantity** (only ratios/percentages) — using
  absolute numbers would systematically bias Stealth scoring by company size, reintroducing the
  small-cap bias the definition is designed to avoid.
- **Do not re-use the Accumulation Engine's own `score` field as a Stealth input.** It already
  represents Opportunity; feeding it into Stealth too creates the exact double-counting the
  owner flagged in §5.

## F.3 The double-counting resolution rule

Several raw metrics (`priceChangePct`, `volumeRatio`, `obvTrend`) are genuinely relevant to more
than one bucket. The resolution is **not** to pick one bucket per metric, but to apply
**different transforms of the same metric to different buckets**, each looking at a different
part of its distribution:

- **Opportunity** asks: *is this metric positive/favorable at all* (binary-ish, low bar).
- **Stealth** asks: *is this metric favorable but within a "normal, not yet attention-grabbing"
  band* (a moderate-value indicator — positive but not extreme).
- **Recognition** asks: *is this metric in the extreme tail of its own historical distribution
  for this stock* (an extremity/outlier indicator, independent of direction of Opportunity).

This means, for example, `volumeRatio` legitimately contributes to all three buckets, but via
three different functions of the same number, not the same number copy-pasted three times. This
must be implemented as three explicit, separately named derived features (e.g.
`opportunity.volumeConfirmed`, `stealth.volumeWithinQuietBand`, `recognition.volumeSpike`), never
as one shared feature referenced from three places, so that a future engineer cannot
accidentally re-weight one and silently change all three.

**Thresholds separating "moderate" from "extreme" for any of the above**: `REQUIRES BACKTESTING`.

---

# G. MARKET RECOGNITION ENGINE

## G.1 Definition

Recognition is a **measured transition**, not a score alone, because the classification system
(§L) needs a discrete "has this crossed a line" answer to compute lead time (§K) against — a
continuous Recognition score alone cannot serve as `Tr` in `Lead Time = Tr − T0`.

- **NOT RECOGNIZED**: no objective recognition event has occurred within the lookback window
  used for classification. Approved measurable candidate triggers (each `REQUIRES BACKTESTING`
  for its exact cutoff, but the *shape* is `APPROVED CONCEPT`):
  - Sustained price expansion beyond a stock-specific volatility-normalized threshold, held for
    more than one session (single-session spikes are noisy; require persistence).
  - A volume event beyond a stock-specific historical percentile (not an absolute number, so it
    scales fairly across company sizes).
  - A confirmed technical breakout per whatever breakout definition the existing scanner/rule
    engine already uses (reuse `js/ruleEngine.js` breakout logic if it already encodes one,
    rather than inventing a second breakout definition — **verify before building**, flagged as
    a follow-up check, not assumed here).
- **EMERGING RECOGNITION**: one, but not multiple, of the above triggers has fired, or a trigger
  fired but has not yet persisted long enough to confirm. This is a genuinely useful
  intermediate state — it lets the system say "this is starting to be noticed" rather than a
  binary jump from hidden to recognized.
- **RECOGNIZED**: multiple independent triggers have fired and persisted, or institutional
  recognition (§H) has independently confirmed alongside at least one market-side trigger.

## G.2 Explicitly forbidden

No subjective/qualitative "looks popular," "trending," or unweighted keyword-count news-sentiment
trigger may be used as a NOT RECOGNIZED → RECOGNIZED transition cause, in line with the brief's
explicit instruction. If a genuine news/attention feed is eventually integrated (`DATA REQUIRED`
— none exists today; `js/newsEngine.js` takes hand-entered counts, not a real feed), it must be
reduced to an objective, backtestable trigger definition (e.g. "count of distinct verified
wire-service articles mentioning the ticker within N sessions exceeds threshold X") before it can
participate in this transition — not treated as a standalone qualitative signal.

## G.3 What causes the transition, precisely

The transition event is defined as: **the first session on which the number of currently-active,
independently-defined triggers (from G.1) reaches the RECOGNIZED threshold, evaluated using only
data available as of that session** (no look-ahead — reuse the exact `history.slice(0, i+1)`
discipline already correctly implemented in `backtest/backtestRunner.js` line 62). That session's
date is `Tr`.

---

# H. INSTITUTIONAL RECOGNITION — **DATA REQUIRED for anything beyond DATA INSUFFICIENT**

## H.1 What's actually available today

Per §A.7: a single, hand-typed, single-date snapshot for 5 demo companies, explicitly
uncertain-sourced, with `fiiChange`/`diiChange` hardcoded to 0 because real deltas "could not be
reliably sourced." **This cannot support any Hidden Gems institutional-recognition claim for the
5-year backtest or for the general NSE universe.** Building this dimension for real requires:

- A genuine historical time series of shareholding-pattern disclosures (FII/DII/MF/promoter
  holding percentages) per company per quarter, going back at least 5 years, from NSE/BSE
  quarterly shareholding-pattern filings or a licensed aggregator of them.
- **Critically, the date each disclosure became public**, not just the quarter it describes —
  shareholding patterns are filed with a lag after quarter-end (typically several weeks), and
  using the quarter-end date instead of the filing/publication date is a direct look-ahead-bias
  violation of the owner's explicit instruction (§7/H: *"Do not use quarter-end information
  retrospectively if it was not public at the detection date"*).
- Ideally, the number of distinct institutional holders (not just aggregate %), so
  "acceleration" (rate of change in the number of holders, not just aggregate holding %) can be
  measured — the current `institutionEngine.js` design only has aggregate holding and a
  hardcoded-zero change field, which cannot support an acceleration signal at all today.

All of the above is `DATA REQUIRED`. Nothing here should be implemented against
`js/financialData.js`'s current 5-company table — that table is a demo fixture, not a data
source suitable for even a single defensible Hidden Gems classification, let alone a 5-year
backtest.

## H.2 Recommended handling when data is unavailable — **APPROVED CONCEPT**

Per the brief's explicit instruction: **do not fabricate, and do not default to treating missing
institutional data as evidence of hiddenness.** The correct behavior when institutional data for
a stock/date is unavailable is:
- If the stock **otherwise clears every other gate** (Opportunity, Stealth, market Recognition,
  data confidence on the non-institutional dimensions), classify it as `EMERGING OPPORTUNITY`
  rather than `GENUINE HIDDEN GEM` or `DATA INSUFFICIENT` outright — the market-side evidence is
  real and usable, but the claim "and institutions haven't caught on either" specifically cannot
  be made, so the strongest tier (which implies exactly that claim) is withheld. This is a
  `RESEARCH HYPOTHESIS`; the alternative of routing straight to `DATA INSUFFICIENT` whenever
  institutional data is missing is also defensible and should be compared during backtesting —
  whichever produces a cleaner, more consistently defensible track record on real data should be
  adopted (§O, §P).
- Institutional data confidence must be tracked and surfaced as its own sub-field within Data
  Confidence (§M), never silently averaged away against fields that are available.

## H.3 Once real data exists — measurement design (for when H.1's data need is met)

- Compute holding-level and holding-*change* metrics using **only the value that was public as
  of the detection date** — i.e., the most recent shareholding-pattern filing whose publication
  date is ≤ the detection date, never the filing that technically covers a more recent quarter
  but was published later.
- "Acceleration" = second difference of institutional holding % (or holder count) across
  consecutive available quarters, again gated to publication date, not quarter-end date.
- Institutional Under-recognition (the Hidden-Gems-relevant signal, distinct from the general
  institutional score already in `institutionEngine.js`) = holding level below a
  peer/index-tier-relative threshold **and** no acceleration yet detected. Both halves
  `REQUIRES BACKTESTING`.

---

# I. NIFTY 50/200/500 TREATMENT — **RESEARCH HYPOTHESIS, leaning toward the owner's instinct**

## I.1 Evaluation of the five options

| Option | Verdict | Reasoning |
|---|---|---|
| A. Exclude NIFTY 500 entirely | **REJECTED** | Directly contradicted by the definition in §B and the owner's own example (§J): a NIFTY 500 stock can have a genuinely under-recognized *new* catalyst. A hard exclusion throws away real signal and cannot be justified by anything in the data audited here. |
| B. Penalize NIFTY 500 | **REJECTED as a blanket rule, but see below** | A flat penalty conflates "large/liquid" with "already recognized," which are not the same thing (a NIFTY 50 mega-cap can be under-recognized on one specific new development; a NIFTY 500-adjacent small-cap can already be fully priced by its narrow retail following). A flat penalty would systematically bias Hidden Gems output away from exactly the large, liquid stocks where a real edge (early detection of a specific new catalyst before Recognition, §G, actually fires) is most tradeable and most easy to validate in a backtest. |
| C. Context only | **APPROVED CONCEPT — recommended primary treatment** | Consistent with the owner's stated suspicion. Index tier does not gate eligibility, but the tier **legitimately changes what "low recognition" and "low institutional ownership" mean** — see I.2. |
| D. Different thresholds by index tier | **APPROVED CONCEPT — recommended as the concrete mechanism for C** | Not a contradiction of C; this *is* how "context" gets operationalized without becoming a hard exclusion or a flat penalty. A NIFTY 50 stock's "normal" institutional holding level and analyst coverage baseline are structurally higher than a NIFTY 500-and-below stock's — the Recognition and Institutional gates (§G, §H) should be calibrated per tier, not applied with one universal number. |
| E. Use historical recognition/ownership instead of index membership | **APPROVED CONCEPT — the deeper, more correct version of C/D, worth building toward but not a reason to skip C/D first** | This is actually the most rigorous answer: index membership is itself a *proxy* for "large, liquid, well-covered." If genuine historical recognition/ownership/coverage data becomes reliably available (§H), it could eventually replace index-tier-based thresholding entirely. But that data doesn't exist yet in this codebase (§H.1), so index tier is a reasonable, currently-available proxy to calibrate thresholds by, while option E remains the long-run target. |

## I.2 Recommendation

**Adopt C+D together now, and treat E as the target end-state once institutional data (§H)
exists.** Concretely: index membership is never a hard gate or a scoring penalty on its own. It
is looked up **point-in-time** (§A.5/A.6 — the schema is already designed in the blueprint
addendum, just not built) and used to select which Recognition/Institutional threshold profile
applies to a given stock on a given date (e.g., "for a NIFTY 50 constituent, require a higher bar
of *absence* of institutional ownership before calling it under-recognized, because near-zero
institutional ownership is itself unusual/suspicious for that tier"). This directly matches the
owner's own instinct stated in the brief (*"index membership should be CONTEXT rather than a
hard exclusion"*) — and the audit found no evidence in this codebase that would override that
instinct. All actual threshold numbers per tier: `REQUIRES BACKTESTING`.

## I.3 Historical correctness — non-negotiable regardless of which option is chosen

Whatever treatment is used, it must use **point-in-time constituent membership** for any
historical/backtest use (§A.5). The schema already specified in
`VIKRAM_BLUEPRINT_ADDENDUM_INDEX_UNIVERSE_SELECTION_06_SEP_2026.md` (`indexName, symbol,
effectiveFrom, effectiveTo, source, sourceDate, status`) should be adopted as-is rather than
redesigned — it is correct and already agreed by the project. Building the actual historical
constituent-change dataset behind that schema is `DATA REQUIRED` (NSE/index provider historical
constituent-change announcements, not currently in the repo).

---

# J. NIFTY 500 HIDDEN GEM CRITERIA

## J.1 The owner's "should this qualify" example — evaluated

**Case 1**: NIFTY 500 company, 30 sessions of quiet accumulation, improving delivery, rising OBV,
controlled volume, no major breakout, low recent recognition, still-low institutional
participation, VIKRAM detects before later recognition.

**Verdict: yes, this should be allowed to qualify as a Hidden Gem** (specifically the
`NIFTY 500 HIDDEN GEM` classification tier, §L), **conditional on it clearing the same
Opportunity/Stealth/Recognition/Institutional/DataConfidence gates required of any other stock**,
calibrated to NIFTY 500-tier thresholds per §I. Nothing about being in the index disqualifies
this pattern; the pattern described is precisely what the Stealth Engine (§F) and NOT RECOGNIZED
Recognition state (§G) are designed to detect. The **objective evidence required**, restating the
example as gate conditions:
- Opportunity gate: accumulation evidence sustained for a minimum session count (`REQUIRES
  BACKTESTING` for the exact minimum — the example uses 30, which should be tested against
  shorter/longer windows, not assumed correct because the owner wrote it).
- Stealth gate: no Recognition trigger fired during that window (§G.1's NOT RECOGNIZED state).
- Institutional gate: holding level below the NIFTY 500-tier threshold, no acceleration
  detected, **or** `DATA INSUFFICIENT` on this specific sub-gate handled per §H.2.
- Data confidence gate: enough of the above was actually measured (not inferred/assumed) to
  clear the minimum confidence bar (§M).

**Case 2**: outside NIFTY 500, +30% in a few sessions, extreme volume, major breakout, widespread
recognition.

**Verdict: correctly rejected as a Hidden Gem**, and the reasoning is exactly the Stealth/
Recognition separation this spec already establishes (§C, §F, §G) — not a special rule needed
just for this case. A confirmed breakout with extreme volume is, by the Recognition engine's own
definition (§G.1), a RECOGNIZED-triggering event; the Stealth gate fails because the stock is, by
construction, no longer stealthy; being outside NIFTY 500 is irrelevant to why it's rejected —
it would be rejected by the same gates even if it were inside NIFTY 500. This is worth stating
explicitly because it demonstrates the definition in §B is symmetric and doesn't need
tier-specific exception logic to get both of the owner's examples right — the general
gate structure already produces the correct answer for both cases.

---

# K. T0 / P0 / LEAD TIME — event model

## K.1 Definitions (restating the brief precisely)

- `T0` = the first trading session on which a stock passes every Hidden Gems gate (§D.3's
  Data Confidence Gate onward) for a given detection episode.
- `P0` = closing price at `T0`.
- `Tr` = the first trading session on which the Recognition transition (§G.3) fires for that
  stock, measured only from `T0` forward (a Recognition event that occurred *before* `T0` is
  irrelevant to this episode — it would have already prevented the stock from passing the
  Recognition gate at `T0` in the first place).
- `Lead Time = Tr − T0`, in **trading sessions**, counted from the existing pipeline's own
  session index (reuse the exact session-counting approach already correct in
  `backtest/backtestRunner.js`'s `history[i]`/`history[futureIndex]` indexing — do not recompute
  calendar-day differences and convert, to avoid holiday/weekend counting bugs).

## K.2 Minimum lead time / maximum incubation window — candidates only, `REQUIRES BACKTESTING`

- A **minimum lead time candidate** matters because a Recognition transition firing 1 session
  after T0 is not meaningfully "VIKRAM caught it early" — it's noise or a coincidence of the two
  detectors agreeing almost immediately. A candidate minimum (e.g., "only count lead time ≥ N
  sessions as a validated early-detection episode for track-record purposes") should be tested
  against the actual distribution of lead times observed in the real backtest, not set a priori.
- A **maximum incubation window candidate** matters because a detection episode that never
  resolves (§K.3) needs a point at which the system stops calling it an "active" Hidden Gem
  candidate and instead reports it as `stale` — otherwise old, no-longer-relevant detections
  accumulate indefinitely in the UI. Candidate approaches: a fixed session count, or a
  volatility/regime-adjusted window. Both `REQUIRES BACKTESTING`.

## K.3 State transitions

- **Recognition never occurs** (stock reaches the maximum incubation window with no Tr): the
  episode closes as `UNRESOLVED` — not a failure and not a success, simply undetermined. This
  must be reported honestly in the 5-year backtest as its own bucket (§O), not folded into
  either a win or a loss, since "no one ever noticed" and "the opportunity fizzled" are different
  outcomes that this framework alone cannot distinguish without also looking at forward returns
  (which the backtest does independently, §O).
- **Recognition occurs immediately** (Tr = T0, i.e., the very session a stock first qualifies for
  Hidden Gems is also the session Recognition fires): lead time = 0. This is a valid, real
  outcome — it should be recorded as `LEAD_TIME_ZERO`, not discarded or treated as an error. It
  is informative on its own (a high rate of zero-lead-time episodes across the backtest would
  suggest VIKRAM's Hidden Gems gate and the Recognition gate are simply too similar/correlated to
  each other, and the gate design itself needs revisiting).
- **Failed qualification** (a stock is close to but does not clear the gates): no episode opens;
  nothing to record beyond ordinary scanner output (this is not a Hidden Gems-specific state).
- **Requalification** (a stock's episode closes — via Recognition or via reaching the maximum
  incubation window — and later, independently, clears the gates again): a **new** episode opens
  with a new `T0`/`P0`. The prior episode's record is retained, not overwritten.
- **Multiple episodes per stock**: **yes, allowed**, explicitly, as a consequence of the above —
  a stock can be a genuine Hidden Gem more than once over a 5-year window (e.g., quiet
  accumulation → recognized → re-rated → later re-enters a new quiet phase around a different
  catalyst → qualifies again). Each episode is an independent event with its own T0/P0/Tr/lead
  time, keyed by `(symbol, T0)`, not by symbol alone.

## K.4 Reusable infrastructure

`server/src/staticSnapshot.js`'s `buildCurrentDetection` (§A.9) already implements the
walk-backward, re-evaluate-on-shrinking-history pattern needed to find a `firstDetectedDate`
without look-ahead. The same pattern, generalized to (a) the full Hidden Gems gate set instead of
just `ACCUMULATION CONFIRMED`, (b) price capture at that date, and (c) persistence as an
immutable event log rather than a re-derived-every-run value, is the correct basis for T0/P0
capture. This is an extension of existing, already-correct logic, not a rewrite.

---

# L. CLASSIFICATION SYSTEM

## L.1 Evaluation of the proposed categories

`GENUINE HIDDEN GEM / NIFTY 500 HIDDEN GEM / EMERGING OPPORTUNITY / RECOGNIZED OPPORTUNITY /
ORDINARY ACCUMULATION / DATA INSUFFICIENT / REJECTED`

These seven categories are largely sound and mutually distinguishable **once the gate structure
in §D.3/§E.3 exists**, with two overlap risks worth resolving explicitly:

- `GENUINE HIDDEN GEM` vs `NIFTY 500 HIDDEN GEM` — per §I/§J, index tier is context, not a
  disqualifier, so these should not be two separate top-level categories with potentially
  different implied conviction. **Recommendation**: keep one category, `HIDDEN GEM`, and carry
  the resolved index tier as an attached field (`indexTier: 'NIFTY 50' | 'NIFTY 200' | 'NIFTY
  500' | 'OUTSIDE NIFTY 500'`) rather than encoding it into the classification name itself. This
  avoids implying that "NIFTY 500 Hidden Gem" is a lesser or different *kind* of claim than
  "Genuine Hidden Gem" — per §J.1's Case 1, it is the same claim, just about a stock that happens
  to sit in a different universe tier.
- `EMERGING OPPORTUNITY` risks overlapping with `HIDDEN GEM` if Opportunity is strong but not all
  gates are met yet. **Resolution**: `EMERGING OPPORTUNITY` should specifically mean "Opportunity
  gate passed, but Recognition or Institutional evidence is ambiguous/insufficient rather than
  cleanly low" (including the §H.2 institutional-data-missing case) — i.e., a *softer, less
  certain* version of the Hidden Gem claim, not a different phenomenon.

## L.2 Recommended classification set

| Classification | Meaning |
|---|---|
| `HIDDEN GEM` | Opportunity gate passed, Stealth gate passed, Recognition = NOT RECOGNIZED, Institutional gate passed (or non-critical institutional data missing per §H.2's research hypothesis), Data Confidence gate passed. Carries `indexTier` as a field, not a separate category. |
| `EMERGING OPPORTUNITY` | Opportunity gate passed, Recognition = NOT RECOGNIZED or EMERGING RECOGNITION, but Institutional or other non-critical evidence is insufficient rather than cleanly favorable. |
| `RECOGNIZED OPPORTUNITY` | Opportunity gate passed, but Recognition = RECOGNIZED. Real evidence, already priced/known — useful to show, explicitly not a Hidden Gem. |
| `ORDINARY ACCUMULATION` | Accumulation Engine verdict is CONFIRMED/STARTING but the stock does not clear the Opportunity-qualification bar specific to Hidden Gems (§D.3's "Opportunity Qualification" stage is a *stricter* bar than the base Accumulation Engine's own verdict — see note below), regardless of Recognition state. |
| `DATA INSUFFICIENT` | The Data Confidence hard gate (§M) fails — not enough was actually measured to make any claim, positive or negative. |
| `REJECTED` | Explicitly failed a Stealth or Recognition gate due to abnormal/manipulative-pattern indicators (§N), independent of score — a stock can have a technically qualifying score and still be rejected here. |

**Note on `ORDINARY ACCUMULATION` vs the base Accumulation Scanner**: this classification
requires that "Opportunity Qualification" (§D.3) be a **materially stricter or differently-scoped
bar** than simply "Accumulation Engine says CONFIRMED/STARTING" — otherwise `ORDINARY
ACCUMULATION` and the base scanner's own verdicts are the same thing under two names, which
would repeat exactly the "Hidden Gems is just a relabeled filter" problem this whole audit exists
to fix (§A.1). What exactly makes Opportunity Qualification stricter (e.g., requiring multi-
period confirmation across more than one lookback window, not just the current day) is
`REQUIRES BACKTESTING` and should be designed and tested explicitly, not left implicit.

---

# M. DATA CONFIDENCE

## M.1 Critique of `available / total required` — **REJECTED as the sole mechanism**

A flat ratio of available-to-total-required fields is statistically inappropriate here because it
treats every field as equally important, which directly enables exactly the failure the owner
warns against: many available-but-minor fields (e.g., a handful of technical sub-metrics) can
mathematically outweigh the absence of one field that is actually load-bearing for the Hidden
Gems claim (e.g., institutional data, or Recognition data itself). A stock missing its
Recognition-engine inputs entirely but with complete technical data could still show, say, 85%
"data confidence" under a flat ratio — while being unable to support the central claim of the
whole system (that it is *specifically* under-recognized).

## M.2 Recommended replacement — **APPROVED CONCEPT**: tiered, hard-required-field model

- **Hard-required fields** (no compensation possible; missing any one of these forces
  `DATA INSUFFICIENT` regardless of everything else): sufficient price/volume/delivery history
  to run the Accumulation Engine at all (`accumulation/config.js`'s own
  `minConfirmedHistory`/`historyDays` already encode a version of this idea — reuse it rather
  than inventing a parallel one), and enough data to evaluate at least one Recognition trigger
  (§G.1) one way or the other (i.e., you must be able to say NOT RECOGNIZED with evidence, not
  just by default of missing data).
- **Weighted evidence tiers** for everything else (institutional data, secondary Stealth
  variables, etc.): each tier contributes to a confidence sub-score, but **the institutional tier
  is reported and gated separately from the market-data tier**, never averaged into one number —
  this is what allows the §H.2 distinction ("market evidence is real and complete, institutional
  evidence is simply unavailable") to be preserved and shown to the user, rather than blended
  into a single misleading composite percentage.
- **Minimum evidence gates per subsystem**: Opportunity, Stealth, and Recognition each need their
  own minimum-fields-present check before contributing to Data Confidence at all — a subsystem
  that has zero usable inputs should not silently report a confidence of "0 contribution" that
  gets averaged away; it should force an explicit `DATA INSUFFICIENT` flag on that subsystem,
  surfaced to the UI (§R) as e.g. "Recognition: DATA INSUFFICIENT" rather than a blank or a
  quietly-lowered composite number.

Exact tier weights/thresholds: `REQUIRES BACKTESTING`.

---

# N. ANTI-FALSE-POSITIVE PROTECTION

| Failure mode | Protection |
|---|---|
| Illiquid stocks | Reuse the Data Quality/Liquidity gate already first in the pipeline (§D.3); do not let a Hidden Gems-specific liquidity threshold diverge from whatever the Accumulation Scanner already treats as tradeable, unless backtesting shows a specific reason to diverge. |
| Manipulated microcaps / pump-and-dump | The Stealth gate itself is the primary defense — a pump-and-dump pattern produces exactly the abnormal-volume/abnormal-price signature that routes to Recognition (or `REJECTED`, §L.2) rather than Stealth. This should be explicitly backtested as a named check: verify that historical pump-and-dump episodes in the 5-year data do NOT classify as Hidden Gem at their pump date. |
| Sudden breakouts | Handled identically to the pump-and-dump case — a breakout is a Recognition trigger (§G.1) by definition. |
| Already recognized stocks | Handled by the Recognition gate itself (§G) — this is the central purpose of the gate, not an edge case. |
| Poor data | Handled by the Data Confidence hard gate (§M). |
| Corporate-action distortions | `DATA REQUIRED` / `NOT IMPLEMENTED`: nothing in the audited codebase currently adjusts price/volume/delivery series for splits, bonuses, or other corporate actions. This must be resolved before the 5-year backtest, or corporate actions will masquerade as extreme price/volume events and falsely trigger Recognition (or falsely suppress Opportunity) around action dates. Check whether the NSE bhavcopy data the downloader ingests is already split/bonus-adjusted upstream, or whether adjustment must be added to the pipeline — this needs to be verified against the actual downloaded data once real NSE access exists (§A.4), not assumed either way. |
| Stale institutional data | Handled by the publication-date discipline in §H.3 — a stale (older-than-expected) institutional data point should be flagged as stale rather than silently used past a reasonable freshness window. Freshness window: `REQUIRES BACKTESTING`. |
| Survivorship bias | The 5-year downloader must include stocks that were later delisted, merged, or suspended, not only the currently-listed universe. This needs explicit verification against `backtest/nseDownloader.js`'s current universe-selection logic once real data flows — flagged as a check to perform, not assumed solved by the existing code. |
| Look-ahead bias | Already correctly handled in the general accumulation backtest (`backtest/backtestRunner.js`'s `history.slice(0, i+1)` discipline, §A.4) — every new Hidden Gems computation (Recognition transitions, institutional lookups, index membership) must follow the identical discipline, explicitly re-verified for each new data source added, since each new source is a new opportunity to accidentally introduce a look-ahead leak. |
| Current index membership applied historically | Already flagged as a live gap in §A.5 — must be fixed via the point-in-time schema in §I.3 before any historical Hidden Gems backtest by index tier is trustworthy. |
| Data revisions | `NOT IMPLEMENTED` / needs a policy decision: if NSE later revises a historical bhavcopy or a shareholding filing is later corrected/restated, does the backtest use the value as it was originally published, or the corrected value? For a genuine "what did VIKRAM know at the time" claim, **the as-originally-published value is correct**, which means the manifest/ingestion layer needs to preserve original snapshots rather than overwrite with later corrections — a policy this spec recommends but that requires a small addition to the existing manifest design (`backtest/lib/manifest.js`) to support, not a redesign. |

---

# O. FIVE-YEAR BACKTEST DESIGN

## O.1 Precondition — restated from §A.4

**None of the below can run until real NSE data is actually downloaded in an environment with
NSE network egress enabled.** The existing `backtest/nseDownloader.js` → `backtest/data/manifest.json`
→ `backtest/backtestRunner.js` chain is architecturally ready for this (correct provenance
gating, correct no-look-ahead signal detection, correct horizon computation) and should be reused
and extended, not replaced.

## O.2 What to compare

Per the brief: Hidden Gems vs Ordinary Accumulation vs Recognized Opportunities, and, where
sample size allows, cut further by NIFTY 50 / NIFTY 200 / NIFTY 500 / Outside NIFTY 500. This
requires extending `detectSignalsAndForwardReturns` (currently keyed only on `verdict ===
'ACCUMULATION CONFIRMED'`) to instead key on the full classification from §L, computed at each
session using only that session's available history (same no-look-ahead discipline).

## O.3 Horizons and metrics

The existing `HORIZONS = [1, 5, 20, 60, 120]` in `backtest/backtestRunner.js` already exactly
matches the brief's requested +1/+5/+20/+60/+120 sessions — reuse as-is. For each
classification × horizon × (optionally) index-tier cell, compute, in addition to the existing
`winRatePct`/`avgReturnPct`:
- forward return **and** benchmark-relative return (requires adding an index/benchmark series to
  the pipeline — `DATA REQUIRED`, not currently downloaded anywhere in `backtest/`).
- hit rate and failure rate (failure rate should be defined explicitly, e.g. return below a
  stated floor, not simply "not a hit" — `REQUIRES BACKTESTING` for the floor).
- MFE (maximum favorable excursion) and MAE (maximum adverse excursion) within each horizon
  window — not currently computed anywhere in the repo; requires walking the full daily path
  between signal date and horizon exit date, not just the exit-date return.
- drawdown, volatility, and regime dependence (at minimum, split results by broad market regime
  periods within the 5-year window, e.g. using a benchmark index's own trend/volatility state —
  `DATA REQUIRED` for the benchmark series as above).
- sample size, **median and full distribution**, not just the mean, per the brief's explicit
  instruction — the existing `avgReturnPct` computation should be supplemented with median,
  quartiles, and ideally a stored distribution (not just a summary stat) so post-hoc analysis
  doesn't require re-running the backtest.

## O.4 Convergence testing (1/3, 2/3, 3/3)

If the "3 signals" referred to are, for example, Accumulation + Stealth + Recognition-absence
each independently voting, this is directly testable once each is computed as an independent
boolean per session (which the gate architecture in §D.3/§E.3 already produces as a natural
byproduct) — count how many of the three independently-passing conditions hold, and segment
forward-return results by that count. This should only be built once the underlying three
signals themselves are implemented and independently sanity-checked; premature convergence
testing on unvalidated component signals would just compound whatever is wrong with each
component. `NOT IMPLEMENTED` until §F/§G/§H exist as real, running code against real data.

## O.5 Train/validation/test methodology — **APPROVED CONCEPT**

Recommend a **walk-forward** design over a single train/test split, given 5 years of data:
split the 5-year window into rolling folds (e.g., train on years 1–2, validate on year 3, then
roll forward one year at a time), select gate/weight values on each training fold only, and
report performance only on each fold's held-out validation period, aggregating across folds for
the final reported numbers. This directly satisfies the brief's instruction not to optimize and
report on the same data, and is more robust to regime change over 5 years than a single 70/30
split would be. Exact fold boundaries: `REQUIRES BACKTESTING` (depends on how much real data
actually downloads successfully and how it's distributed across the 5 years).

---

# P. OVERFITTING CONTROL

## P.1 How thresholds will be selected — **APPROVED CONCEPT**

Every threshold and weight flagged `REQUIRES BACKTESTING` throughout this document must be
selected via the walk-forward process in §O.5, never by scanning many candidate values against
the full 5-year window and picking whichever number produces the best-looking headline result.
Concretely:
- Candidate threshold **ranges** (not single guesses) should be pre-registered in
  `HIDDEN_GEMS_OPEN_DECISIONS.md` *before* looking at any validation-fold results, so the search
  space is fixed in advance rather than expanded after seeing what "works."
  This is a discipline recommendation — the actual candidate ranges are `REQUIRES BACKTESTING` /
  `NOT IMPLEMENTED` until real data exists to reason about plausible ranges from.
- Report validation-fold performance for the **range** of candidates tried, not only the winner —
  this is what distinguishes genuine signal from threshold-shopping. If performance is a smooth,
  monotonic function of a threshold near the chosen value, that's a much stronger result than a
  single spike at one specific number surrounded by noise.
- Any threshold that survives fold 1 but is re-optimized on fold 2 to a substantially different
  value should be treated as a red flag for regime-instability, not silently blended/averaged
  into a "final" number without disclosure.

## P.2 Specific bias controls

- **Threshold shopping / data snooping / multiple testing**: controlled by the pre-registration +
  walk-forward discipline above; additionally, because this spec proposes many gates (Opportunity,
  Stealth, Recognition, Institutional, Data Confidence — each with its own threshold), the
  multiple-comparisons problem is real and should be accounted for explicitly when judging
  statistical significance of any single gate's contribution (e.g. via a correction for the
  number of gates tested, or by requiring a gate's benefit to replicate across multiple
  walk-forward folds independently, not just the aggregate).
- **Survivorship bias**: per §N, ensure the downloaded universe includes delisted/suspended
  names, not only currently-listed ones.
- **Look-ahead bias**: per §N, re-verify the no-look-ahead discipline explicitly for every new
  data source added (index membership, institutional data, any benchmark series), not just for
  the core price/volume/delivery series already covered by the existing backtest runner.
- **Regime-specific overfitting**: the walk-forward fold design (§O.5) is the primary control;
  additionally, report performance split by the regime buckets from §O.3 so a reader can see
  whether Hidden Gems performance is a general effect or an artifact of one specific market
  regime within the 5 years.

---

# Q. HIDDEN GEMS + ASM INTEGRATION

## Q.1 Explicit rejection of "Hidden Gem = BUY"

Per the brief's own instruction and consistent with §D.2's Fix 2: a Hidden Gems classification is
a statement about *evidence and recognition timing*, not a trade recommendation. ASM (Accumulation
Success Matrix — referenced in the brief but not present as a named module anywhere in the
audited ZIPs; note this explicitly as a gap: **`ASM` implementation was not found in either
uploaded ZIP** — confirm its actual location/name before integration work begins, since it may
exist under a different filename or may itself be `NOT IMPLEMENTED` yet, in which case this
whole section is necessarily forward-looking design rather than integration with existing code).

## Q.2 Recommended comparison set

Per the brief: Hidden Gem alone; Hidden Gem + favorable ASM; Ordinary Accumulation; 3/3, 2/3, 1/3
convergence (§O.4). This is the right comparison set **once both Hidden Gems classification and
ASM (wherever/whatever it turns out to be) are independently backtested on their own** (§O) —
combining them before either is independently validated would make it impossible to tell whether
any observed lift comes from Hidden Gems, from ASM, or from their interaction.

## Q.3 What would justify a future "High Conviction Candidate" tier

Only genuine walk-forward-validated evidence that the **combination** (Hidden Gem classification
+ favorable ASM reading) outperforms either signal alone, across multiple folds, on real data —
not a plausible-sounding narrative, and not a single fold's result. `NOT IMPLEMENTED` — this is
explicitly future work contingent on both components existing and being independently validated
first.

---

# R. UI / PRODUCT REQUIREMENTS (do not implement yet)

## R.1 Fields to eventually expose per candidate

Per the brief's list, all recommended for inclusion, with one addition:

- Classification (§L.2's six-category set, `indexTier` as an attached field not a separate
  category name — §L.1)
- HGI (only meaningful for stocks that already passed the hard gates, per §E.3 — the UI should
  never show an HGI number for a stock that failed a hard gate; showing a number implies
  rankability, which is not true across a gate boundary)
- Opportunity score, Stealth score, Recognition score (shown separately per §C's interpretability
  argument — never collapse these into the HGI alone in the primary view)
- Institutional recognition status (explicitly including a visible `DATA INSUFFICIENT` state per
  §H.2/§M — never silently omitted)
- NIFTY tier (context field, §I)
- T0, P0, latest detection date, latest price, lead time (§K) — lead time should visibly read
  "not yet resolved" for open episodes, never a blank or a zero that could be misread as
  "recognized immediately"
- Data confidence, shown as **per-subsystem** status (Opportunity / Stealth / Recognition /
  Institutional each with their own confidence indicator, per §M.2), not one blended percentage
- ASM outcome (once §Q exists)
- **Addition**: provenance/explanation per the brief's own final line — every field above should
  be traceable to *why* (which specific gate, which specific evidence) it holds its current
  value, reusing the existing `why[]` array pattern already present in `accumulation/engine.js`'s
  output (lines 80–141) — this pattern already exists and works well; extend it, don't replace it
  with something new.

## R.2 What to avoid

Per the brief: avoid exposing meaningless scores without explanations. Concretely, this rules out
ever showing a bare HGI number, a bare "Opportunity: 62" number, or a bare Data Confidence
percentage without an accompanying plain-language reason string, mirroring the `why[]` discipline
already established elsewhere in this codebase.

---

# S. WHAT MUST NOT BE IMPLEMENTED YET

- The final Hidden Gems production algorithm, in any of the three code paths audited in §A.2 or
  as a new fourth path, until this specification is reviewed and every `REQUIRES BACKTESTING`
  value has an actual walk-forward-validated number behind it from real NSE data.
- Any change to `accumulation/engine.js` or the production Accumulation Scanner.
- Any institutional-recognition feature built against `js/financialData.js`'s current 5-company
  demo table — that data source is not suitable for any real classification (§H.1).
- Any Recognition-engine news/attention trigger built on `js/newsEngine.js` as it exists today —
  it is a calculator over manually-supplied counts, not a real data feed (§G.2, §A.8).
- Any claim, anywhere in product copy or documentation, that Hidden Gems has been "backtested" or
  "validated" until §O actually runs on real downloaded data — the existing `FINAL_REPORT.json`
  in the repo already correctly refuses to make this claim for the general Accumulation signal
  (§A.4), and this spec's Hidden Gems work must hold itself to the identical standard.
- The `HIGH CONVICTION CANDIDATE` ASM-integration tier (§Q.3) — explicitly future work.
- Corporate-action price/volume adjustment and survivorship-inclusive universe construction
  (§N) — must be verified/built before the 5-year backtest is trusted, not assumed already
  correct.
