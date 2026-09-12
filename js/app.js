document.addEventListener('DOMContentLoaded', async () => {
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value === null || value === undefined || value === '' ? 'N/A' : value;
  };
  const show = id => document.getElementById(id)?.classList.remove('hidden');
  const hide = id => document.getElementById(id)?.classList.add('hidden');

  const render = async ticker => {
    show('companyOverview');
    hide('errorContainer');
    try {
      await window.VIKRAM_DATA_ENGINE.loadSnapshot();
      const data = window.VIKRAM_DATA_ENGINE.analyzeAsset(ticker);
      if (!data) throw new Error(`Ticker ${String(ticker).toUpperCase()} was not found in the verified NSE universe.`);

      const m = data.meta || {};
      const t = data.technical || {};
      set('overviewCompanyName', `${m.name || ticker} · NSE`);
      set('overviewSector', m.sector);
      set('overviewIndustry', m.industry);
      set('overviewExchange', m.exchange || 'NSE');
      set('overviewMarketCap', m.marketCap);

      const row = window.VIKRAM_DATA_ENGINE.find(ticker);
      const metrics = row?.metrics || {};
      set('overviewCurrentPrice', metrics.close == null ? null : `₹${Number(metrics.close).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      set('overview52WeekHigh', t.high52Week == null ? null : `₹${Number(t.high52Week).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      set('overview52WeekLow', t.low52Week == null ? null : `₹${Number(t.low52Week).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      set('overviewVikramScore', m.vikramScore ?? m.accumulationScore);
      if (!m.vikramScore && m.accumulationScore != null) { const label = document.getElementById('overviewVikramScore')?.previousElementSibling; if (label) label.textContent = 'Accumulation Score'; }
      set('overviewRating', m.rating);

      set('techRSI', t.rsi); set('techRSISignal', t.rsiSignal);
      set('techMACD', t.macd); set('techMACDSignal', t.macdSignal);
      set('techADX', t.adx); set('techADXSignal', t.adxSignal);
      set('techEMA20', t.ema20); set('techEMA50', t.ema50); set('techEMA200', t.ema200);
      set('techTrend', t.trend); set('techSupport', t.support); set('techResistance', t.resistance);
      set('techVolume', t.volume); set('techVolumeSignal', t.volumeSignal);
      set('techOBV', t.obv); set('techOBVSignal', t.obvSignal);
      set('techDeliveryPct', t.deliveryPct); set('techDeliverySignal', t.deliverySignal);
      set('tech52WeekHigh', t.high52Week); set('tech52WeekLow', t.low52Week);

      const financialIds = [
        'finRevenueGrowth','finRevenueStability','finEbitdaMargin','finNetProfitMargin','finROE','finROCE',
        'finDebtEquity','finInterestCoverage','finOCF','finFCF','finEPSGrowth','finPromoterHolding',
        'finPromoterPledge','finInstitutionalTrend'
      ];
      const signalIds = financialIds.map(id => `${id}Signal`);
      [...financialIds, ...signalIds].forEach(id => set(id, 'N/A'));
      const financialCard = document.getElementById('financialDashboard');
      if (financialCard) financialCard.setAttribute('data-data-status', 'Financial statement dataset unavailable — no values substituted');
    } catch (error) {
      const err = document.getElementById('errorContainer');
      if (err) {
        err.textContent = error.message;
        err.classList.remove('hidden');
      }
    }
  };

  window.addEventListener('vikram:analyze', event => render(event.detail?.ticker));

  // NOTE (forensic fix, see docs/governance/VIKRAM_DECISION_REGISTER.md): this file used to
  // contain THREE more functions here — `setupScannerSurface()`, `setupColumnFilters()`, and
  // `renderVerifiedDataSurfaces()` — all written for an earlier version of the Accumulation
  // Scanner that rendered a `<table class="scanner-table">`. The current index.html renders
  // `<details class="discovery-card">` cards into #scannerCards instead; no `.scanner-table`
  // element exists anywhere in the page. That mismatch made all three functions partially or
  // fully inert, but two of them had real, harmful side effects that fired anyway because their
  // OWN early-return guards (checking for `.scanner-container-surface` / `.filter-controls`,
  // which DO still exist) passed even though the table they were built for did not:
  //   - `setupScannerSurface()` set `universeSelect.hidden = true` on the real `#universeFilter`
  //     dropdown, then injected a separate "All Stocks / NIFTY 50 / NIFTY 200 / NIFTY 500" pill
  //     bar that proxied into the now-hidden select. Its "Watchlist" / "My Portfolio" / "Market
  //     News" tab logic also only ever tried to show/hide rows inside the nonexistent
  //     `.scanner-table`, so those tabs silently did nothing to the real card list.
  //   - `setupColumnFilters()` then set `filterControls.style.display = 'none'` on the ENTIRE
  //     `.filter-controls` container — hiding Verdict, Score, Sort, and Search as well, even
  //     though their real logic (bound directly in index.html's inline script, further down)
  //     was correct and already working the whole time.
  // Net effect on the live site: only a redundant Universe pill bar was visible; Verdict, Score,
  // Sort, and Search were rendered but invisible, and three of the four surface tabs looked
  // clickable while doing nothing. Both functions (and the helpers used only by them —
  // normalizeSymbol, readStoredSymbols, getScannerSnapshot, getIndexMembership,
  // ensureSegmentStyles) have been removed entirely. index.html's own inline script already
  // owns #universeFilter/#verdictFilter/#scoreFilter/#sortSelect/#tableSearch directly against
  // the real #scannerCards list — nothing else in this file needs to touch them.
  //
  // The "Watchlist" / "My Portfolio" / "Market News" surface tabs are handled in index.html:
  // since no UI anywhere lets a user actually add a symbol to a watchlist or portfolio, and no
  // live news feed is connected, those three tabs are marked disabled with an explicit "Not
  // available yet" state rather than left clickable with no effect. Only "Top Opportunities"
  // (the existing, always-on card list) remains active.

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = params.get('symbol');
  if (initialSymbol) {
    await render(initialSymbol);
    document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
