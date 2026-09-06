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
    style.textContent = '.vikram-segment-filters{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:0 0 13px}.vikram-segment-pill{border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-muted);border-radius:9px;padding:8px 12px;font-size:10px;font-weight:900;cursor:pointer;height:34px;white-space:nowrap}.vikram-segment-pill:hover,.vikram-segment-pill.active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--bg-card)}.vikram-market-news{padding:22px;border:1px dashed var(--border-subtle);border-radius:12px;color:var(--text-muted);line-height:1.6;font-size:11px}.vikram-tab-hidden{display:none!important}.vikram-column-hidden{display:none!important}.vikram-column-filter{margin-left:6px;border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px;font-weight:900;padding:2px 4px;border-radius:5px}.vikram-column-filter:hover,.vikram-column-filter.active{background:var(--bg-card);color:var(--accent-cyan)}.vikram-column-menu{position:fixed;z-index:10000;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:11px;box-shadow:var(--shadow-lg);padding:10px;min-width:220px;color:var(--text-main)}.vikram-column-menu .menu-title{font-size:10px;font-weight:900;color:var(--text-main);margin-bottom:8px}.vikram-column-menu input,.vikram-column-menu select{width:100%;box-sizing:border-box;border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-main);border-radius:7px;padding:7px 8px;font-size:11px;margin-bottom:7px}.vikram-column-menu .range{display:grid;grid-template-columns:1fr 1fr;gap:7px}.vikram-column-menu button{width:100%;border:1px solid transparent;background:transparent;color:var(--text-main);text-align:left;border-radius:7px;padding:7px 8px;font-size:11px;cursor:pointer}.vikram-column-menu button:hover,.vikram-column-menu button.active{background:var(--bg-card-2);color:var(--accent-cyan)}.vikram-column-menu .menu-actions{display:flex;gap:6px;margin-top:3px}.vikram-column-menu .menu-actions button{border-color:var(--border-subtle);text-align:center}.vikram-column-menu .menu-actions .primary{background:var(--accent-cyan);color:var(--bg-page);border-color:var(--accent-cyan);font-weight:900}.vikram-filter-reset{margin-left:auto;border:1px solid var(--border-subtle);background:transparent;color:var(--text-muted);border-radius:9px;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer}.vikram-filter-reset:hover{color:var(--accent-cyan);border-color:var(--accent-cyan)}';
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
        const symbol = normalizeSymbol(row.querySelector('td div')?.textContent || row.dataset.symbol || row.querySelector('td')?.textContent);
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

  const setupColumnFilters = async () => {
    const surface = document.querySelector('.scanner-container-surface');
    if (!surface) return;
    const filterControls = surface.querySelector('.filter-controls');
    const segmentBar = surface.querySelector('.vikram-segment-filters');
    if (!filterControls || !segmentBar) return;

    if (segmentBar.parentElement === filterControls) filterControls.parentNode.insertBefore(segmentBar, filterControls);
    filterControls.style.display = 'none';

    const headerConfig = [
      ['Stock','stock','text'],['Price','price','number'],['Change','priceChangePct','number'],['Score','score','number'],['Volume','volumeRatio','number'],['Delivery','deliveryPct','number'],['OBV Trend','obvTrend','trend'],['Futures OI','changeOi','number'],['Verdict','verdict','verdict']
    ];
    const headers = [...surface.querySelectorAll('.scanner-table thead th')].slice(0, headerConfig.length);
    headers.forEach((th, index) => {
      const [label, key, type] = headerConfig[index];
      th.dataset.filterKey = key;
      if (th.querySelector('.vikram-column-filter')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vikram-column-filter';
      button.dataset.filterKey = key;
      button.title = `Filter ${label}`;
      button.setAttribute('aria-label', `Filter ${label}`);
      button.textContent = '⌄';
      th.appendChild(button);
      button.addEventListener('click', event => { event.stopPropagation(); openColumnMenu(button, label, key, type); });
    });

    let snapshot = await getScannerSnapshot();
    const state = {};

    const getSymbol = row => normalizeSymbol(row.querySelector('td div')?.textContent || row.dataset.symbol || row.querySelector('td')?.textContent);
    const valueFor = (item, key) => {
      if (!item) return null;
      if (key === 'price') return Number(item.metrics?.close);
      if (key === 'priceChangePct') return Number(item.metrics?.priceChangePct);
      if (key === 'score') return Number(item.score);
      if (key === 'volumeRatio') return Number(item.metrics?.volumeRatio);
      if (key === 'deliveryPct') return Number(item.metrics?.deliveryPct);
      if (key === 'obvTrend') return Number(item.metrics?.obvTrend);
      if (key === 'changeOi') return Number(item.metrics?.changeOi);
      if (key === 'verdict') return String(item.verdict || '');
      return null;
    };

    const activeState = () => Object.values(state).some(v => v && (v.value || v.min || v.max || v.sort));

    const applyColumnFilters = () => {
      const resultMap = new Map((snapshot?.results || []).map(item => [normalizeSymbol(item.symbol || item.ticker || item.stock), item]));
      surface.querySelectorAll('.scanner-table tbody tr').forEach(row => {
        const symbol = getSymbol(row);
        const item = resultMap.get(symbol);
        let visible = true;
        for (const [key, filter] of Object.entries(state)) {
          if (!filter || (!filter.value && !filter.min && !filter.max && !filter.sort)) continue;
          const raw = valueFor(item, key);
          if (filter.value && key === 'stock' && !symbol.includes(String(filter.value).toUpperCase())) visible = false;
          else if (filter.value && key === 'verdict' && String(raw).toUpperCase() !== String(filter.value).toUpperCase()) visible = false;
          else if (filter.value && key === 'obvTrend') {
            const n = Number(raw);
            const trend = !Number.isFinite(n) ? 'N/A' : n > 0 ? 'Rising' : n < 0 ? 'Falling' : 'Flat';
            if (trend !== filter.value) visible = false;
          } else if (filter.min && (!Number.isFinite(raw) || Number(raw) < Number(filter.min))) visible = false;
          else if (filter.max && (!Number.isFinite(raw) || Number(raw) > Number(filter.max))) visible = false;
        }
        row.classList.toggle('vikram-column-hidden', !visible);
      });
      surface.querySelectorAll('.vikram-column-filter').forEach(button => button.classList.toggle('active', Boolean(state[button.dataset.filterKey] && Object.values(state[button.dataset.filterKey]).some(Boolean))));
    };

    const closeMenu = () => document.querySelector('.vikram-column-menu')?.remove();
    const makeMenu = (button, label, key, type) => {
      closeMenu();
      const menu = document.createElement('div');
      menu.className = 'vikram-column-menu';
      const current = state[key] || {};
      let content = `<div class="menu-title">Filter ${label}</div>`;
      if (type === 'text') {
        content += `<input id="vikramFilterInput" type="text" placeholder="Search ${label}" value="${String(current.value || '').replace(/\"/g,'&quot;')}"><div class="menu-actions"><button type="button" data-clear>Clear</button><button type="button" class="primary" data-apply>Apply</button></div>`;
      } else if (type === 'verdict') {
        const options = ['','ACCUMULATION CONFIRMED','ACCUMULATION STARTING','QUIET ABSORPTION','DISTRIBUTION','UNCONFIRMED / MIXED'];
        content += `<select id="vikramFilterSelect">${options.map(value => `<option value="${value}" ${String(current.value || '') === value ? 'selected' : ''}>${value || 'All Verdicts'}</option>`).join('')}</select><div class="menu-actions"><button type="button" data-clear>Clear</button><button type="button" class="primary" data-apply>Apply</button></div>`;
      } else if (type === 'trend') {
        const options = ['','Rising','Flat','Falling','N/A'];
        content += `<select id="vikramFilterSelect">${options.map(value => `<option value="${value}" ${String(current.value || '') === value ? 'selected' : ''}>${value || 'Any Trend'}</option>`).join('')}</select><div class="menu-actions"><button type="button" data-clear>Clear</button><button type="button" class="primary" data-apply>Apply</button></div>`;
      } else {
        content += `<div class="range"><input id="vikramMin" type="number" step="any" placeholder="Min" value="${current.min || ''}"><input id="vikramMax" type="number" step="any" placeholder="Max" value="${current.max || ''}"></div><div class="menu-actions"><button type="button" data-clear>Clear</button><button type="button" class="primary" data-apply>Apply</button></div>`;
      }
      menu.innerHTML = content;
      document.body.appendChild(menu);
      const rect = button.getBoundingClientRect();
      menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 10))}px`;
      menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, rect.bottom + 6)}px`;
      menu.querySelector('[data-clear]')?.addEventListener('click', () => { delete state[key]; closeMenu(); applyColumnFilters(); });
      menu.querySelector('[data-apply]')?.addEventListener('click', () => {
        if (type === 'text' || type === 'verdict' || type === 'trend') {
          const value = menu.querySelector('input,select')?.value || '';
          if (value) state[key] = { value }; else delete state[key];
        } else {
          const min = menu.querySelector('#vikramMin')?.value || '';
          const max = menu.querySelector('#vikramMax')?.value || '';
          if (min || max) state[key] = { min, max }; else delete state[key];
        }
        closeMenu();
        applyColumnFilters();
      });
      menu.querySelector('input')?.focus();
    };
    const openColumnMenu = (button, label, key, type) => makeMenu(button, label, key, type);
    document.addEventListener('click', event => { if (!event.target.closest('.vikram-column-menu') && !event.target.closest('.vikram-column-filter')) closeMenu(); });
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    let reset = surface.querySelector('.vikram-filter-reset');
    if (!reset) {
      reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'vikram-filter-reset';
      reset.textContent = 'Reset Filters';
      segmentBar.appendChild(reset);
      reset.addEventListener('click', () => { Object.keys(state).forEach(key => delete state[key]); closeMenu(); applyColumnFilters(); });
    }
    new MutationObserver(() => setTimeout(applyColumnFilters, 0)).observe(surface.querySelector('.scanner-table-wrap') || surface, { childList: true, subtree: true });
    setInterval(async () => { const next = await getScannerSnapshot(); if (next) { snapshot = next; applyColumnFilters(); } }, 60000);
    applyColumnFilters();
  };

  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot(); } catch (_) {}
  await setupScannerSurface();
  await setupColumnFilters();

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = params.get('symbol');
  if (initialSymbol) {
    await render(initialSymbol);
    document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
