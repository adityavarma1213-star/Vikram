export type LiveMarketStatus = 'LIVE' | 'LIVE_STALE' | 'EOD_VERIFIED' | 'LIVE_DATA_UNAVAILABLE' | 'MARKET_CLOSED';

export interface MarketPriceRecord {
  symbol: string;
  exchange: 'NSE';
  instrumentToken: string;
  ltp: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  timestamp: string | null;
  source: 'INDSTOCKS_LIVE' | 'VIKRAM_EOD_FALLBACK';
  status: LiveMarketStatus;
}
