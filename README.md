# VIKRAM — Investor Operating System

A five-pillar stock scoring system for NSE-listed companies, built to be honest about what it does and doesn't know.

## What it does

Search a stock → VIKRAM scores it across five pillars (Technical, Fundamental, Institutional, Valuation, News) → gives you one weighted score and a plain-language verdict explaining why.

## Core principle

**VIKRAM says "I don't know" when it doesn't know, instead of guessing.** If a pillar doesn't have real, verified data, it's excluded from the score and clearly marked — not silently filled with a fake neutral number. See `ROADMAP.md` for the full detail on how this is enforced in code.

## Running it

No build step, no server needed. Open `index.html` directly in a browser.

```
index.html          - main app (single page)
about.html           - about page
analysis.html         - standalone simple analysis view
css/style.css          - all styling
js/
  companyDatabase.js    - company metadata
  technicalData.js      - RSI, MACD, ADX, etc.
  financialData.js      - ROE, growth, debt, FII/DII holdings
  engine.js             - search + lookup entry point
  frameworkEngine.js    - orchestrates all 5 pillars into one score
  scoreEngine.js         - weighted scoring + confidence calculation
  fundamentalEngine.js   - sector-aware fundamental scoring
  technicalEngine (inline in frameworkEngine.js)
  institutionEngine.js  - FII/DII analysis
  valuationEngine.js     - margin of safety, intrinsic value
  riskEngine.js           - financial/technical/business risk
  newsEngine.js            - sentiment & catalyst scoring
  gauge.js                  - the animated score gauge
  ui.js                      - all dashboard rendering + Portfolio Tracker
```

## Current status

See `ROADMAP.md` for the honest, current state — what's built, what's pending, and what needs your data (not code) to finish.

## Data sources

Currently sample/researched data for 5 stocks (CDSL, NEWGEN, TCS, RELIANCE, INFY). Live market data requires a broker API connection (Kite Connect, Angel One SmartAPI, or Motilal Oswal API) — not yet wired in.

## Disclaimer

This is a personal research tool, not investment advice. See `about.html` for the full disclaimer.
