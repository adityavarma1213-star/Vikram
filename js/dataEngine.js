(() => {
  'use strict';
  const clean = value => String(value ?? '').trim();
  const upper = value => clean(value).toUpperCase();
  const finite = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };
  const label = (value, suffix = '') => { const n = finite(value); return n === null ? null : `${n.toFixed(2)}${suffix}`; };
  window.VIKRAM_DATA_ENGINE = {
    snapshot: null,
    async loadSnapshot() {
      if (this.snapshot) return this.snapshot;
      const response = await fetch('data/scanner.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`SNAPSHOT_HTTP_${response.status}`);
      const snapshot = await response.json();
      if (snapshot.status !== 'ok' || snapshot.dataStatus !== 'EOD VERIFIED') throw new Error('SNAPSHOT_NOT_VERIFIED');
      this.snapshot = snapshot; return snapshot;
    },
    find(symbol) { const wanted = upper(symbol); return this.snapshot?.results?.find(row => upper(row.symbol || row.ticker) === wanted) || null; },
    searchSuggestions(query) {
      const q = upper(query); if (!q || !Array.isArray(this.snapshot?.results)) return [];
      return this.snapshot.results.filter(row => upper(row.symbol).includes(q) || upper(row.companyName).includes(q)).sort((a, b) => {
        const aKey = upper(a.symbol); const bKey = upper(b.symbol); const aName = upper(a.companyName); const bName = upper(b.companyName);
        const rank = row => upper(row.symbol) === q ? -4 : upper(row.companyName) === q ? -3 : upper(row.symbol).startsWith(q) ? -2 : upper(row.companyName).startsWith(q) ? -1 : 0;
        return rank(a) - rank(b) || aKey.localeCompare(bKey) || aName.localeCompare(bName);
      }).slice(0, 12).map(row => ({ ticker: row.symbol, name: row.companyName || row.symbol, tradeDate: row.tradeDate, close: row.metrics?.close }));
    },
    analyzeAsset(symbol) {
      const row = this.find(symbol); if (!row) return null;
      const t = row.technical || {}; const m = row.metrics || {};
      return {
        meta: { name: row.companyName || row.symbol, ticker: row.symbol, exchange: 'NSE', marketCap: null, sector: null, industry: null, vikramScore: row.score, rating: row.verdict, tradeDate: row.tradeDate, dataStatus: this.status() },
        technical: {
          rsi: label(t.rsi14), rsiSignal: finite(t.rsi14) === null ? null : (t.rsi14 >= 70 ? 'Overbought' : t.rsi14 <= 30 ? 'Oversold' : 'Neutral'),
          macd: label(t.macd), macdSignal: label(t.macdSignal), adx: null, adxSignal: 'N/A — high/low fields unavailable in current NSE CM feed',
          ema20: label(t.ema20), ema50: label(t.ema50), ema200: label(t.ema200), trend: finite(t.ema20) !== null && finite(m.close) !== null ? (m.close > t.ema20 ? 'Above EMA20' : 'Below EMA20') : null,
          support: label(t.support), resistance: label(t.resistance), volume: m.volume, volumeSignal: finite(m.volumeRatio) === null ? null : `${m.volumeRatio.toFixed(2)}x vs 20-session average`,
          obv: m.obv, obvSignal: finite(m.obvTrend) === null ? null : (m.obvTrend > 0 ? 'Rising' : m.obvTrend < 0 ? 'Falling' : 'Flat'), deliveryPct: m.deliveryPct,
          deliverySignal: finite(m.deliveryPct) === null ? null : (m.deliveryPct >= 55 ? 'Strong delivery' : m.deliveryPct >= 45 ? 'Positive delivery' : 'Low delivery'), high52Week: t.high52Week, low52Week: t.low52Week, dataNote: t.dataNote
        },
        financial: null
      };
    },
    status() { return this.snapshot?.dataStatus || 'DATA N/A'; }
  };
})();