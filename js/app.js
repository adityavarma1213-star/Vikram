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
      set('overviewVikramScore', m.vikramScore);
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

  const normalizeSymbol = value => String(value || '').trim().toUpperCase().replace(/\.(NS|NSE)$/i, '');

  const readStoredSymbols = key => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map(item => normalizeSymbol(typeof item === 'string' ? item : item?.symbol || item?.ticker)).filter(Boolean));
    } catch (_) {
      return new Set();
    }
  };

  const getScannerSnapshot = async () => {
    try {
      const response = await fetch('data/scanner.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const snapshot = await response.json();
      return snapshot?.dataStatus === 'EOD VERIFIED' && Array.isArray(snapshot.results) ? snapshot : null;
    } catch (_) {
      return null;
    }
  };

  const getIndexMembership = item => {
    const raw = item?.indices ?? item?.indexMembership ?? item?.indexMemberships ?? {};
    if (Array.isArray(raw)) return new Set(raw.map(value => String(value).toUpperCase().replace(/^NIFTY\s*/,'NIFTY ')));
    if (raw && typeof raw === 'object') {
      return new Set(Object.entries(raw).filter(([, value]) => Boolean(value)).map(([key]) => String(key).toUpperCase().replace(/_/g, ' ')));
    }
    return new Set();
  };

  const ensureSegmentStyles = () => {
    if (document.getElementById('vikramSegmentFilterStyles')) return;
    const style = document.createElement('style');
    style.id = 'vikramSegmentFilterStyles';
    style.textContent = '.vikram-segment-filters{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:0}.vikram-segment-pill{border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-muted);border-radius:9px;padding:8px 12px;font-size:10px;font-weight:900;cursor:pointer;height:34px;white-space:nowrap}.vikram-segment-pill:hover,.vikram-segment-pill.active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--bg-card)}.vikram-market-news{padding:22px;border:1px dashed var(--border-subtle);border-radius:12px;color:var(--text-muted);line-height:1.6;font-size:11px}.vikram-tab-hidden{display:none!important}';
    document.head.appendChild(style);
  };

  const setupScannerSurface = async () => {
    const surface = document.querySelector('.scanner-container-surface');
    if (!surface) return;
    ensureSegmentStyles();

    const filterControls = surface.querySelector('.filter-controls');
    if (!filterControls) return;

    const universeSelect = filterControls.querySelector('#universeFilter');
    if (universeSelect) {
      universeSelect.hidden = true;
      universeSelect.setAttribute('aria-hidden', 'true');
      universeSelect.tabIndex = -1;
    }

    let segmentBar = surface.querySelector('.vikram-segment-filters');
    if (!segmentBar) {
      segmentBar = document.createElement('div');
      segmentBar.className = 'vikram-segment-filters';
      segmentBar.setAttribute('role', 'tablist');
      segmentBar.setAttribute('aria-label', 'Index universe');
      [['ALL','All Stocks'],['NIFTY 50','NIFTY 50'],['NIFTY 200','NIFTY 200'],['NIFTY 500','NIFTY 500']].forEach(([value,label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `vikram-segment-pill${value === 'ALL' ? ' active' : ''}`;
        button.dataset.segment = value;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', value === 'ALL' ? 'true' : 'false');
        button.textContent = label;
        segmentBar.appendChild(button);
      });
      filterControls.insertBefore(segmentBar, filterControls.firstChild);
    }

    let snapshot = await getScannerSnapshot();

    const newsId = 'vikramMarketNewsSurface';
    let newsSurface = document.getElementById(newsId);
    if (!newsSurface) {
      newsSurface = document.createElement('div');
      newsSurface.id = newsId;
      newsSurface.className = 'vikram-market-news vikram-tab-hidden';
      newsSurface.textContent = 'Market News is contextual only. No live news provider is configured in this static EOD build, so no news values are fabricated.';
      const tableWrap = surface.querySelector('.scanner-table-wrap');
      tableWrap?.parentNode.insertBefore(newsSurface, tableWrap);
    }

    let activeSegment = 'ALL';
    let activeTab = 'Top Opportunities';

    const applyFilters = () => {
      const watchlist = readStoredSymbols('vikram_watchlist');
      const portfolio = readStoredSymbols('vikram_portfolio');
      const resultMap = new Map((snapshot?.results || []).map(item => [normalizeSymbol(item.symbol || item.ticker || item.stock), item]));
      const segmentMap = new Map();
      (snapshot?.results || []).forEach(item => segmentMap.set(normalizeSymbol(item.symbol || item.ticker || item.stock), getIndexMembership(item)));

      surface.querySelectorAll('.scanner-table tbody tr').forEach(row => {
        const symbol = normalizeSymbol(row.dataset.symbol || row.querySelector('td')?.textContent);
        const item = resultMap.get(symbol);
        const memberships = segmentMap.get(symbol) || new Set();
        let visible = true;
        if (activeSegment !== 'ALL') visible = memberships.has(activeSegment);
        if (visible && activeTab === 'Watchlist') visible = watchlist.has(symbol);
        if (visible && activeTab === 'My Portfolio') visible = portfolio.has(symbol);
        if (visible && activeTab === 'Top Opportunities') {
          const verdict = String(item?.verdict || '').toUpperCase();
          const score = Number(item?.score);
          visible = verdict.includes('CONFIRMED') || (Number.isFinite(score) && score >= 75);
        }
        row.classList.toggle('vikram-tab-hidden', !visible);
      });

      const tableWrap = surface.querySelector('.scanner-table-wrap');
      const showNews = activeTab === 'Market News';
      tableWrap?.classList.toggle('vikram-tab-hidden', showNews);
      newsSurface.classList.toggle('vikram-tab-hidden', !showNews);
    };

    segmentBar.addEventListener('click', event => {
      const button = event.target.closest('.vikram-segment-pill');
      if (!button) return;
      activeSegment = button.dataset.segment || 'ALL';
      segmentBar.querySelectorAll('.vikram-segment-pill').forEach(pill => {
        const active = pill === button;
        pill.classList.toggle('active', active);
        pill.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (universeSelect) {
        universeSelect.value = activeSegment;
        universeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      applyFilters();
    });

    surface.querySelectorAll('.surface-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.textContent.trim();
        surface.querySelectorAll('.surface-tab').forEach(other => other.classList.toggle('active', other === tab));
        applyFilters();
      });
    });

    surface.querySelectorAll('.filter-controls select').forEach(select => select.addEventListener('change', () => setTimeout(applyFilters, 0)));
    window.addEventListener('storage', event => {
      if (event.key === 'vikram_watchlist' || event.key === 'vikram_portfolio') applyFilters();
    });
    new MutationObserver(() => applyFilters()).observe(surface.querySelector('.scanner-table-wrap') || surface, { childList: true, subtree: true });
    setInterval(async () => {
      const next = await getScannerSnapshot();
      if (next) { snapshot = next; applyFilters(); }
    }, 60000);
    applyFilters();
  };

  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot(); } catch (_) {}
  await setupScannerSurface();

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = params.get('symbol');
  if (initialSymbol) {
    await render(initialSymbol);
    document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
