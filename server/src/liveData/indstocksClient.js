'use strict';
const { TokenManager } = require('./tokenManager');
const { normalizedQuote, STATUS } = require('./types');
const { statusForAvailability } = require('./marketHours');
const { InstrumentMapping } = require('./instrumentMapping');

function first(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return null;
}

class IndstocksClient {
  constructor({ fetchImpl = global.fetch, tokenManager, instrumentMapping } = {}) {
    this.fetch = fetchImpl;
    this.tokens = tokenManager || new TokenManager({ fetchImpl });
    this.mapping = instrumentMapping || new InstrumentMapping({ fetchImpl });
    this.base = process.env.INDSTOCKS_API_BASE || 'https://api.indstocks.com';
  }

  resolveCode(symbol) {
    const resolved = this.mapping.resolve(symbol);
    if (!resolved) throw new Error(`INDSTOCKS_INSTRUMENT_NOT_MAPPED_${String(symbol).toUpperCase()}`);
    return `NSE_${resolved.instrumentToken}`;
  }

  async quote(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) return [];
    const token = await this.tokens.getToken();
    const codes = symbols.map((s) => this.resolveCode(s)).join(',');
    const url = `${this.base}/market/quotes/full?scrip-codes=${encodeURIComponent(codes)}`;
    const r = await this.fetch(url, { headers: { Authorization: token } });
    if (r.status === 401 || r.status === 403) {
      this.tokens.clear();
      throw new Error(`INDSTOCKS_AUTH_HTTP_${r.status}`);
    }
    if (!r.ok) throw new Error(`INDSTOCKS_QUOTE_HTTP_${r.status}`);
    const j = await r.json();
    const raw = j?.quotes?.data || j?.data || j?.quotes || (Array.isArray(j) ? j : []);
    const entries = Array.isArray(raw) ? raw.map((x) => [x?.symbol || x?.tradingSymbol, x]) : Object.entries(raw || {});
    const now = new Date();

    return entries.map(([key, x]) => {
      const symbol = first(x, ['symbol', 'tradingSymbol', 'TRADING_SYMBOL']) || String(key).replace(/^NSE[_:]/, '');
      const q = normalizedQuote({
        symbol,
        exchange: 'NSE',
        instrumentToken: first(x, ['securityId', 'SECURITY_ID', 'token']),
        ltp: first(x, ['live_price', 'ltp', 'LTP']),
        previousClose: first(x, ['previous_close', 'previousClose', 'close']),
        dayChange: first(x, ['day_change', 'change', 'dayChange']),
        dayChangePercent: first(x, ['day_change_percentage', 'changePercent', 'dayChangePercent']),
        dayOpen: first(x, ['open', 'day_open']),
        dayHigh: first(x, ['high', 'day_high']),
        dayLow: first(x, ['low', 'day_low']),
        volume: first(x, ['volume', 'total_volume']),
        timestamp: first(x, ['timestamp', 'exchange_timestamp']) || now.toISOString(),
        source: 'INDSTOCKS_REST',
        marketStatus: STATUS.LIVE
      });
      q.marketStatus = statusForAvailability(q, now);
      return q;
    });
  }
}

module.exports = { IndstocksClient };
