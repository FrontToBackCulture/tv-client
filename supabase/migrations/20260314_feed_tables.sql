-- Feed Cards & Interactions
-- Home feed for surfacing knowledge as bite-sized cards

-- ============================================================================
-- feed_cards
-- ============================================================================

CREATE TABLE IF NOT EXISTS feed_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_type text NOT NULL CHECK (card_type IN ('feature', 'tip', 'team', 'skill', 'platform', 'release', 'module', 'app_tip')),
  category text NOT NULL CHECK (category IN ('event', 'knowledge')),
  badge text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  source text NOT NULL,
  source_detail text,
  triggers text[],
  chips text[],
  stats jsonb,
  features text[],
  author jsonb,
  cta_label text,
  cta_action text,
  scheduled_date date,
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_by text,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feed_cards_card_type ON feed_cards (card_type);
CREATE INDEX IF NOT EXISTS idx_feed_cards_category ON feed_cards (category);
CREATE INDEX IF NOT EXISTS idx_feed_cards_scheduled_date ON feed_cards (scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_cards_created_at ON feed_cards (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_cards_source_ref ON feed_cards (source_ref) WHERE source_ref IS NOT NULL;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE feed_cards;

-- ============================================================================
-- feed_interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS feed_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES feed_cards(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  seen boolean NOT NULL DEFAULT false,
  liked boolean NOT NULL DEFAULT false,
  saved boolean NOT NULL DEFAULT false,
  seen_at timestamptz,
  liked_at timestamptz,
  saved_at timestamptz,
  UNIQUE (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_interactions_user ON feed_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_feed_interactions_card ON feed_interactions (card_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE feed_interactions;
