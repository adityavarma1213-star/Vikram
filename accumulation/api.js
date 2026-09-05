(function (root) {
  const API_BASE = (root.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  async function request(path, options) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' }, ...options });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `API request failed (${res.status})`);
    return body;
  }
  root.ACCUMULATION_API = {
    health: () => request('/api/health'),
    scan: symbols => request(`/api/scanner/scan?symbols=${encodeURIComponent(symbols.join(','))}`),
    all: () => request('/api/scanner/all'),
    stock: symbol => request(`/api/stock/${encodeURIComponent(symbol)}`),
    watchlist: () => request('/api/scanner/watchlist')
  };
})(window);
