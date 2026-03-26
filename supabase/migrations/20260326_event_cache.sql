-- Shared calendar event metadata cache
-- When a user links a local calendar event to an entity, metadata is cached here
-- so teammates can see event details without needing the linker's local Outlook data

CREATE TABLE IF NOT EXISTS event_cache (
  id text PRIMARY KEY,                    -- same as Outlook event ID
  subject text,
  body_preview text,                      -- first ~500 chars
  start_at timestamptz,
  end_at timestamptz,
  start_timezone text,
  end_timezone text,
  is_all_day boolean DEFAULT false,
  location text,
  organizer_name text,
  organizer_email text,
  attendees jsonb DEFAULT '[]',           -- [{name, email, responseStatus, attendeeType}]
  is_online_meeting boolean DEFAULT false,
  online_meeting_url text,
  web_link text,
  cached_at timestamptz DEFAULT now(),
  cached_by uuid REFERENCES users(id)
);

ALTER TABLE event_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_cache_select" ON event_cache FOR SELECT USING (true);
CREATE POLICY "event_cache_insert" ON event_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "event_cache_update" ON event_cache FOR UPDATE USING (true);

-- Document the existing production event_entity_links schema
-- This table already exists in production; these are idempotent guards
CREATE TABLE IF NOT EXISTS event_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  match_method text,
  relevance_score float,
  subject text,
  start_at timestamptz,
  end_at timestamptz,
  organizer_name text,
  organizer_email text,
  location text,
  created_at timestamptz DEFAULT now(),

  UNIQUE(event_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_eel_event_entity ON event_entity_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_eel_event_id ON event_entity_links(event_id);

-- RLS (idempotent — drop first in case it already exists)
ALTER TABLE event_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_entity_links_all" ON event_entity_links;
CREATE POLICY "event_entity_links_all" ON event_entity_links
  FOR ALL USING (true) WITH CHECK (true);
