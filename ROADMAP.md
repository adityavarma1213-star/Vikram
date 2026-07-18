# VIKRAM Improvement Roadmap

_Last updated: 16 July 2026_

This is the real, honest state of VIKRAM — not aspirational. Every item below reflects what's actually true in the codebase today.

---

## ✅ Done and Working

- Search → 5 pillars → honest verdict pipeline (engine.js → frameworkEngine.js → scoreEngine.js → ui.js)
- Five pillars, all real formulas: Technical, Fundamental, Institutional, Valuation, Risk, News
- 80% confidence governance rule — a pillar with no real data is excluded from the score, not faked
- Technical/Institutional correlation dampening — stops one signal being counted twice
- Real FII/DII institutional data for 5 stocks (sourced, dated, confidence-labeled)
- Opportunity Radar — ranks all stocks in the database by real score
- Hidden Gems — smaller-cap stocks with strong scores (honest about "relative to your database" limit)
- Explainability Engine — plain-language reasoning naming strongest/weakest pillar
- Master Verdict Subsystem — Long-Term vs Short-Term score split
- `analysis.html` fixed (was broken, unused, now working if needed)

---

## 🔧 Needs Real Coding (not started)

| Task | Notes |
|---|---|
| Sector-specific Fundamental rules | Banks/IT/Auto likely need different ROE/growth benchmarks than one flat rule |
| Portfolio Tracker | Buy price, quantity, live P/L, VIKRAM grade per holding — proposed, never built |
| Kite Connect live data wiring | Requires the ₹500/month paid plan first |
| `about.html`, `portfolio.html`, `scanner.html` | Currently empty (0 KB) |

---

## 📊 Needs Your Data, Not Code

| Task | What's needed |
|---|---|
| Real Fundamental thresholds | Your actual Excel ROE/D-E/growth cutoffs (currently using reasonable industry defaults) |
| More stocks in database | Currently only 5 (CDSL, NEWGEN, TCS, RELIANCE, INFY) |
| FII/DII change direction | Real quarter-over-quarter data (currently neutral/unknown) |

---

## Core Principle (do not compromise on this)

VIKRAM says "I don't know" when it doesn't know, instead of guessing. Every future feature should follow this same rule — no fake confidence, no invented numbers presented as real.

---

## Single Canonical Rating Scale (do not duplicate elsewhere)

This is the ONLY rating scale VIKRAM uses, as implemented in `scoreEngine.js`. Any other document (including old pasted blueprints from past chats) showing a different scale is outdated — this is the real one:

| Score | Rating |
|---|---|
| 90-100 | STRONG BUY |
| 75-89 | BUY |
| 60-74 | HOLD |
| 40-59 | REDUCE |
| 0-39 | AVOID |

If a score cannot be computed (no pillar meets the confidence threshold), rating is `INSUFFICIENT DATA` — never a guessed grade.
