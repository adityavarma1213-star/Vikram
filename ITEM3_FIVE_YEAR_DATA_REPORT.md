# ITEM 3 — Five-Year Data Foundation (September 2021 → September 2026)

## STATUS: BLOCKED (data acquisition) / PARTIALLY FIXED (pipeline readiness + format research)

**The five-year dataset does not exist and was not built in this session.** Building it requires
downloading ~1,300 additional trading days of NSE CM + F&O bhavcopy data (2021-09 through
2025-08, on top of the real 2025-09→2026-09 year already in the repo), which requires outbound
network access to `nsearchives.nseindia.com`. **This sandbox has no network access** (`bash_tool`
network is disabled; confirmed by `liveNetworkProbe.test.js` returning `host_not_allowed`, and by
a direct `web_fetch` attempt against an NSE URL being rejected as outside the tool's allowed
scope). No 5-year data was fabricated to work around this. What follows is what could honestly be
done without network access: verify the pipeline is actually capable of the job, harden a real gap
found while verifying it, and research the format questions the brief specifically raised.

## What genuinely exists today (real, verified)

- **250 genuine trading sessions**, 2025-09-02 → 2026-09-04 (after excluding the 13 confirmed
  non-trading stale-duplicate dates — see `ITEM1_DATE_VERIFICATION_REPORT.md`).
- CM: 250/250 days with data, `data/nse-coverage-report.json` → `cm.daysWithData: 250`.
- F&O: 250/250 days with data (`fo.daysWithData: 250`).
- Delivery quantity/percentage: **confirmed present and realistic** for 249 of 250 days (one
  recent date shows 100% zero-delivery, consistent with a T+1 publication lag, not a bug — see
  `dataQualityFlags` in the coverage report). Verified directly against real values, e.g.
  `data/market-history/2025-09-02.json`: 2,126 rows, `deliv_per` ranging 4.43%-100%, mean 53.38%,
  zero rows at exactly 0% — genuine distribution, not a placeholder.
- Corporate actions: `CORPORATE_ACTION_DATA_REQUIRED` — the fetch has never actually been run
  (needs network); the discontinuity-flagging fallback (`backtest/lib/corporateActions.js`) exists
  and fabricates nothing, but has not been exercised against this dataset in this session.
- Historical NIFTY 50/500/eligible-universe membership: **not populated**. Real, honest
  architecture exists (`server/src/pointInTimeUniverse.js`) that explicitly refuses to use today's
  constituent list to represent a historical date — but genuine multi-year point-in-time history
  requires either a paid historical-constituent-change feed (not available here) or years of daily
  snapshots accumulated going forward from a live job. **DATA INSUFFICIENT** — there is no
  shortcut that produces real 5-year membership history today.
- Historical ASM/GSM surveillance status: **no infrastructure and no data**. Not found anywhere
  in the repository. **MISSING**, not attempted in this session (see Remaining Limitations).
- Symbol/ISIN changes, delisted securities: infrastructure exists
  (`server/src/survivorship.js`) with the same honest "UNKNOWN, not TRADABLE, when no record
  exists" design as the universe-membership module — but the underlying `security_lifecycle`
  table is empty. **DATA INSUFFICIENT**.

## Is the pipeline actually capable of 5 years, or does it just accept a 5-year date range on paper?

Verified, not assumed:
- `backtest/lib/dateUtils.js::candidateSessionDates(startDate, endDate)` and
  `backtest/nseDownloader.js::run({startDate, endDate, ...})` take arbitrary date bounds — no
  hardcoded 1-year limit anywhere in the code. Confirmed by reading the implementation, not by
  running a 5-year job (impossible here).
- The provenance chain (raw bytes → SHA-256 → parse → normalize → validate → manifest) applies
  uniformly regardless of date range — see `ITEM2_PROVENANCE_REPORT.md`.
- The stale-duplicate/holiday-exclusion logic added for Item 1
  (`backtest/lib/staleDuplicateDetector.js`) is general-purpose and format-agnostic — it will
  correctly catch any future carried-forward-duplicate dates across a 5-year run exactly as it did
  for the 13 already found, not just within the current 1-year window.
- **A real gap was found and fixed while verifying this** (see next section) — so "the code
  supports a 5-year range" was checked by actually reading and testing it, not assumed from the
  parameter signature.

## NSE FORMAT TRANSITION (researched with real, cited sources — no bulk download needed for this part)

- **Legacy format** (`sec_bhavdata_full_DDMMYYYY.csv`, and the older per-segment
  `historical/EQUITIES/YYYY/MON/cmDDMONYYYYbhav.csv.zip`) was the standard NSE bhavcopy format for
  the majority of the target 5-year window.
- **UDiFF format** (`BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip`) replaced it. Per NSE's own
  "All Reports" page (nseindia.com/all-reports, accessed 2026-09-13): the legacy per-segment
  bhavcopy was *"Discontinued w.e.f July 08, 2024. Refer NSE Circular No. 62424 dated June 12,
  2024. Switch to CM-UDiFF Common Bhavcopy Final(zip)."* This gives a **precise, sourced
  transition date: 2024-07-08**, not an assumption.
- `backtest/nseDownloader.js` already tries the UDiFF URL first and falls back to the legacy
  `sec_bhavdata_full` URL (`cmCandidateUrls()`), which is the correct order for a run spanning the
  transition — for dates before 2024-07-08 the UDiFF URL should 404 and the code falls through to
  legacy; for dates after, UDiFF succeeds. **This has not been exercised against a real date
  before/after the boundary in this session** (no network) — it is a correct-by-reading-the-code
  claim, not a live-verified one.
- **Delivery data source — independently verified, not assumed**: the brief specifically warned
  not to assume the CM UDiFF file contains delivery data. Several third-party sources (blog posts)
  claim delivery comes from a separate "Security-wise Delivery Position" report. **Checked against
  the actual real data already in this repository** (not the blog posts): `deliv_qty`/`deliv_per`
  in `data/market-history/*.json` — produced by code that reads `DlvryQty`/`DlvryPct` directly off
  the same UDiFF CM rows — show real, varied, non-placeholder values (see above). **Conclusion:
  for the UDiFF format actually used to produce this repo's real data, delivery fields ARE present
  inline in the CM file.** Whether this also held for the legacy `sec_bhavdata_full` format is
  separately confirmed: that format's own column list includes `DELIV_QTY`/`DELIV_PER` by design
  (it is NSE's "full" consolidated report, distinct from the bare per-segment bhavcopy some other
  tools use). Not independently verified for the *very old* pre-`sec_bhavdata_full` per-segment
  legacy format (`historical/EQUITIES/.../cmDDMONYYYYbhav.csv.zip`), which several sources suggest
  may genuinely require a separate delivery file (`MTO`/`PR` report) — **flagged as unresolved for
  dates that would need that oldest format specifically** (see Remaining Limitations).

## A real gap found and fixed while verifying the pipeline

`backtest/nseDownloader.js`'s `requireColumns()` call for the CM formats did not previously
require `DlvryQty`/`DlvryPct` (UDiFF) or `DELIV_QTY`/`DELIV_PER` (legacy) to be present — only
price/volume columns were required. Because this codebase's `num()` helper returns `0` (not
`null`) for a genuinely missing column (`Number('') === 0` in JavaScript), a future NSE format
change that silently dropped or renamed the delivery columns would have caused every row to
silently record `deliv_per: 0` — indistinguishable from a genuine 0%-delivery day — instead of
failing loudly. **Fixed**: both column lists now require the delivery fields explicitly, so a
format change here throws instead of fabricating zeros. (`backtest/nseDownloader.js`,
`normalizeCmRows()`.)

## FINAL REPORT (as required by the task)

```
VERIFIED DATE RANGE:              2025-09-02 to 2026-09-04 (1 year, NOT 5 years)
VERIFIED GENUINE TRADING SESSIONS: 250 (263 files on disk minus 13 confirmed non-trading duplicates)
CM COVERAGE:                      250/250 genuine sessions (100%)
DELIVERY COVERAGE:                249/250 genuine sessions with real, varied delivery data
                                   (1 recent date shows a data-quality flag, likely T+1 lag —
                                   see data/nse-coverage-report.json dataQualityFlags)
F&O COVERAGE:                     250/250 genuine sessions (100%)
OI COVERAGE:                      100% of F&O rows have a recorded open-interest value
                                   (data/nse-coverage-report.json oiFieldCoveragePct)
CORPORATE ACTION COVERAGE:        CORPORATE_ACTION_DATA_REQUIRED — fetch never run (needs network)
PIT UNIVERSE COVERAGE:            DATA INSUFFICIENT — architecture exists, no historical data
ASM COVERAGE:                     MISSING — no infrastructure, no data
RAW PROVENANCE COVERAGE:          PROVENANCE INCOMPLETE for the existing 1-year batch;
                                   PROVENANCE COMPLETE pipeline exists and is enforced for any
                                   future download (see ITEM2_PROVENANCE_REPORT.md)
REMAINING BLOCKERS:               No network access in this environment to run
                                   backtest/nseDownloader.js against NSE's real archive for the
                                   additional ~4 years (2021-09 to 2025-08) needed to reach the
                                   5-year target, or to fetch real corporate-action/index-
                                   membership/ASM history from their respective live sources.
```

**Do not read this as "100% complete."** It is not. The 5-year data foundation was not built. What
was accomplished: the existing 1-year data was audited and corrected (Item 1), the ingestion
pipeline was confirmed and hardened to be provenance-complete and format-transition-aware (Item 2,
this item), and every gap that could not be closed without network access is named specifically
rather than glossed over.

## To actually complete this item (next steps, for an environment with real NSE network access)

1. Run `node backtest/nseDownloader.js` (or `npm run download` in `backtest/`) with
   `startDate = 2021-09-01`, `endDate = 2025-08-31` (the gap before the existing real year) — the
   code already supports this range; it has just never been run against it here.
2. Watch specifically for the 2024-07-08 format-transition boundary in the resulting manifest —
   confirm UDiFF succeeds after and legacy succeeds before, and confirm delivery fields are
   populated on both sides (the `requireColumns` hardening added in this session will now fail
   loudly instead of silently zeroing if they are not).
3. For dates before whatever date `sec_bhavdata_full` itself was introduced (needs its own
   verification — not established in this session), confirm whether an even older legacy format
   is needed and whether that format requires a separate delivery report; extend
   `cmCandidateUrls()` with a third candidate if so.
4. Run `backtest/lib/corporateActions.js`'s real NSE fetch (network-dependent) across the full
   window; if the endpoint referenced in that file's comments turns out to be wrong or changed,
   correct it against NSE's actual live response, not by assumption.
5. Stand up a real daily job calling `server/src/pointInTimeUniverse.js::reconcileSnapshot()` —
   this is the only honest way to build point-in-time index-membership history; there is no way to
   retroactively produce 2021-2026 coverage instantly even with network access, since NSE does not
   appear to publish a clean historical constituent-change feed (not independently confirmed
   either way in this session — worth a dedicated search before assuming it doesn't exist).
6. Source real historical ASM/GSM surveillance status and symbol/ISIN change history — no source
   was identified or evaluated for either in this session; this is a fully open item.
7. Re-run `node backtest/scripts/auditSuspiciousDates.js` and
   `node scripts/buildNseCoverageReport.js` after any new data lands — both already generalize
   correctly to more dates without modification.

## Remaining limitations

- No network access in this sandbox — the single limiting factor for nearly every open item above.
- Pre-`sec_bhavdata_full` legacy delivery-data sourcing (oldest part of the 5-year window) is
  unresolved — flagged, not guessed at.
- Whether NSE publishes any real historical index-constituent-change feed at all was not
  determined either way.
- ASM/GSM historical surveillance data source was not researched in this session (time-boxed out
  in favor of Items 1 and 2, which had concrete, fully-resolvable findings).
