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
CREATE TABLE IF NOT EXISTS scanner_results (
  symbol TEXT PRIMARY KEY, trade_date DATE, score INTEGER, verdict TEXT NOT NULL, metrics JSONB NOT NULL, why JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scanner_results_trade_date_idx ON scanner_results(trade_date);
CREATE TABLE IF NOT EXISTS scanner_results_periods (
  symbol TEXT NOT NULL, period TEXT NOT NULL, trade_date DATE, score INTEGER, verdict TEXT NOT NULL, metrics JSONB NOT NULL, why JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (symbol, period)
);
CREATE INDEX IF NOT EXISTS scanner_results_periods_period_idx ON scanner_results_periods(period);
CREATE TABLE IF NOT EXISTS saved_scans (
  id BIGSERIAL PRIMARY KEY, owner_key TEXT NOT NULL, name TEXT NOT NULL, rule JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_scans_owner_idx ON saved_scans(owner_key);
CREATE TABLE IF NOT EXISTS alert_preferences (
  id BIGSERIAL PRIMARY KEY, owner_key TEXT NOT NULL, scanner_id TEXT NOT NULL, email_enabled BOOLEAN NOT NULL DEFAULT false, push_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(owner_key, scanner_id)
);
CREATE TABLE IF NOT EXISTS scanner_matches_seen (
  scanner_id TEXT NOT NULL, symbol TEXT NOT NULL, trade_date DATE NOT NULL, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (scanner_id, symbol, trade_date)
);
CREATE TABLE IF NOT EXISTS alert_history (
  id BIGSERIAL PRIMARY KEY, owner_key TEXT NOT NULL, scanner_id TEXT NOT NULL, symbol TEXT NOT NULL, trade_date DATE,
  channel TEXT NOT NULL CHECK (channel IN ('email','push')), status TEXT NOT NULL CHECK (status IN ('PENDING','SENT','FAILED')) DEFAULT 'PENDING',
  error TEXT, deep_link TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_history_owner_idx ON alert_history(owner_key, created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY, owner_key TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), invalidated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_owner_idx ON push_subscriptions(owner_key);
