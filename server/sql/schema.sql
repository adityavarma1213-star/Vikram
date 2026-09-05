CREATE TABLE IF NOT EXISTS cm_eod (
  symbol TEXT NOT NULL, trade_date DATE NOT NULL, series TEXT, prev_close NUMERIC, open NUMERIC, high NUMERIC, low NUMERIC,
  last_price NUMERIC, close NUMERIC, avg_price NUMERIC, volume BIGINT, deliv_qty BIGINT, deliv_per NUMERIC, turnover NUMERIC, no_of_trades BIGINT,
  PRIMARY KEY(symbol, trade_date)
);
CREATE INDEX IF NOT EXISTS cm_eod_date_idx ON cm_eod(trade_date);
CREATE TABLE IF NOT EXISTS futures_eod (
  symbol TEXT NOT NULL, trade_date DATE NOT NULL, expiry DATE NOT NULL, close NUMERIC, oi BIGINT, change_oi BIGINT,
  instrument_type TEXT, contract_name TEXT, PRIMARY KEY(symbol, trade_date, expiry)
);
CREATE INDEX IF NOT EXISTS futures_eod_date_idx ON futures_eod(trade_date);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id BIGSERIAL PRIMARY KEY, segment TEXT NOT NULL, trade_date DATE, status TEXT NOT NULL, row_count INTEGER, schema_version TEXT, error TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingestion_runs_segment_date_idx ON ingestion_runs(segment, trade_date DESC);
