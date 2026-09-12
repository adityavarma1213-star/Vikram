# VIKRAM HIDDEN GEMS — OPEN DECISIONS

Companion to `HIDDEN_GEMS_ALGORITHM_SPEC.md`. Nothing here is a final answer — it's the explicit
list of what still needs a human decision, a data source, or a real backtest before Hidden Gems
can ship. Organized so each row can be closed off independently and checked off as it's resolved.

---

## 0. BLOCKING — nothing else here can be validated numerically until this is resolved

| # | Item | Status | What's needed |
|---|---|---|---|
| 0.1 | 5-year real NSE data has never been downloaded. `backtest/data/manifest.json` has 1 entry, status `BLOCKED` (`nsearchives.nseindia.com` not in this sandbox's egress allowlist). `FINAL_REPORT.json` already confirms this in the repo. | **BLOCKING** | Run `backtest/nseDownloader.js` then `backtest/backtestRunner.js` in an environment whose network egress allowlist includes `nsearchives.nseindia.com` / `www.nseindia.com`. No code changes should be required per the existing `FINAL_REPORT.json` note — verify this is still true before assuming it. |
| 0.2 | This analysis was produced in the same sandboxed environment with the same network restriction — I could not run any part of the 5-year backtest myself. | **BLOCKING**, same as above | Same fix as 0.1. Every number in the spec document is a design proposal, not a validated result. |

---

## 1. Product / definition decisions (need a human call, not just data)

| # | Item | Options on the table | Recommendation in spec | Still open |
|---|---|---|---|---|
| 1.1 | NIFTY tier treatment | Exclude / Penalize / Context-only / Tier-based thresholds / Historical-recognition-based | Context + tier-based thresholds now (§I), historical-recognition-based as long-run target | Confirm this matches product intent — this recommendation directly overrides the brief's initial framing of "exclude vs penalize" as the main choice. |
| 1.2 | Whether `NIFTY 500 HIDDEN GEM` should be a separate top-level classification or a tier attribute on one `HIDDEN GEM` classification | Separate category / attribute on unified category | Attribute (§L.1) | Confirm — this changes UI copy and any saved-scan/alert schema. |
| 1.3 | Missing institutional data: route to `EMERGING OPPORTUNITY` or straight to `DATA INSUFFICIENT`? | Either | Lean `EMERGING OPPORTUNITY` (§H.2) but flagged explicitly as untested | This is exactly the kind of thing to A/B during walk-forward testing, not decide by argument alone — track which produces the more defensible track record. |
| 1.4 | Whether `ASM` (Accumulation Success Matrix) already exists somewhere outside the two uploaded ZIPs | Unknown | N/A | **Not found in either ZIP under any obvious name.** Confirm where it lives (a third repo? a planned-but-unbuilt module? a spreadsheet process?) before any Q section integration work starts. |
| 1.5 | Whether the "3 signals" in the 1/3, 2/3, 3/3 convergence language map to (Accumulation, Stealth, Recognition-absence) or to something else entirely (e.g. three pre-existing scanner presets) | Unclear from the brief | Assumed the three Hidden Gems sub-signals for this spec (§O.4) | Confirm intended meaning before building convergence testing — a wrong assumption here would produce meaningless convergence stats. |

---

## 2. Data sources that don't exist yet (`DATA REQUIRED`)

| # | Item | Why it's needed | Current state |
|---|---|---|---|
| 2.1 | Historical, point-in-time NIFTY 50/200/500 constituent changes (`effectiveFrom`/`effectiveTo`/`source`/`sourceDate`) | Required for any historical Hidden Gems backtest cut by index tier without look-ahead bias | Schema already designed in `VIKRAM_BLUEPRINT_ADDENDUM_INDEX_UNIVERSE_SELECTION_06_SEP_2026.md`; zero implementation. `server/src/indexUniverses.js` only fetches *current* constituents. |
| 2.2 | Historical institutional (FII/DII/MF/promoter/pledge) holding time series, with publication date (not quarter-end date) tracked separately | Required for §H institutional recognition | Only a 5-company, single-date, hand-typed demo table exists (`js/financialData.js`). Not usable for any real classification. |
| 2.3 | Real news/attention feed with objective, countable trigger definitions | Required for a defensible market-Recognition signal beyond price/volume/breakout | `js/newsEngine.js` only calculates from manually-entered counts; no ingestion pipeline exists. |
| 2.4 | Benchmark/index price series (for benchmark-relative return, regime segmentation) | Required for §O.3's benchmark-relative return and regime-dependence analysis | Not present anywhere in `backtest/`. |
| 2.5 | Corporate-action adjustment data (splits, bonuses, etc.) for the downloaded price/volume/delivery series | Required to avoid false Recognition/Opportunity signals around action dates (§N) | Unknown whether NSE bhavcopy data is pre-adjusted upstream — needs verification once real data is downloaded, not assumed either way. |
| 2.6 | Survivorship-complete universe (delisted/suspended/merged names included in the 5-year download) | Required to avoid survivorship bias in the backtest (§N) | Needs verification against `backtest/nseDownloader.js`'s actual universe-selection logic once it runs for real. |

---

## 3. Numbers that are placeholders only — every single one is `REQUIRES BACKTESTING`

None of the following should be treated as a recommendation. They are the list of *slots* that
need a validated number, produced only via the walk-forward process in spec §O.5/§P.

- Opportunity-qualification bar (how much stricter than base Accumulation CONFIRMED/STARTING)
- Stealth "moderate vs extreme" cutoffs for volume ratio, OBV slope, delivery trend
- Recognition trigger cutoffs (price expansion persistence threshold, volume percentile,
  breakout definition to reuse or build)
- NOT RECOGNIZED / EMERGING RECOGNITION / RECOGNIZED trigger-count thresholds
- Institutional under-recognition holding-level and acceleration thresholds, per index tier
- Minimum session count for a Stealth episode to qualify (the brief's own example used 30
  sessions — untested)
- Minimum lead time to count as a "validated early-detection" episode
- Maximum incubation window before an open detection episode is marked stale/unresolved
- Data Confidence hard-required-field list and weighted-tier weights
- Failure-rate return floor (§O.3)
- Walk-forward fold boundaries (§O.5) — depends on how much real data successfully downloads

---

## 4. Verification tasks (check the existing code before building on top of it)

| # | Task | Why |
|---|---|---|
| 4.1 | Check whether `js/ruleEngine.js` already encodes a breakout definition that could be reused for the Recognition engine, rather than building a second, inconsistent breakout definition. | Avoid a fourth inconsistent "what counts as X" definition, repeating the exact problem §A.1 documents for Hidden Gems itself. |
| 4.2 | Confirm the actual name/location of ASM if it exists anywhere (see 1.4). | Needed before any §Q integration work. |
| 4.3 | Confirm whether NSE bhavcopy data ingested by `backtest/nseDownloader.js` is corporate-action-adjusted upstream. | Needed before trusting any Recognition/Opportunity signal near action dates. |
| 4.4 | Confirm `backtest/nseDownloader.js`'s universe selection includes historically-delisted/suspended symbols, not just the current listing. | Needed to avoid survivorship bias in the 5-year backtest. |

---

## 5. Explicitly rejected ideas (kept here so they aren't re-proposed without new evidence)

- **Hard-excluding NIFTY 500 from Hidden Gems eligibility** — rejected in spec §I.1; contradicted
  by the definition itself and by the owner's own worked example (§J.1, Case 1).
- **Flat penalty on NIFTY 500 membership** — rejected in spec §I.1; conflates "large/liquid" with
  "already recognized," which the audit found no evidence for.
- **`available required fields / total required fields` as the sole Data Confidence formula** —
  rejected in spec §M.1; lets many minor fields mathematically compensate for one missing
  critical field (institutional or Recognition data), which the brief explicitly warned against.
- **A pure multiplicative HGI (Model A) as the primary scoring formula** — not rejected outright,
  but ranked below the hybrid (Model C) in spec §E due to masking, double-counting with
  `EarlyDetection`/`(1-Recognition)`, and threshold instability. Kept as a documented alternative,
  not built.
- **Treating "Hidden Gem" classification as a BUY signal / feeding it directly into ASM as
  automatic high conviction** — explicitly rejected per the brief's own instruction and spec §Q.1.
