-- Stock narratives — AI-generated analysis for a symbol, synthesizing
-- fundamentals + news + analyst sentiment. Cached so we don't re-spend
-- LLM tokens every time the Signals page loads.
--
-- Beyond the prose narrative, the LLM also produces its OWN buy/fair/trim
-- price targets, derived from analyst consensus + news tone + company
-- trajectory — these are stored separately so the UI can show them next
-- to the quant targets from v_investment_signals. If the two methods
-- disagree sharply, that's an important signal on its own.
--
-- One row per symbol; regenerating overwrites. `inputs_hash` lets us skip
-- the LLM call when nothing material changed.

CREATE TABLE IF NOT EXISTS stock_narratives (
  symbol          text PRIMARY KEY,
  narrative       text NOT NULL,
  summary         text,                -- one-liner for the Signals card
  ai_buy_target   numeric,             -- LLM's recommended buy-below price
  ai_fair_price   numeric,             -- LLM's fair value estimate
  ai_trim_target  numeric,             -- LLM's recommended trim-above price
  ai_confidence   text,                -- 'high' | 'medium' | 'low'
  model           text NOT NULL,
  inputs_hash     text NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- If the table already exists from the earlier migration, add the new columns.
ALTER TABLE stock_narratives ADD COLUMN IF NOT EXISTS ai_buy_target  numeric;
ALTER TABLE stock_narratives ADD COLUMN IF NOT EXISTS ai_fair_price  numeric;
ALTER TABLE stock_narratives ADD COLUMN IF NOT EXISTS ai_trim_target numeric;
ALTER TABLE stock_narratives ADD COLUMN IF NOT EXISTS ai_confidence  text;

CREATE INDEX IF NOT EXISTS stock_narratives_generated_at_idx
  ON stock_narratives (generated_at DESC);

ALTER TABLE stock_narratives DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
