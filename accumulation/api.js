(function (root) {
  const API_BASE = (root.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const isStaticPages = !API_BASE && /github\.io$/i.test(root.location.hostname);
  let snapshotPromise;

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

  function staticScan(symbols) {
    return snapshot().then(data => ({
      ...data,
      results: (data.results || []).filter(r => symbols.includes(String(r.symbol).toUpperCase()))
    }));
  }

  function staticStock(symbol) {
    return snapshot().then(data => {
      const result = (data.results || []).find(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
      if (!result) throw new Error(`No scanner data for ${symbol}`);
      return { result, asOf: data.asOf, generatedAt: data.generatedAt };
    });
  }

  root.ACCUMULATION_API = {
    health: () => isStaticPages
      ? snapshot().then(data => ({ status: data.status === 'ok' ? 'ok' : 'pending', lastCmDate: data.asOf, historyDays: data.historyDays }))
      : request('/api/health'),
    scan: symbols => isStaticPages ? staticScan(symbols.map(s => s.toUpperCase())) : request(`/api/scanner/scan?symbols=${encodeURIComponent(symbols.join(','))}`),
    all: () => isStaticPages ? snapshot() : request('/api/scanner/all'),
    stock: symbol => isStaticPages ? staticStock(symbol) : request(`/api/stock/${encodeURIComponent(symbol)}`),
    watchlist: () => isStaticPages ? staticScan(['ONGC', 'VBL', 'BSE', 'NMDC']) : request('/api/scanner/watchlist')
  };
})(window);
