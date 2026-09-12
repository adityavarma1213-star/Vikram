# VIKRAM DECISION & REQUIREMENTS REGISTER

Statuses: MASTER (governing rule, not a task) / IMPLEMENTED / VERIFIED / IMPLEMENTED-BUT-UNVERIFIED /
PARTIAL / MISSING / CONTRADICTORY / DUPLICATE / LEGACY / BLOCKED-EXTERNAL / REJECTED.

This file reflects the ACTUAL repository state as of this pass, re-derived by inspection, not
carried forward from any earlier chat claim.

## Non-negotiable principles (MASTER)
- Never fabricate prices/OI/volume/delivery/dates/detection prices/recognition/institutional
  data/lead times/backtest/ASM results/live quotes. — **MASTER**
- One canonical accumulation engine: `accumulation/engine.js`. — **MASTER, VERIFIED** (SHA-256
  `ae6a8f1f6698fc41d16d7c15800ca7f406361f3f6ef06bc3e04dd43287fedf58`, re-checked every pass)

## Core engine
- Canonical accumulation engine — **VERIFIED**, byte-identical to original baseline every pass.
- Price-aware four-quadrant OI logic, A/D as secondary confirmation — **IMPLEMENTED** (pre-existing,
  unmodified; not independently re-derived this pass, carried from engine's own unchanged state).

## Data foundation
- CM/FO ingestion + validation (VALID/MISSING/MALFORMED/INVALID/DUPLICATE) — **VERIFIED** (offline
  tests, real execution).
- Provenance (source/acquisition date/checksum/row count) on ingestion_runs — **IMPLEMENTED**,
  DB-integration **BLOCKED-EXTERNAL** (no Postgres in this environment).
- 5-year genuine NSE history — **BLOCKED-EXTERNAL** (network egress denies `nsearchives.nseindia.com`
  — `x-deny-reason: host_not_allowed`, confirmed directly via curl, not assumed).

## Point-in-time universe / survivorship / corporate actions
- Point-in-time membership model, look-ahead protection — **VERIFIED** (offline tests).
- Survivorship tradability check — **VERIFIED** (offline tests); real lifecycle data — **MISSING**
  (table exists, zero real rows).
- Corporate-action adjustment (ratio-based) + discontinuity-detection heuristic — **VERIFIED**
  (offline tests, two complementary implementations at server- and backtest-level, not duplicates —
  see Duplicate/Legacy Audit below).

## Detection history
- Core calculator (`server/src/detectionHistory.js`) — **VERIFIED** (offline tests).
- Static-snapshot integration + UI — **VERIFIED** (offline tests).
- Live Postgres ingest path integration — **MISSING** until this pass (see Roadmap Phase F update).

## Historical verdict store
- General append-only "what did VIKRAM say about X on date T" archive — **MISSING** until this pass
  (distinct from the Hidden Gems/backtest signal event store, which is scoped to Hidden-Gem-relevant
  classifications only, not every verdict).

## Timeframe architecture
- Explicit documentation distinguishing current lookback vs. historical snapshot — **MISSING** until
  this pass.

## Opportunity Radar
- Canonical implementation — see forensic audit section below; status determined by inspection, not
  assumed.

## Hidden Gems
- Engine (`hiddenGems/engine.js`) — **VERIFIED** (offline tests, 8 assertion groups). Research-only:
  every threshold is `HIDDEN_GEMS_PROVISIONAL_v1_UNVALIDATED`.
- Production UI — **MISSING**.
- Real recognition/institutional data — **BLOCKED-EXTERNAL** (no data source connected).

## Immutable events / ASM
- Signal event store (frozen, append-only) — **VERIFIED** (offline tests).
- ASM (T0/P0/+1D/+5D/+20D/+60D/+120D/MFE/MAE/drawdown/benchmark-relative) — **VERIFIED** (offline,
  synthetic fixtures only — explicitly labeled, never real results).

## Real backtest
- Infrastructure (downloader, calendar, validators, manifest+integrity, production gate, event
  generation, real-engine adapter) — **VERIFIED** (offline tests). Real 5-year execution —
  **BLOCKED-EXTERNAL**.

## Research / statistics
- Confidence intervals, drawdown, sample-size/leakage warnings — see this pass's additions below.

## Allocation
- Requirement per Blueprint §19: risk-based sizing framework, not a validated methodology —
  **MISSING** until this pass; audited for necessity before building (see below).

## Live market data
- Gate + client + token manager + instrument mapping — **VERIFIED** (offline tests, every network
  entry point gated). Real provider connection — **BLOCKED-EXTERNAL** (no credentials).

## Security / database
- Auth (real accounts, scrypt, signed tokens, logout revocation), race-condition fix, alert
  deduplication, ingestion validation — **VERIFIED** (offline) / **BLOCKED-EXTERNAL** (DB-dependent
  tests correctly skip without Postgres).

## UI
- Accumulation Scanner + Detection History + Universe Selector — **VERIFIED** (offline tests for
  the underlying logic; visual rendering **BLOCKED-EXTERNAL**, no browser in this environment).
- Opportunity Radar, Hidden Gems, Analytics, Settings UI — audited this pass, see below.

## Explicitly REJECTED (carried forward, never re-proposed without new evidence)
- Hard-excluding or flat-penalizing NIFTY 500 in Hidden Gems — **REJECTED**.
- `available/total fields` as Data Confidence formula — **REJECTED**.
- Fake `StandardVikramAdapter` / any simplified substitute engine as VIKRAM logic — **REJECTED**,
  confirmed absent from this repository on every pass including this one.
- Treating Hidden Gem classification as a BUY signal — **REJECTED**.
- Claiming 100% completion because code exists / a ZIP was created — **REJECTED** (this document's
  own governing rule).
