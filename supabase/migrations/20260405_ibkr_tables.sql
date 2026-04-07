-- Interactive Brokers Flex Web Service sync targets.
--
-- These tables are only populated in workspaces that enable the IBKR Flex
-- connector (currently only the Melly personal workspace). Other workspaces
-- will have empty tables — harmless, zero cost.
--
-- All tables keep a `raw jsonb` column containing the full parsed Flex row so
-- we can add columns later without re-syncing historical data.

-- Daily snapshot of open positions. Primary key is (snapshot_date, account_id,
-- symbol, conid) so re-running a day's sync is idempotent.
CREATE TABLE IF NOT EXISTS ibkr_positions (
  snapshot_date    date        NOT NULL,
  account_id       text        NOT NULL,
  conid            text        NOT NULL,  -- IBKR contract id
  symbol           text        NOT NULL,
  asset_class      text,
  description      text,
  currency         text,
  quantity         numeric,
  mark_price       numeric,
  position_value   numeric,    -- market value in position currency
  cost_basis       numeric,
  unrealized_pnl   numeric,
  realized_pnl     numeric,
  fx_rate_to_base  numeric,
  raw              jsonb       NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, account_id, conid)
);

CREATE INDEX IF NOT EXISTS idx_ibkr_positions_symbol ON ibkr_positions (symbol);
CREATE INDEX IF NOT EXISTS idx_ibkr_positions_account_date ON ibkr_positions (account_id, snapshot_date DESC);

-- Executed trades. Append-only. `trade_id` is IBKR's tradeID which is unique.
CREATE TABLE IF NOT EXISTS ibkr_trades (
  trade_id         text        PRIMARY KEY,
  trade_date       date        NOT NULL,
  settle_date      date,
  account_id       text        NOT NULL,
  conid            text,
  symbol           text        NOT NULL,
  asset_class      text,
  description      text,
  currency         text,
  side             text,       -- BUY / SELL
  quantity         numeric,
  price            numeric,
  proceeds         numeric,
  commission       numeric,
  net_cash         numeric,
  fx_rate_to_base  numeric,
  order_time       timestamptz,
  raw              jsonb       NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ibkr_trades_date ON ibkr_trades (trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_ibkr_trades_symbol ON ibkr_trades (symbol);
CREATE INDEX IF NOT EXISTS idx_ibkr_trades_account ON ibkr_trades (account_id, trade_date DESC);

-- Cash activity: dividends, interest, fees, deposits, withdrawals, PIL,
-- withholding tax. Dividends surface here with type = 'Dividends'.
CREATE TABLE IF NOT EXISTS ibkr_cash_transactions (
  transaction_id   text        PRIMARY KEY,   -- IBKR transactionID
  settle_date      date        NOT NULL,
  report_date      date,
  account_id       text        NOT NULL,
  currency         text        NOT NULL,
  type             text        NOT NULL,      -- Dividends, Withholding Tax, Broker Interest Received, etc.
  symbol           text,
  conid            text,
  description      text,
  amount           numeric     NOT NULL,
  fx_rate_to_base  numeric,
  raw              jsonb       NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ibkr_cash_tx_date ON ibkr_cash_transactions (settle_date DESC);
CREATE INDEX IF NOT EXISTS idx_ibkr_cash_tx_type ON ibkr_cash_transactions (type);
CREATE INDEX IF NOT EXISTS idx_ibkr_cash_tx_account ON ibkr_cash_transactions (account_id, settle_date DESC);

-- Daily NAV history in base currency. One row per (as_of_date, account_id).
CREATE TABLE IF NOT EXISTS ibkr_nav_history (
  as_of_date       date        NOT NULL,
  account_id       text        NOT NULL,
  base_currency    text        NOT NULL,
  nav_base         numeric     NOT NULL,      -- Total NAV in base currency
  cash_base        numeric,
  stock_base       numeric,
  options_base     numeric,
  other_base       numeric,
  raw              jsonb       NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (as_of_date, account_id)
);

CREATE INDEX IF NOT EXISTS idx_ibkr_nav_account ON ibkr_nav_history (account_id, as_of_date DESC);

-- Convenience view for dividends only (commonly queried slice of cash tx).
CREATE OR REPLACE VIEW ibkr_dividends AS
  SELECT
    transaction_id,
    settle_date,
    account_id,
    currency,
    symbol,
    description,
    amount,
    fx_rate_to_base,
    raw
  FROM ibkr_cash_transactions
  WHERE type IN ('Dividends', 'Payment In Lieu Of Dividends');
