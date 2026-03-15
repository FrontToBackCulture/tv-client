-- Add series support to feed_cards
-- A series groups related cards: 1 showcase (series_order=0) + N detail cards

ALTER TABLE feed_cards ADD COLUMN IF NOT EXISTS series_id text;
ALTER TABLE feed_cards ADD COLUMN IF NOT EXISTS series_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_feed_cards_series_id ON feed_cards (series_id) WHERE series_id IS NOT NULL;
