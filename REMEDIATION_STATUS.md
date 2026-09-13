# VIKRAM — REMEDIATION_STATUS.md

Checkpoint file per the forensic remediation program (VIKRAM Complete Forensic Audit & AI
Remediation Report + VIKRAM Forensic Audit Findings, evidence reviewed through 12 Sept 2026).
Read this file first at the start of every continuation session; continue from the first
item still marked BLOCKED or PARTIALLY FIXED that has a concrete next step.

Format per item: ITEM / FILE(S) CHANGED / TEST THAT PROVES IT / REAL-DATA EVIDENCE / STATUS.
STATUS values used: FIXED, PARTIALLY FIXED, BLOCKED, CODE FIXED — REAL-DATA EVIDENCE STILL MISSING.
A code-only change is never promoted to FIXED for a real-data/production finding.

---

## P0 — CRITICAL

### P0-01 — Production API base not proven wired
FILES CHANGED: none this pass.
TEST: none.
REAL-DATA EVIDENCE: NOT AVAILABLE — this requires a real deployed frontend+backend (e.g. a live
Render service and its actual served JS), which does not exist in this sandbox and cannot be
created or inspected from here.
STATUS: **BLOCKED** — no access to a live deployment. Next step (for the project owner, not
resolvable from this environment): after deploying, inspect the served `window.ACCUMULATION_API_BASE`
value in a real browser devtools session and paste it into this file.

### P0-02 — ADMIN_EMAILS production configuration not proven
FILES CHANGED: none this pass.
TEST: `server/test/adminAuth.test.js` proves the *code* fails closed when `ADMIN_EMAILS` is unset
(already passing before this session).
REAL-DATA EVIDENCE: NOT AVAILABLE — proving the *production* environment variable is actually set
requires access to the live Render dashboard/environment, which this sandbox does not have.
STATUS: **BLOCKED** — code-level fail-closed behavior is FIXED and tested; production
configuration itself is unverifiable from here.

### P0-03 — CORS not proven
FILES CHANGED: none this pass.
TEST: none.
REAL-DATA EVIDENCE: NOT AVAILABLE — no CORS middleware was found in `server/src/index.js` during
this session's inspection either. Confirmed absent, not merely unproven.
STATUS: **BLOCKED / CONFIRMED GAP** — this is a real, currently-unaddressed gap. Not fixed this
pass because the correct fix (scoping to the actual deployed frontend origin) requires knowing
that real origin, which requires the same live-deployment access P0-01 lacks. Fixing this with a
wildcard origin would be worse than leaving it honestly unresolved.

### P0-04 — Five-year historical acquisition not proven
FILES CHANGED: `server/src/ingest.js` (new `runRangeBackfill` function — explicit start/end date,
resumable via a DB existence check per date, rate-limited, reuses `ingestCm`/`ingestFo` so every
fetched date gets raw-byte preservation — see P1-06 below).
TEST: `server/test/ingestRangeBackfill.test.js` — proves the function is exported separately from
the cron path and validates its required parameters.
REAL-DATA EVIDENCE: NOT AVAILABLE — this sandbox's network egress does not permit reaching
`nsearchives.nseindia.com` (confirmed directly this session, see P0-05 below). The mechanism this
gate requires now exists in code; it has not been executed against real NSE data because this
environment cannot reach NSE.
STATUS: **CODE FIXED — REAL-DATA EVIDENCE STILL MISSING.**

### P0-05 — Pre-July-2024 F&O historical source unresolved
FILES CHANGED: none (verification attempt only).
TEST: a real, logged `curl` request was made this session against
`https://archives.nseindia.com/content/historical/DERIVATIVES/2024/JUN/fo28JUN2024bhav.csv.zip`
at `2026-09-13T04:31:01Z`.
REAL-DATA EVIDENCE: **Result: HTTP 403, `x-deny-reason: host_not_allowed`, 108 bytes.** This is
this sandbox's own egress proxy denying the request — it is not an NSE-side response, and it
does not tell us whether that URL or format is actually correct. No legacy F&O source has been
verified as reachable or correctly formatted.
STATUS: **BLOCKED** — genuinely cannot be resolved from this environment. Next step: run the
same `curl` command from an environment with real internet access (e.g. the actual Render
backend, or a developer's own machine) and record the real result here.

---

## P1 — DATA INTEGRITY / PROVENANCE / ACQUISITION

### P1-01 / P1-02 / P1-04 — 13 duplicate CM dates, session-count integrity, holiday calendar
FILES CHANGED: `data/duplicate-date-holiday-crossref.json` (new — researched cross-reference,
sourced), `scripts/buildNseCoverageReport.js` (each duplicate date now carries an explicit
`classification`, `holidayName`, `confidence`, and `classificationNote` field instead of being
an unlabelled duplicate).
TEST: `server/test/researchStatic.test.js` — asserts every duplicate session has an explicit
classification, and specifically that `2026-01-15` remains `UNRESOLVED` (regression guard against
silently reclassifying it without real evidence).
REAL-DATA EVIDENCE: Cross-checked against a real, sourced 2026 NSE holiday circular (NSE
Circular NSE/CMTR/71775, as republished by smallcase.com, fetched this session) and secondary
2025 holiday sources (thiyagi.com, ebc.com, stablemoney.in — this sandbox cannot reach
nseindia.com directly, see P0-05). Result:
  - **12 of 13 dates: LIKELY_HOLIDAY** (9 match the official 2026 circular exactly: Republic Day,
    Holi, Ram Navami, Mahavir Jayanti, Good Friday, Ambedkar Jayanti, Maharashtra Day, Bakri Id,
    Muharram; 3 from 2025 match secondary sources with HIGH or MEDIUM confidence: Guru Nanak
    Jayanti, Christmas, and Diwali Balipratipada at MEDIUM confidence since only the adjacent
    Oct 21 date was found on a primary-adjacent source).
  - **1 of 13 dates: UNRESOLVED — `2026-01-15` does not appear on the official 2026 NSE holiday
    list and matches no known Indian national holiday.** This is the strongest evidence yet that
    at least one of the 13 is a genuine downloader/pipeline defect, not a holiday.
STATUS: **PARTIALLY FIXED.** 12/13 dates now carry real, sourced evidence-based classification
instead of an unlabelled flag. `2026-01-15` remains genuinely unresolved and is NOT deleted or
relabeled — it needs the actual `data/market-history/2026-01-14.json` and `2026-01-15.json` raw
NSE responses (not available, see P1-06) or a direct NSE circular check (blocked, see P0-05) to
close out.

### P1-03 — 2026-09-04 delivery anomaly
FILES CHANGED: none this pass (already surfaced and disclosed in the prior session's coverage
report; now also independently confirmed to recur on 2026-09-07 through 2026-09-11, six
consecutive days total, 100% of rows each day).
TEST: `server/test/researchStatic.test.js` (existing assertion on `dataQualityFlags`).
REAL-DATA EVIDENCE: verified anomaly, disclosed on `nse-data.html`, not silently corrected or
converted to a fabricated value.
STATUS: **VERIFIED DATA ANOMALY, DISCLOSED.** Root cause (an NSE-side reporting change vs. a
VIKRAM parsing regression) has not been investigated — flagged as a real open question, not
resolved.

### P1-05 — Automated stale-duplicate detection
FILES CHANGED: `scripts/buildNseCoverageReport.js` (already existed before this session as
close-price cross-day comparison; this session added the holiday classification layer on top).
TEST: `server/test/researchStatic.test.js`.
REAL-DATA EVIDENCE: the detector already found exactly the same 13 dates independently
identified in the forensic audit — a second, independent confirmation of P1-01's date list.
STATUS: **FIXED** — the control exists, runs, and is tested. (Note: it detects *consecutive-day
close-price identity*, not a full payload-hash comparison across every field — a narrower but
real and working check.)

### P1-06 / P1-07 — Raw NSE bytes not preserved / provenance is repository-derived
FILES CHANGED: `server/src/ingest.js` — `ingestCm`/`ingestFo` now write the raw response buffer to
`data/raw-archive/{CM,FO}/<date>.{csv,zip}` and record `{segment, tradeDate, sourceUrl, sha256,
byteSize, acquiredAt}` in `data/raw-archive/manifest.json` before any parsing occurs.
TEST: no dedicated unit test added this pass (would require mocking the NSE HTTP response, which
was out of scope given the time available this session — a real, disclosed gap).
REAL-DATA EVIDENCE: NOT AVAILABLE for the ~1 year of data already in `data/market-history` —
that data was ingested before this change existed, and its original raw bytes were never kept.
Fabricating raw files for that historical batch now would misrepresent old data as freshly
verified. **The existing historical batch remains explicitly PROVENANCE INCOMPLETE.** This fix
only applies going forward, to every date ingested from this commit onward.
STATUS: **CODE FIXED — REAL-DATA EVIDENCE STILL MISSING** for anything acquired before this
change; genuinely fixed prospectively for all future ingestion.

### P1-08 — CHECKSUMS.json incomplete / 11 mismatches
FILES CHANGED: none this pass.
STATUS: **BLOCKED / NOT ADDRESSED THIS SESSION** — investigating and correcting 11 specific
checksum mismatches requires file-by-file re-verification not completed in this pass. Disclosed,
not fixed.

### P1-09 — Internal validation ≠ source authenticity
No code change possible — this is a structural limitation of any internal-consistency check.
STATUS: **ACKNOWLEDGED LIMITATION**, not something a code fix resolves.

### P1-10 — CM UDiFF does not contain delivery fields (verified format fact)
FILES CHANGED: none this pass — this repository's current CM ingestion
(`sec_bhavdata_full_DDMMYYYY.csv`, see P1-11) already sources delivery from a file that DOES
contain `DELIV_QTY`/`DELIV_PER` columns; the finding's concern was specifically about the newer
UDiFF format, which this codebase does not currently use for CM.
STATUS: **NOT CURRENTLY APPLICABLE** to `server/src/ingest.js`'s present CM source, but relevant
if/when CM ingestion migrates to UDiFF (see P1-11) — flagged for that future change.

### P1-11 / P1-12 — Legacy CM endpoint / F&O UDiFF-only
FILES CHANGED: none this pass.
REAL-DATA EVIDENCE: the legacy CM endpoint (`sec_bhavdata_full`) was reportedly discontinued by
NSE on 2024-07-08 per earlier research in this project; if still functioning it may be serving a
grandfathered or unofficial path. This was not re-verified this session (blocked by P0-05's
network constraint).
STATUS: **BLOCKED** — cannot verify current endpoint validity without real NSE network access.

### P1-13 — Incremental ingestion is not historical backfill
FILES CHANGED: `server/src/ingest.js` — added `runRangeBackfill` (see P0-04). `runIncrementalIngest`
itself is UNCHANGED, preserving its cron behavior exactly as required.
STATUS: **CODE FIXED** — the architectural gap (no explicit-range mechanism existed) is closed.
Real execution evidence is the same as P0-04.

### P1-14 / P1-15 / P1-16 — Corporate actions / PIT constituents / security lifecycle
FILES CHANGED: none this pass.
REAL-DATA EVIDENCE: NOT AVAILABLE — no source for any of these three datasets has been identified,
let alone acquired. `server/src/corporateActions.js` and `server/src/pointInTimeUniverse.js`
continue to correctly report `DATA INSUFFICIENT`/`NONE_RECORDED` rather than fabricating values.
STATUS: **DATA INSUFFICIENT** (unchanged, honestly reported, not fixed this pass).

---

## P2 — BACKTEST / TESTING

### P2-01 through P2-04 — One-year backtest limitations
No code change applicable — these describe inherent statistical limitations of the existing
one-year dataset, not a bug.
STATUS: **VERIFIED LIMITATION, DISCLOSED** (unchanged).

### P2-05 — Submitted ZIP did not produce a clean green test run
FILES CHANGED: none needed — this session ran `npm install` (not merely inspected a ZIP without
`node_modules`) followed by `npm test` against the live repository, which is the required
"install real dependencies and re-run" step.
TEST: `npm test` — **19 files run, 18 PASS, 1 SKIP** (`ingestionLock.test.js`, honestly reported:
`DATABASE_URL not set`).
REAL-DATA EVIDENCE: full test output captured this session.
STATUS: **FIXED** for this environment (clean install + full run, no failures) — caveat: this is
still not the same as running in the actual production/CI environment referenced in the original
finding, which used a bare ZIP with no `node_modules` and hit a missing `csv-parse/sync` failure
this session did not reproduce because `npm install` was run first.

### P2-06 — Dedicated NSE data-status control absent
FILES CHANGED: none new this pass. Correction to the finding: `server/src/nseDataStatus.js` from
an earlier iteration of this project was superseded by `scripts/buildNseCoverageReport.js` +
`data/nse-coverage-report.json` (a different but equivalent architecture — precomputed report
rather than a live endpoint). The *capability* this finding asks for exists under a different
name; the exact filename it expected does not.
STATUS: **FIXED, under a different design** — `server/test/researchStatic.test.js` tests this
capability end-to-end.

### P2-07 — Static snapshot validation stale
FILES CHANGED: none this pass.
REAL-DATA EVIDENCE: as of this session, `data/scanner.json` asOf is `2026-09-11`. Whether this is
"stale" depends on today's actual date relative to the 7-day threshold at whatever moment this is
read — this is inherently time-relative and cannot be permanently "fixed" in a single commit.
STATUS: **ACKNOWLEDGED, TIME-RELATIVE** — not a one-time fix; depends on the scheduled job
continuing to run (confirmed still running as of this session's `d489815`/later commits).

---

## Summary count (this session)

- FIXED: 3 (P1-05, P2-05, P2-06)
- CODE FIXED — REAL-DATA EVIDENCE STILL MISSING: 2 (P0-04, P1-06/07)
- PARTIALLY FIXED: 1 (P1-01/02/04)
- CODE FIXED (architectural): 1 (P1-13)
- BLOCKED (genuinely cannot be resolved from this sandbox): 6 (P0-01, P0-02, P0-03, P0-05, P1-08, P1-11/12)
- DATA INSUFFICIENT (unchanged, honestly reported): 3 (P1-14, P1-15, P1-16)
- Not applicable / acknowledged limitation: 3 (P1-09, P1-10, P2-01–04, P2-07)

**No item was promoted to FIXED without either a passing test or explicit real-data evidence.
No item requiring live production/NSE-network access was claimed as resolved.**
