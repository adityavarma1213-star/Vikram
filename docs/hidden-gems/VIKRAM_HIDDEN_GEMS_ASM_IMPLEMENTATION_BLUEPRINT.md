# VIKRAM HIDDEN GEMS + ASM — IMPLEMENTATION BLUEPRINT

Status: **RESEARCH / DESIGN — NOTHING IN THIS DOCUMENT IS IMPLEMENTED.**
This is the decision-resolution pass on top of `HIDDEN_GEMS_ALGORITHM_SPEC.md` and
`HIDDEN_GEMS_OPEN_DECISIONS.md`. Where the spec presented options, this document picks the final
recommended one and says so plainly. Where a question is genuinely still open (most notably
convergence, §E), it is flagged as `OPEN DECISION`, not silently resolved.

Ground rules restated and honored throughout: no production code touched, `accumulation/engine.js`
untouched, neither existing Hidden Gems implementation deleted, no numerical threshold chosen
arbitrarily, no institutional/recognition/index-history/backtest data fabricated. Every
unvalidated number is tagged `REQUIRES BACKTESTING`.

**One new grounding fact found while preparing this pass**: `backtest/AUDIT.md` (already in the
repo, §9, lines 292–311) independently used the term **"ASM (forward-performance calculations)"**
to describe exactly the +1D/+5D/+20D/+60D/+120D forward-return harness that already partially
exists in `backtest/backtestRunner.js`, and lists the same gaps this blueprint needs to close
(no benchmark-relative return, no MFE/MAE/drawdown, no regime split, no 1/3–2/3–3/3 grouping).
**Conclusion: ASM is not a mystery module living elsewhere — it is this project's own name for
the statistical validation layer that already exists in nascent form.** Section C below is
written as a generalization of that existing partial implementation, not a from-scratch
invention disconnected from the codebase.

---

# A. HIDDEN GEMS — FINAL RECOMMENDED ARCHITECTURE

## A.1 Pipeline (final)

```
ALL ELIGIBLE STOCKS (full NSE universe, trade date T)
        │
        ▼
DATA QUALITY / LIQUIDITY GATE ── fail ──▶ DATA INSUFFICIENT
        │ pass
        ▼
ACCUMULATION ENGINE (accumulation/engine.js — UNCHANGED, called, never modified)
        │
        ▼
OPPORTUNITY QUALIFICATION ── fail ──▶ ORDINARY ACCUMULATION or below-scanner-verdict (no Hidden Gems event)
        │ pass
        ▼
STEALTH ENGINE ── fail (already loud) ──▶ RECOGNIZED OPPORTUNITY
        │ pass (quiet)
        ▼
MARKET RECOGNITION ENGINE ── RECOGNIZED ──▶ RECOGNIZED OPPORTUNITY
        │ NOT RECOGNIZED / EMERGING
        ▼
INSTITUTIONAL RECOGNITION ── recognized ──▶ RECOGNIZED OPPORTUNITY
        │ under-recognized / DATA INSUFFICIENT-on-this-subsystem-only
        ▼
DATA CONFIDENCE GATE (per-subsystem, §M of the spec) ── fail hard-required ──▶ DATA INSUFFICIENT
        │ pass
        ▼
T0 / P0 CAPTURE (opens or continues an immutable detection event, §F)
        │
        ▼
HGI (ranking score, computed only among stocks that reached this point)
        │
        ▼
CLASSIFICATION → HIDDEN GEM  or  EMERGING OPPORTUNITY  (per §H.2 institutional-missing rule)
        │
        ▼ (async, batch/periodic — never blocks real-time classification above)
LEAD-TIME MEASUREMENT — watches open events for a Recognition transition, closes the event,
                         records lead time or UNRESOLVED (§F)
```

This is the same shape as the prior spec's §D.3, with the exits made explicit at every stage
(every "fail" arrow above lands on a real classification, not a dead end) — this is the concrete
detail needed before an engineer can build it.

## A.2 What belongs in each component — final

| Component | Inputs | What it decides | Must NOT contain |
|---|---|---|---|
| **Opportunity** | Accumulation Engine's own score/verdict/components (reused, not recomputed); a stricter multi-period confirmation check (e.g. confirmed across more than one lookback window, not just today — exact window `REQUIRES BACKTESTING`) | "Is there real, engine-confirmed evidence something is developing, robustly enough to be worth asking the hiddenness question at all?" | Anything about price/volume *extremity* — that belongs to Stealth/Recognition, not Opportunity. Anything about index tier or market cap. |
| **Stealth** | `stealth.volumeWithinQuietBand`, `stealth.deliveryTrendGradual`, `stealth.obvSlopeGradual`, `stealth.noBreakoutYet`, `stealth.rangeCompression` — each a distinct derived feature, never the raw Accumulation Engine fields reused directly (see §A.3 double-counting rule) | "Is the Opportunity evidence developing quietly — i.e., without the market having already reacted to it?" | The Opportunity score itself. Institutional data (institutional quiet is a separate, later gate). Recognition triggers (a fired trigger routes out before Stealth is even asked). |
| **Market Recognition** | `recognition.priceExpansionExtreme`, `recognition.volumeSpike`, `recognition.confirmedBreakout` — each a tail/extremity transform of the same raw metrics, evaluated as a discrete trigger count, not a continuous score alone (needed to produce a `Tr` for lead time) | Discrete state: NOT RECOGNIZED / EMERGING RECOGNITION / RECOGNIZED | Any qualitative/keyword-based "attention" measure (explicitly forbidden by the brief). Institutional data (kept as its own gate, §H of the spec, because retail/price recognition and institutional recognition can diverge). |
| **Institutional Recognition** | Point-in-time institutional holding level + change/acceleration, gated to publication date, per index tier | Discrete state: under-recognized / recognized / **DATA INSUFFICIENT (subsystem-scoped, not global)** | Anything derived from `js/financialData.js`'s current 5-company demo table — not usable for real classification (spec §H.1). Quarter-end date used as if it were the publication date. |
| **Data Confidence** | Hard-required-field checks (enough history to run the Accumulation Engine at all; enough evidence to make a Recognition call one way or the other) + per-subsystem weighted-tier confidence (Opportunity / Stealth / Recognition / Institutional reported **separately**, never blended into one composite) | Whether a classification can be made at all, and how much of it rests on complete vs. partial evidence | A single blended percentage that could let strong technical data compensate for missing institutional data (spec §M.1's rejected design) |
| **T0/P0** | Real-time: the first session a stock clears every gate above for a given detection episode | Anchors the whole episode; immutable once written (§F) | Any retroactive "smoothing" of the detection date once discovered in hindsight — T0 is whatever the engine would genuinely have said on that date, using only that date's available data, full stop |
| **HGI** | A weighted rank (Model C's post-gate scoring, spec §E.3) computed **only** among stocks that already passed every hard gate above | Relative ranking within the qualified population, for sorting/display | Any role in *qualification* — HGI never decides whether a stock is a Hidden Gem, only how it ranks once it already is one |
| **Classification** | The gate outcomes above, deterministically | The seven-category (six-category, per spec §L.2's unification) label the user sees | ASM output (ASM is downstream, never upstream of classification — spec §D.2 Fix 2) |
| **Lead-Time Measurement** | Open detection events + ongoing Recognition-engine evaluation, running forward in time from each event's T0 | Closes an event with a lead time or `UNRESOLVED`; never modifies the classification that was already shown to users in real time | Recomputation or "correction" of past classifications based on what happened later — a classification made at T0 was correct given what was knowable at T0; lead-time measurement documents *what happened next*, it does not rewrite the historical record |

## A.3 The double-counting prevention rule — stated precisely, once, so it's unambiguous

**Rule**: A raw metric from the Accumulation Engine (`priceChangePct`, `volumeRatio`, `obvTrend`,
`deliveryPct`, `deliveryTrend`, `changeOi`) may be read by more than one Hidden Gems component,
but **only through a named, single-purpose derived feature that exists in exactly one place in
the codebase and is imported by whichever component needs it** — never by inlining a threshold
comparison against the raw field independently inside two different components. Concretely:

- `stealth.volumeWithinQuietBand = volumeRatio ∈ [quietLow, quietHigh]` — one function, one
  definition, one place.
- `recognition.volumeSpike = volumeRatio > extremeHigh` — a **different** function, referencing
  the same underlying `volumeRatio` value but never sharing a threshold constant or a code path
  with `volumeWithinQuietBand`.
- If `quietHigh` and `extremeHigh` are ever the same number, or if changing one silently changes
  the other because they're defined from a shared constant, that is itself a double-counting bug
  and should fail a code-review checklist item before merge, not be discovered later in a
  backtest.

This is a process rule for whoever eventually implements this, not a runtime check — call it out
explicitly in the PR/design review for the eventual implementation.

---

# B. NIFTY 50/200/500 — FINAL RECOMMENDED TREATMENT

## B.1 Final answer

**NIFTY tier is a stored attribute used for threshold calibration — it is context, operationalized
as per-tier threshold selection, never a gate on eligibility and never a score penalty.**
This directly satisfies both of the stated constraints (no automatic exclusion, no arbitrary
penalty) while still giving the tier information somewhere useful to go. Restating the four
options from the prior spec with the final call:

| Option | Final status |
|---|---|
| Context only | **Adopted**, but "context" is made concrete as... |
| Threshold calibration by tier | **...this — the actual mechanism.** Recognition and Institutional gate thresholds (§H of the spec) are looked up per tier, not universal. |
| Separate attribute | **Adopted alongside the above** — `indexTier` is stored on every classification record (spec §L.1's unification: one `HIDDEN GEM` category, tier as an attached field, not a separate category name). |
| Historical-recognition/ownership-based (replacing index membership entirely) | **Long-run target, not this pass** — requires the institutional dataset in §G, which doesn't exist yet. Revisit once that data exists. |

No hard exclusion, no flat penalty — both explicitly ruled out per the instruction, and neither
was supported by anything found in the audit anyway (spec §I.1).

## B.2 Exactly when a NIFTY 500 stock can legitimately be a Hidden Gem

A NIFTY 500 constituent qualifies as `HIDDEN GEM` (with `indexTier: 'NIFTY 500'` attached) under
**exactly the same gate sequence as any other stock (§A.1), with NIFTY-500-tier-calibrated
thresholds substituted at the Recognition and Institutional gates**. Concretely, restating the
brief's own worked example as gate outcomes (all specific numbers `REQUIRES BACKTESTING`):

1. Opportunity gate: **pass** — Accumulation Engine confirms, sustained across the
   multi-period check.
2. Stealth gate: **pass** — volume/OBV/delivery activity within the "quiet" band for a NIFTY
   500-tier stock (a wider or narrower quiet band than a NIFTY 50 stock, since baseline activity
   levels differ structurally by tier — the *shape* of tier-calibration, not a specific number).
3. Market Recognition: **NOT RECOGNIZED** — no confirmed breakout, no extreme volume/price event.
4. Institutional Recognition: **under-recognized relative to the NIFTY 500-tier threshold** (a
   NIFTY 500 stock has a different "normal" institutional ownership baseline than a NIFTY 50
   stock, so the bar for "under-recognized" is tier-relative, not one universal percentage) — or
   `DATA INSUFFICIENT` on this subsystem only, in which case classification degrades to
   `EMERGING OPPORTUNITY` per spec §H.2, not a rejection.
5. Data Confidence: **pass** — enough was genuinely measured.

There is nothing about NIFTY 500 membership itself that blocks this outcome; the tier only
changes *which numbers* the Recognition/Institutional gates use, never whether the gate sequence
runs at all. Symmetrically (spec §J.1, Case 2), a stock **outside** NIFTY 500 with a confirmed
breakout and extreme volume is rejected by the **same gate sequence** (fails Stealth/Recognition)
— tier played no role in that rejection either. This symmetry is the strongest argument that the
architecture is correctly designed: both of the owner's worked examples fall out of one gate
sequence with no special-cased tier logic required.

---

# C. ASM — COMPLETE SPECIFICATION (generalizing the existing partial implementation)

## C.1 What ASM is, precisely, going forward

**ASM (Accumulation Success Matrix) is VIKRAM's statistical validation layer: it measures what
actually happened, in real historical price data, after any VIKRAM-defined event — it is a
research/reporting system, never a signal generator and never a BUY engine.** This matches the
brief's explicit instruction and generalizes the "ASM" name `backtest/AUDIT.md` already uses for
the existing forward-return harness in `backtest/backtestRunner.js`.

**Relationship to Hidden Gems**: Hidden Gems (§A) produces classified *events*. ASM consumes
those events (and, separately, plain Accumulation-Confirmed events, and any other VIKRAM signal
worth validating) and reports what happened afterward. ASM does not feed back into
classification (spec §D.2 Fix 2) — it is strictly downstream.

## C.2 ASM cohort definition

An **ASM cohort** is any set of events sharing the same defining condition, evaluated over the
same historical window, for which forward performance is to be measured and compared. A cohort
is defined by:
- **Cohort key**: the condition that puts an event in this cohort (e.g., `classification =
  HIDDEN GEM`, or `classification = ORDINARY ACCUMULATION`, or `convergenceCount = 3`).
- **Population**: every event of that kind across the full downloaded history, not a
  hand-picked subset.
- **Non-overlap discipline**: cohorts being compared against each other (e.g., Hidden Gem vs.
  Ordinary Accumulation) must be evaluated over the **same calendar window** so that a
  regime difference between two different time periods doesn't masquerade as a difference
  between cohorts (spec §O.5's walk-forward folds naturally enforce this if applied consistently
  across cohorts, not just within one).

## C.3 T0/event date and entry/baseline price

Reuses the event model in §F exactly — an ASM cohort is built from a set of `(symbol, T0)`
event keys, and the **entry/baseline price is `P0`** from that same event, never a separately
computed "current price" or a price from a different date than the one the event actually fired
on. This is the same discipline already correctly implemented in `backtest/backtestRunner.js`
(`entryClose: current.close`, taken from the exact signal-detection session, never substituted —
confirmed independently in `backtest/AUDIT.md` §5) — ASM must hold every new cohort type to this
identical standard, not just the original Accumulation-Confirmed cohort.

## C.4 Metrics per horizon (+1, +5, +20, +60, +120 trading sessions)

All horizons reuse the existing `HORIZONS = [1, 5, 20, 60, 120]` and the existing
`INSUFFICIENT_FUTURE_DATA` handling from `backtest/backtestRunner.js` (already correct — do not
rebuild). For each cohort × horizon:

| Metric | Definition | Status |
|---|---|---|
| Forward return | `(exitClose / entryClose - 1) * 100`, only when the exit session genuinely exists in real downloaded data | **Exists already** (`backtestRunner.js`) — reuse as-is |
| Benchmark-relative return | Forward return minus the benchmark index's own return over the identical session window | `DATA REQUIRED` — no benchmark series is downloaded anywhere (confirmed independently by `backtest/AUDIT.md` §9 and this project's own earlier spec §O.3) |
| MFE (max favorable excursion) | The best (highest) close reached at any point between T0 and the horizon's exit session, relative to `entryClose` — requires walking every intermediate session, not just the exit session | `NOT IMPLEMENTED` — confirmed by `backtest/AUDIT.md` §9 |
| MAE (max adverse excursion) | The worst (lowest) close reached at any point in the same window, relative to `entryClose` | `NOT IMPLEMENTED`, same as above |
| Maximum drawdown | Largest peak-to-trough decline within the window (distinct from MAE, which is relative to entry, not to an intermediate peak) | `NOT IMPLEMENTED` |
| Hit rate | Share of cohort events with forward return > 0 at that horizon | **Partially exists** (`winRatePct`) — generalize to run per-cohort instead of only for the one global Accumulation-Confirmed signal |
| Failure rate | Share of cohort events with forward return below an explicit floor (not simply "not a hit" — a return of exactly 0 or a small positive number should not silently count as neither a hit nor a failure without a stated rule) | `NOT IMPLEMENTED`; floor value `REQUIRES BACKTESTING` |
| Median return | Median, not just mean, across the cohort | `NOT IMPLEMENTED` — `avgReturnPct` exists, median does not |
| Distribution | Full return distribution stored (or at minimum quartiles), not summarized away before it can be re-analyzed | `NOT IMPLEMENTED` |
| Volatility | Standard deviation of forward returns within the cohort at that horizon | `NOT IMPLEMENTED` |
| Regime | Cohort performance split by a benchmark-derived market-regime label (e.g., trending-up / trending-down / choppy, defined from the benchmark series) | `DATA REQUIRED` (needs the benchmark series above) then `NOT IMPLEMENTED` on top of it |
| Sample size | Count of cohort events with `COMPUTED` (not `INSUFFICIENT_FUTURE_DATA`) status at that horizon | **Exists already** (`computedCount`) — reuse |
| Confidence / uncertainty | At minimum, a confidence interval on the hit rate and mean/median return (e.g., bootstrap or a standard-error-based interval), reported alongside every cohort statistic so a small-sample cohort is never presented with the same apparent authority as a large-sample one | `NOT IMPLEMENTED` — this is new relative to the existing partial implementation and is treated as a required, non-optional addition given how many cohorts (7 classification categories × 3 convergence levels × up to 4 index tiers) this system needs to report on, many of which will have small sample sizes |

## C.5 Controls — final

- **Survivorship**: the cohort population must be built from a survivorship-complete download
  (delisted/suspended symbols included, §G) — this is a data-layer prerequisite, not something
  ASM can fix after the fact if the underlying download is incomplete.
- **Look-ahead**: every ASM computation reuses the `history.slice(0, i+1)` / index-based forward
  lookup discipline already correct in `backtest/backtestRunner.js` — MFE/MAE/drawdown
  computations, being new, are the highest-risk place for a look-ahead bug to be introduced,
  since they require walking *forward* through history from T0, which is exactly the operation
  that must never accidentally leak information back into the entry-side classification decision.
  Explicit test: an MFE/MAE calculation must be provably unable to affect `T0`/`P0`/classification
  — enforce via code structure (MFE/MAE computed in a separate pass, reading but never writing
  back into the event record's classification fields), not just by convention.
- **Corporate actions**: unresolved — confirmed independently by `backtest/AUDIT.md` §7 as a
  real backtest blocker. ASM's forward-return, MFE, and MAE calculations will all be corrupted by
  an unadjusted split/bonus appearing as a spurious price move. This must be resolved (or NSE
  bhavcopy data confirmed to already be adjusted upstream — unverified, §G) before ASM numbers on
  real data can be trusted, not just before Hidden Gems numbers can be.

---

# D. HIDDEN GEMS + ASM — cohort evaluation, explicitly without assuming the answer

ASM evaluates each of the following as its own cohort (§C.2), with no assumption about which
will outperform:

1. `ORDINARY ACCUMULATION`
2. `HIDDEN GEM`
3. `EMERGING OPPORTUNITY`
4. `RECOGNIZED OPPORTUNITY`
5. 1/3 convergence (pending §E's resolution)
6. 2/3 convergence
7. 3/3 convergence

**Explicit non-assumption, stated for the record**: it is entirely possible, and must be treated
as a live hypothesis rather than dismissed, that `RECOGNIZED OPPORTUNITY` outperforms `HIDDEN
GEM` on forward returns (momentum/recognition can itself be a positive signal — "already moving"
stocks sometimes keep moving) — or that `HIDDEN GEM` underperforms because "not yet recognized"
sometimes means "not yet recognized because the market is correctly ignoring it." **The entire
point of building ASM is to let the 5-year data answer this, not to encode an assumed answer into
the classification names.** No implementation should hard-code a belief that `HIDDEN GEM`
implies future outperformance anywhere in code, comments, or UI copy, until ASM has actually
measured it.

---

# E. CONVERGENCE — `OPEN DECISION`, with a proposed clean definition

## E.1 The ambiguity

The brief refers to "1/3, 2/3, 3/3 convergence" without specifying which three signals converge.
Two readings are plausible from the source material:
- **Reading 1**: the three sub-gates internal to Hidden Gems classification itself — Opportunity
  passed, Stealth passed (quiet), Recognition passed (not-yet-recognized) — counted as a 0–3
  score of "how many of the three Hidden-Gems-relevant conditions independently hold."
- **Reading 2**: three separate, pre-existing VIKRAM scanner presets or signal types (e.g.,
  something like Accumulation Confirmed + a volume-breakout preset + an OI-buildup preset,
  referencing filter names already visible in `js/ruleBuilderUI.js` / the Opportunity Radar's own
  filter list from the master blueprint — "VOLUME BREAKOUT," "HIGH DELIVERY," "OI BUILD-UP") each
  voting independently, unrelated to the Hidden Gems pipeline's own internal gates.

Nothing in either uploaded ZIP defines "convergence" explicitly by that name, so this cannot be
resolved by more code-reading — it requires a product decision.

## E.2 Recommended resolution — **statistically cleanest option, proposed pending confirmation**

**Recommend Reading 1**: convergence = count of independently-passing Hidden Gems sub-gates
(Opportunity / Stealth / low-Recognition), 0–3, computed as a natural byproduct of the gate
architecture already in §A (no new signals need to be built to compute this reading — it falls
out of work already being done). This is preferred over Reading 2 for three reasons:
1. It requires no new signal definitions beyond what §A already builds — Reading 2 would require
   first agreeing on which three presets count and confirming they don't already overlap with
   each other (e.g., "volume breakout" and "OI build-up" may already be correlated with each
   other in ways that make a simple count misleading).
2. It is directly interpretable against the classification system already designed (§L of the
   spec) — "3/3 convergence" under Reading 1 is synonymous with "cleanly qualifies as
   `HIDDEN GEM`," and "1/3" naturally corresponds to `ORDINARY ACCUMULATION` or
   `RECOGNIZED OPPORTUNITY` depending on *which* gate is the passing one — giving convergence
   analysis a built-in, non-redundant relationship to the classification system, rather than a
   second, parallel taxonomy that needs to be reconciled with the first.
3. It is immediately backtestable using the exact ASM cohort mechanism in §C with no additional
   data requirements.

**This remains an `OPEN DECISION` until confirmed** — if Reading 2 (or a third reading) was
actually intended, say so before any convergence-cohort work begins, since the two readings
require building genuinely different things.

---

# F. EVENT MODEL — immutable event log

## F.1 Schema (final)

One immutable record per detection episode, keyed by `(symbol, T0)`:

| Field | Type | Immutable after write? | Notes |
|---|---|---|---|
| `symbol` | string | yes | |
| `T0` | trading-session date | yes | First session the event's gate sequence (§A.1) passed. Never revised once written, even if later analysis suggests an earlier date "should have" qualified — that would be exactly the kind of retroactive rewriting §A.2 rules out. |
| `P0` | price | yes | Close price at `T0`. |
| `classification` | enum (§L.2, six categories) | yes, **as of T0** | This is the classification *as VIKRAM actually said it at the time* — never overwritten by hindsight. |
| `indexTier` | enum | yes, **as of T0** | Point-in-time tier at T0 (§B), not today's tier. |
| `firstDetectedDate` | trading-session date | derived, yes | Distinct from `T0` only if a stricter internal streak-continuity rule (reusing `buildCurrentDetection`'s pattern) back-dates the *start* of the underlying evidence window that led to T0 qualifying — kept for continuity with existing `server/src/staticSnapshot.js` semantics, but `T0` is the field that matters for lead-time math. |
| `latestDetectedDate` | trading-session date | mutable while event is open | Updated each session the event continues to qualify, so "still active" is queryable without recomputing history. |
| `recognitionState` | enum (NOT RECOGNIZED / EMERGING / RECOGNIZED) | mutable while event is open | Updated by the async Lead-Time Measurement process (§A.1), never by the real-time classification path. |
| `Tr` | trading-session date or null | set once, then immutable | The session Recognition transitioned to RECOGNIZED, if it has. Null while open and unresolved. |
| `leadTimeSessions` | integer or null | set once, then immutable | `Tr - T0` in trading sessions, only set once `Tr` is set. |
| `eventStatus` | enum: `OPEN`, `CLOSED_RECOGNIZED`, `CLOSED_UNRESOLVED` | mutable until closed, then immutable | See §F.2 for closure rules. |
| `eventOutcome` | enum: `LEAD_TIME_POSITIVE`, `LEAD_TIME_ZERO`, `UNRESOLVED` | set at closure, then immutable | Distinguishes a genuine early-detection episode from a same-day coincidence from a never-resolved one (spec §K.3) — deliberately **not** a return-based win/loss label; that belongs to ASM (§C), not to the event model. Conflating "did recognition arrive" with "did the price go up" would be a category error — an event can have `LEAD_TIME_POSITIVE` and still be an ASM loss, or vice versa. |
| `requalificationOf` | event key or null | yes | If this event opened after a prior event on the same symbol closed, points to the prior event's `(symbol, T0)` key, preserving the full chain rather than treating requalification as if it were the stock's only-ever episode. |

## F.2 State transitions and closure rules

- **Open**: created at `T0`. `latestDetectedDate` advances each session the gate sequence
  continues to pass.
- **Closes as `CLOSED_RECOGNIZED`**: the first session `recognitionState` reaches `RECOGNIZED`.
  `Tr`, `leadTimeSessions`, and `eventOutcome` (`LEAD_TIME_POSITIVE` if `leadTimeSessions > 0`,
  else `LEAD_TIME_ZERO`) are set at this point, immutably.
- **Closes as `CLOSED_UNRESOLVED`**: the event reaches the maximum incubation window
  (`REQUIRES BACKTESTING` for the exact session count) without a Recognition transition, **or**
  the stock stops passing the qualifying gate sequence at all for a sustained period before
  Recognition ever fired (i.e., the "opportunity" evidence itself faded, not just went unnoticed
  — this is a distinct closure reason worth its own sub-flag, `REQUIRES BACKTESTING` for the
  exact fade-detection rule). `eventOutcome = UNRESOLVED`.
- **Immutability discipline**: once `eventStatus` is `CLOSED_*`, no field on the record may be
  further modified. A later data correction (e.g., a corporate-action adjustment discovered
  after the fact) does not edit the closed record — it is handled at the data-source layer
  (§C.5/§N) so that re-running history from corrected raw data would produce a **new**,
  differently-keyed event history, not a silent edit of the old one. This preserves the audit
  trail described in spec §N's "data revisions" row.

## F.3 Trading-session indexing

All date math in this model uses **trading-session index positions within each symbol's own
downloaded series** (the same indexing already correct in `backtest/backtestRunner.js`'s
`history[i]` / `history[i+h]` pattern), never calendar-day subtraction. This avoids the
holiday/weekend-counting errors that calendar-day math would introduce and keeps the event model
consistent with the ASM horizon mechanism (§C.4), which is itself defined in trading sessions.

---

# G. DATA MODEL — what's needed, precisely separated

| Dataset | Status | Detail |
|---|---|---|
| NSE CM (cash market EOD) | **AVAILABLE NOW** (mechanism), **not yet downloaded** (§0 of open decisions — blocked by sandbox egress in this environment; the downloader itself is built and correct) | `backtest/nseDownloader.js` |
| Delivery percentage | **AVAILABLE NOW** (mechanism, same file/source as CM typically) | Already consumed by `accumulation/engine.js` |
| F&O / OI | **AVAILABLE NOW** (mechanism) | Already consumed by `accumulation/engine.js`, exact-date-only discipline already correct (`scanMaterializer.js`) |
| Benchmark index series | **DATA REQUIRED** | Not downloaded anywhere in `backtest/`; needed for ASM's benchmark-relative return and regime split (§C.4) |
| Point-in-time NIFTY 50/200/500 membership | **DATA REQUIRED** | Schema already designed (`VIKRAM_BLUEPRINT_ADDENDUM_INDEX_UNIVERSE_SELECTION_06_SEP_2026.md`), zero historical data behind it; `server/src/indexUniverses.js` only has today's lists |
| Corporate actions (splits/bonuses/mergers/renames) | **DATA REQUIRED** | Confirmed independently by `backtest/AUDIT.md` §7 as unimplemented and a real backtest blocker; also unverified whether raw NSE bhavcopy is pre-adjusted — verify before assuming either way |
| Delisted/suspended securities | **DATA REQUIRED (verification)** | Not confirmed either way whether `nseDownloader.js`'s universe includes them — must be checked against the real download once it runs, not assumed |
| Institutional holdings (FII/DII/MF/promoter/pledge), historical | **DATA REQUIRED** | Only a 5-company single-date demo table exists (`js/financialData.js`) — not usable |
| Institutional publication dates (as distinct from quarter-end dates) | **DATA REQUIRED** | Does not exist anywhere; critical for avoiding look-ahead bias per spec §H.3 |
| Recognition/attention (news) data | **DATA REQUIRED, if pursued at all — see below** | `js/newsEngine.js` is a calculator over manually-entered counts, not a feed |

## G.1 Is a news/attention feed *genuinely* required?

**No — not for a first defensible version.** The Market Recognition Engine (§A.2) can run
entirely on price/volume/breakout-derived triggers, which are already available in the CM/
delivery/F&O data that exists today. A dedicated news/attention feed would add a second,
independent Recognition signal, which is valuable but not load-bearing for the initial system —
and per §I below, it is explicitly deferred rather than treated as a blocker. This directly
answers one of the brief's own conditional asks ("recognition/attention data if genuinely
required") — the honest answer is that it is a nice-to-have enhancement, not a prerequisite.

---

# H. FINAL DECISION REGISTER

## APPROVED CONCEPTS
- Two-dimension separation (Opportunity vs. Hiddenness) rather than one fused score, with HGI as
  a post-gate ranking tool only (§A, spec §C, §E.3).
- Hybrid gate-then-rank architecture (Model C) over pure multiplicative or pure weighted-sum.
- NIFTY tier as a stored attribute driving per-tier threshold calibration — never a hard
  exclusion, never a flat penalty (§B).
- ASM as a strictly downstream, non-BUY, statistical validation layer, generalized from the
  existing partial `backtestRunner.js` implementation rather than built as a new module (§C).
- Immutable, append-only event model with explicit `OPEN`/`CLOSED_RECOGNIZED`/
  `CLOSED_UNRESOLVED` states and a separate, non-return-based `eventOutcome` distinct from any
  ASM performance judgment (§F).
- Trading-session indexing throughout (event model and ASM horizons alike), never calendar-day
  math (§F.3).
- Institutional-data-missing degrades classification to `EMERGING OPPORTUNITY` rather than a
  hard block or a silent pass — pending its own empirical comparison in backtesting (§B, §H.2 of
  spec, carried here as approved *shape*, not yet as a validated choice between the two options
  the spec offered).
- A real news/attention feed is a deferred enhancement, not a prerequisite (§G.1).

## RESEARCH HYPOTHESES
- That `HIDDEN GEM` cohorts will show a different (not necessarily better) forward-return profile
  than `RECOGNIZED OPPORTUNITY` or `ORDINARY ACCUMULATION` cohorts — explicitly untested, must not
  be assumed (§D).
- That Reading 1 of convergence (internal 0–3 gate count) is the statistically cleaner and
  intended definition — plausible, argued, but not confirmed by the source material (§E).
- That missing institutional data is better handled by degrading to `EMERGING OPPORTUNITY` than
  by routing straight to `DATA INSUFFICIENT` — plausible but explicitly meant to be A/B-tested
  once real data exists, not decided by argument alone.

## REQUIRES BACKTESTING (numbers only — list consolidated from the spec's Open Decisions §3,
restated here as still fully open)
- Every Opportunity/Stealth/Recognition/Institutional gate threshold and every tier-calibration
  delta between NIFTY 50/200/500/outside.
- Maximum incubation window and minimum lead time for a "validated" episode.
- Failure-rate return floor, per-horizon.
- Walk-forward fold boundaries.
- Data Confidence hard-required-field list and tier weights.

## DATA REQUIRED (consolidated from §G)
- Benchmark index series.
- Point-in-time NIFTY 50/200/500 constituent history.
- Corporate-action adjustment data (or verification that source data is pre-adjusted).
- Verified survivorship-complete universe (delisted/suspended names included).
- Historical institutional holdings with publication dates (not quarter-end dates).
- (Deferred, not blocking) real news/attention feed.

## OPEN DECISIONS
- **Convergence definition** (§E) — Reading 1 proposed, needs explicit confirmation.
- **Institutional-missing routing** (`EMERGING OPPORTUNITY` vs. `DATA INSUFFICIENT`) — proposed,
  flagged for empirical A/B rather than a final call today.
- Whether `NIFTY 500 HIDDEN GEM` needs to remain a distinct **user-facing label** even though it
  is architecturally just `HIDDEN GEM` + an `indexTier` attribute (a copywriting/UX question, not
  an architecture question — does not block engineering work either way).

## REJECTED
- Automatic NIFTY 500 exclusion (§B).
- Arbitrary/flat NIFTY 500 penalty (§B).
- `available / total required fields` as the sole Data Confidence formula (carried over from the
  spec, still rejected).
- Pure multiplicative HGI as the primary/only scoring formula (carried over, still ranked below
  the hybrid).
- Treating Hidden Gem classification as an implicit BUY signal, or assuming it will outperform
  before ASM says so (§D).
- Building a news/attention ingestion pipeline as a prerequisite for shipping any version of
  Hidden Gems (§G.1) — explicitly not required for a first defensible system.

---

# I. IMPLEMENTATION ORDER — shortest safe route to a defensible production system

The guiding constraint: **ship the simplest version that can survive a genuine 5-year test, not
the most complete version of the design above.** Institutional data and a news feed are
real enhancements but are not required for the core claim ("VIKRAM detected this while the
market's own price/volume behavior hadn't yet reacted") to be true and testable.

## Phase 0 — Prerequisite, blocking, no design work needed
Run `backtest/nseDownloader.js` in an environment with NSE network egress enabled, so real 5-year
CM/delivery/F&O data actually exists on disk. Nothing past this point can be validated without it.
(This is infrastructure/ops, not a design decision — flagged here because every later phase
depends on it.)

## Phase 1 — Build the event model and a market-data-only Hidden Gems v1 (no new datasets needed)
1. Generalize `buildCurrentDetection`'s pattern into the immutable event log (§F), backed by a
   real persistence layer instead of re-derived-every-run values.
2. Implement Opportunity Qualification and the Stealth Engine (§A.2) using only CM/delivery/OBV/
   OI data that already exists — no new data source required.
3. Implement Market Recognition using only price/volume/breakout triggers (§A.2, §G.1) — defer
   institutional recognition entirely at this phase; every event's institutional field is simply
   `DATA INSUFFICIENT` for now, which is an honest, already-designed state (§B, §H), not a
   placeholder hack.
4. Implement the Data Confidence gate (market-data subsystems only at this phase).
5. Implement classification (§L of the spec) producing `HIDDEN GEM` / `EMERGING OPPORTUNITY` /
   `RECOGNIZED OPPORTUNITY` / `ORDINARY ACCUMULATION` / `DATA INSUFFICIENT` — note that with
   institutional data absent, essentially every otherwise-qualifying stock will land in
   `EMERGING OPPORTUNITY` rather than the full `HIDDEN GEM` tier until Phase 4, which is the
   correct, honest behavior, not a bug to work around.
6. **Do not** delete either existing Hidden Gems implementation yet — leave `discoveryRepair.js`,
   `app.js`'s `renderDerived`, and `ui.js`'s `renderHiddenGems` running as-is until the new
   pipeline has real backtested numbers to justify a cutover (§I closing question 7 below).

## Phase 2 — Generalize ASM and run it on Phase 1's output, once Phase 0's data exists
1. Extend `backtest/backtestRunner.js`'s cohort mechanism to key on the new event log /
   classification (§C.2) instead of only `verdict === 'ACCUMULATION CONFIRMED'`.
2. Add MFE, MAE, drawdown, median, distribution, and confidence-interval reporting (§C.4) — these
   are pure computation on data that will already exist after Phase 0, no new dataset needed.
3. Walk-forward calibrate every `REQUIRES BACKTESTING` gate threshold from Phase 1 (§O.5/§P of
   the spec) using this ASM output.
4. Produce the first real Hidden Gems vs. Ordinary Accumulation vs. Recognized Opportunity
   comparison (§D) — market-data-only, institutional dimension still absent.

## Phase 3 — Point-in-time index membership
1. Source and integrate historical NIFTY 50/200/500 constituent-change data against the schema
   already designed in the blueprint addendum.
2. Add `indexTier` (point-in-time) to every event record retroactively for historical events and
   in real time going forward.
3. Re-run Phase 2's ASM comparisons split by tier, and calibrate tier-specific thresholds
   (§B) — this is the point at which tier-based calibration numbers become backtestable rather
   than theoretical.

## Phase 4 — Institutional data
1. Only after a genuine historical, publication-date-aware institutional dataset is sourced
   (§G) — build the Institutional Recognition gate for real.
2. Re-run ASM to A/B the `EMERGING OPPORTUNITY` vs. `DATA INSUFFICIENT` open decision (§H) with
   real cohorts on both sides of the comparison.
3. This is the point at which the full `HIDDEN GEM` classification (not just
   `EMERGING OPPORTUNITY`) becomes reachable for stocks that clear every gate including the
   institutional one.

## Phase 5 — Convergence, and any further ASM cross-tabs
Once Phase 2–4 are stable, add the 1/3–2/3–3/3 convergence cohorts (§E, pending the open
decision) and any Hidden-Gem-plus-favorable-institutional-reading cross-tabs — this is
analysis on top of already-built infrastructure, not new architecture.

## Phase 6 — Optional, deferred, only if Phase 2–5 results justify it
A real news/attention feed (§G.1), only if ASM shows the price/volume-only Recognition proxy is
missing real cases a news signal would have caught — evaluate this need with data, don't build it
speculatively.

---

## Closing answers

**1. What we can build NOW without waiting for the 5-year backtest?**
The event model (§F), the market-data-only Opportunity/Stealth/Recognition gates (§A.2, using
only data already flowing through `accumulation/engine.js` today), and the classification logic
that degrades gracefully to `EMERGING OPPORTUNITY` in the absence of institutional data (Phase 1
in full). None of this requires the 5-year download to exist as *code* — it does require real
historical data to *validate* any threshold, but the architecture, event model, and gate logic
can be built and unit-tested against synthetic fixtures today, exactly as `backtest/`'s existing
test suite already does for the current signal (clearly labeled `SYNTHETIC_TEST_ONLY`, never
reported as a real result).

**2. What MUST wait for real historical data?**
Every numeric threshold (every `REQUIRES BACKTESTING` item in §H), the entire generalized ASM
output (§C, Phase 2), and any public claim that Hidden Gems has been validated at all.

**3. What MUST wait for institutional data?**
The Institutional Recognition gate itself (Phase 4), the full `HIDDEN GEM` classification tier
becoming reachable in practice (until then, qualifying stocks land in `EMERGING OPPORTUNITY`),
and the A/B resolution of the `EMERGING OPPORTUNITY` vs. `DATA INSUFFICIENT` open decision.

**4. What MUST wait for point-in-time index data?**
Tier-calibrated thresholds (Phase 3), any `indexTier`-segmented ASM cohort comparison, and any
claim that a NIFTY-tier-specific threshold has been validated rather than just proposed.

**5. What MUST wait for ASM validation?**
Every claim about whether Hidden Gem, Emerging Opportunity, Recognized Opportunity, or any
convergence level actually performs differently (§D) — none of this may be asserted, in product
copy or otherwise, until Phase 2 produces real numbers — and the entire `HIGH CONVICTION
CANDIDATE` future tier referenced in the prior spec's §Q.3, which explicitly depends on ASM
showing a genuine combined-signal lift.

**6. What production code should eventually be written?**
A new, dedicated Hidden Gems module (finally giving `js/hiddenGems.js` real content instead of
being a 0-byte stub) implementing §A's pipeline and §F's event model as a first-class subsystem
reading from the existing production `accumulation/engine.js` and `server/src/scannerEngine.js`
outputs; an extension of `backtest/backtestRunner.js` into the generalized ASM cohort engine
(§C); and, once Phase 3 lands, a real point-in-time constituent-history module implementing the
schema already specified in the blueprint addendum (replacing/extending
`server/src/indexUniverses.js`'s current-only-membership design).

**7. What existing code should eventually be deprecated or consolidated?**
All three current Hidden Gems code paths — `js/discoveryRepair.js`'s Hidden Gems rendering,
`js/app.js`'s `renderDerived('Hidden Gems', 'hidden')`, and `js/ui.js`'s `renderHiddenGems` (plus
its duplicate in root `ui.js`) — should eventually be retired in favor of the single new module,
**but not before Phase 1–2 produce a working, backtested replacement** (ground rule #3 for this
pass: do not delete either existing implementation yet). The two 0-byte stub files
(`js/hiddenGems.js`, `js/opportunity.js`) should eventually either be filled with the real
implementation or removed if superseded by a different file structure — trivial cleanup, not
urgent, and not a reason to touch anything before the new pipeline exists and is validated.
