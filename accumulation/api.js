(function (root) {
  const API_BASE = (root.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const isStaticPages = !API_BASE && /github\.io$/i.test(root.location.hostname);
  let snapshotPromise;

  // Keep the explanation column readable while the wide metrics table scrolls.
  // The Why column stays pinned to the right edge instead of being squeezed off-screen.
  const whyLayoutStyle = document.createElement('style');
  whyLayoutStyle.id = 'vikram-why-layout-fix';
  whyLayoutStyle.textContent = `
    .metric-table th:nth-child(11),
    .metric-table td:nth-child(11) {
      position: sticky !important;
      right: 0 !important;
      width: 420px !important;
      min-width: 420px !important;
      max-width: 420px !important;
      white-space: normal !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
    }
    .metric-table thead th:nth-child(11) {
      z-index: 120 !important;
      background: #182038 !important;
      background-color: #182038 !important;
      box-shadow: -8px 0 14px rgba(0,0,0,.28), 0 2px 0 var(--border-color), 0 7px 14px rgba(0,0,0,.35) !important;
    }
    .metric-table tbody td:nth-child(11) {
      z-index: 20 !important;
      background: var(--bg-secondary) !important;
      background-color: var(--bg-secondary) !important;
      vertical-align: top !important;
      line-height: 1.5 !important;
      padding: 14px 18px !important;
      box-shadow: -8px 0 14px rgba(0,0,0,.18) !important;
    }
    .metric-table tbody td:nth-child(11) .why-cell {
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    @media (max-width: 800px) {
      .metric-table th:nth-child(11),
      .metric-table td:nth-child(11) {
        width: 340px !important;
        min-width: 340px !important;
        max-width: 340px !important;
      }
    }
  `;
  document.head.appendChild(whyLayoutStyle);

  async function request(path, options) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' }, ...options });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `API request failed (${res.status})`);
    return body;
  }

  async function snapshot() {
    if (!snapshotPromise) {
      snapshotPromise = fetch('data/scanner.json', { headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then(res => { if (!res.ok) throw new Error(`Static scanner data unavailable (${res.status})`); return res.json(); });
    }
    return snapshotPromise;
  }

  function periodResults(data, period) {
    return period && data.periods?.[period] ? data.periods[period] : (data.results || []);
  }

  function staticScan(symbols, period = '1D') {
    return snapshot().then(data => ({
      ...data,
      selectedPeriod: period,
      results: periodResults(data, period).filter(r => symbols.includes(String(r.symbol).toUpperCase()))
    }));
  }

  function staticAll(period = '1D') {
    return snapshot().then(data => ({ ...data, selectedPeriod: period, results: periodResults(data, period) }));
  }

  function staticStock(symbol, period = '1D') {
    return snapshot().then(data => {
      const result = periodResults(data, period).find(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
      if (!result) throw new Error(`No scanner data for ${symbol} in ${period}`);
      return { result, asOf: data.asOf, generatedAt: data.generatedAt, selectedPeriod: period };
    });
  }

  root.ACCUMULATION_API = {
    health: () => isStaticPages
      ? snapshot().then(data => ({ status: data.status === 'ok' ? 'ok' : 'pending', lastCmDate: data.asOf, historyDays: data.historyDays }))
      : request('/api/health'),
    scan: (symbols, period = '1D') => isStaticPages
      ? staticScan(symbols.map(s => s.toUpperCase()), period)
      : request(`/api/scanner/scan?symbols=${encodeURIComponent(symbols.join(','))}&period=${encodeURIComponent(period)}`),
    all: (period = '1D') => isStaticPages ? staticAll(period) : request(`/api/scanner/all?period=${encodeURIComponent(period)}`),
    stock: (symbol, period = '1D') => isStaticPages ? staticStock(symbol, period) : request(`/api/stock/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}`),
    watchlist: (period = '1D') => isStaticPages ? staticScan(['ONGC', 'VBL', 'BSE', 'NMDC'], period) : request(`/api/scanner/watchlist?period=${encodeURIComponent(period)}`)
  };
})(window);

/* Score ordering enhancement. Runs independently of the scanner's filtering code. */
(() => {
  let direction = null;
  let observer = null;
  let sorting = false;

  function getScore(row) {
    const cell = row?.children?.[4];
    if (!cell) return NaN;
    const value = Number(String(cell.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(value) ? value : NaN;
  }

  function sortRows() {
    const tbody = document.getElementById('results');
    if (!tbody || !direction || sorting) return;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.children.length === 11);
    if (rows.length < 2) return;
    sorting = true;
    observer?.disconnect();
    rows.sort((a, b) => {
      const av = getScore(a), bv = getScore(b);
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return direction === 'asc' ? av - bv : bv - av;
    });
    const fragment = document.createDocumentFragment();
    rows.forEach(row => fragment.appendChild(row));
    tbody.appendChild(fragment);
    sorting = false;
    observer?.observe(tbody, { childList: true });
  }

  function setDirection(next) {
    direction = next;
    document.querySelectorAll('.score-sort-controls button').forEach(button => {
      button.classList.toggle('active', button.dataset.sort === direction);
      button.setAttribute('aria-pressed', button.dataset.sort === direction ? 'true' : 'false');
    });
    sortRows();
  }

  function install() {
    const tbody = document.getElementById('results');
    const scoreTrigger = document.querySelector('.filter-trigger[data-key="score"]');
    if (!tbody || !scoreTrigger || document.querySelector('.score-sort-controls')) return;

    const controls = document.createElement('span');
    controls.className = 'score-sort-controls';
    controls.setAttribute('aria-label', 'Score sort order');
    controls.innerHTML = '<button type="button" data-sort="asc" aria-label="Sort Score ascending" title="Score: lowest to highest">↑</button><button type="button" data-sort="desc" aria-label="Sort Score descending" title="Score: highest to lowest">↓</button>';
    scoreTrigger.insertAdjacentElement('afterend', controls);
    controls.querySelector('[data-sort="asc"]').addEventListener('click', () => setDirection('asc'));
    controls.querySelector('[data-sort="desc"]').addEventListener('click', () => setDirection('desc'));

    observer = new MutationObserver(() => sortRows());
    observer.observe(tbody, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();