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

  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot(); } catch (_) {}

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = params.get('symbol');
  if (initialSymbol) {
    await render(initialSymbol);
    document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* VIKRAM dual-theme bootstrap: Aurora and Misty only. */
(function () {
  const KEY = 'vikram-theme';
  const themes = { aurora: { icon: '☾', label: 'Aurora' }, misty: { icon: '☀', label: 'Misty' } };
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = 'css/themes.css';
  document.head.appendChild(link);

  function apply(theme) {
    if (!themes[theme]) theme = 'aurora';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'misty' ? 'light' : 'dark';
    localStorage.setItem(KEY, theme);
    document.querySelectorAll('.vikram-theme-control button').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === theme));
  }

  function build() {
    const host = document.querySelector('.header-container');
    if (!host || document.querySelector('.vikram-theme-control')) return;
    const wrap = document.createElement('div');
    wrap.className = 'vikram-theme-control';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Choose VIKRAM theme');
    Object.entries(themes).forEach(([key, item]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.theme = key;
      b.setAttribute('aria-label', `${item.label} theme`);
      b.innerHTML = `${item.icon} <span class="vikram-theme-label">${item.label}</span>`;
      b.addEventListener('click', () => apply(key));
      wrap.appendChild(b);
    });
    host.appendChild(wrap);
    apply(localStorage.getItem(KEY) || 'aurora');
  }

  apply(localStorage.getItem(KEY) || 'aurora');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
