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
