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
-- #8 remediation: record how many rows were rejected by validation, and why, alongside the
-- accepted row_count, so invalid/missing/malformed data is visible rather than silently absorbed.
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS invalid_count INTEGER;
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS validation_summary JSONB;
CREATE TABLE IF NOT EXISTS scanner_results (
  symbol TEXT PRIMARY KEY, trade_date DATE, score INTEGER, verdict TEXT NOT NULL, metrics JSONB NOT NULL, why JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Detection History (see server/src/detectionHistory.js), wired into the live ingest path.
ALTER TABLE scanner_results ADD COLUMN IF NOT EXISTS detection JSONB;
CREATE INDEX IF NOT EXISTS scanner_results_trade_date_idx ON scanner_results(trade_date);
CREATE TABLE IF NOT EXISTS scanner_results_periods (
  symbol TEXT NOT NULL, period TEXT NOT NULL, trade_date DATE, score INTEGER, verdict TEXT NOT NULL, metrics JSONB NOT NULL, why JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (symbol, period)
);
CREATE INDEX IF NOT EXISTS scanner_results_periods_period_idx ON scanner_results_periods(period);
-- Point-in-time universe membership (see server/src/pointInTimeUniverse.js). effective_to NULL
-- means "still a member as of the most recent recorded snapshot". Real snapshots only — never
-- backfilled/fabricated history.
CREATE TABLE IF NOT EXISTS index_universe_memberships (
  symbol TEXT NOT NULL, index_name TEXT NOT NULL, effective_from DATE NOT NULL, effective_to DATE,
  source TEXT NOT NULL, source_date DATE NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, index_name, effective_from)
);
CREATE INDEX IF NOT EXISTS index_universe_memberships_lookup_idx ON index_universe_memberships(index_name, effective_from, effective_to);

-- Security lifecycle (listing/delisting) for survivorship-bias prevention. Real records only —
-- empty by default until a real delisting/listing data source is connected (see
-- docs/hidden-gems/HIDDEN_GEMS_OPEN_DECISIONS.md §2.6).
CREATE TABLE IF NOT EXISTS security_lifecycle (
  symbol TEXT PRIMARY KEY, listed_date DATE, delisted_date DATE, delisting_reason TEXT,
  source TEXT, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Corporate actions for price adjustment (see server/src/corporateActions.js). Real records
-- only — empty by default until a real corporate-action feed is connected.
CREATE TABLE IF NOT EXISTS corporate_actions (
  id BIGSERIAL PRIMARY KEY, symbol TEXT NOT NULL, ex_date DATE NOT NULL, action_type TEXT NOT NULL,
  ratio_from NUMERIC, ratio_to NUMERIC, source TEXT, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS corporate_actions_symbol_idx ON corporate_actions(symbol, ex_date);

-- Historical verdict store (see server/src/historicalVerdictStore.js). Append-only: a
-- (symbol, trade_date, engine_version, config_version) tuple, once written, is never updated.
CREATE TABLE IF NOT EXISTS historical_verdicts (
  id BIGSERIAL PRIMARY KEY, symbol TEXT NOT NULL, trade_date DATE NOT NULL,
  engine_version TEXT NOT NULL, config_version TEXT NOT NULL, verdict TEXT NOT NULL,
  score NUMERIC, components JSONB, detection JSONB, data_confidence TEXT, universe_context JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, trade_date, engine_version, config_version)
);
CREATE INDEX IF NOT EXISTS historical_verdicts_symbol_date_idx ON historical_verdicts(symbol, trade_date);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- #10 follow-up: bumped by POST /api/auth/logout so previously issued tokens for this user
-- (which embed the token_version they were signed with) stop verifying immediately, without
-- needing a separate revocation-list table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
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
