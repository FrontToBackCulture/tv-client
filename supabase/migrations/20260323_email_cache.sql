-- Shared email metadata cache
-- When a user links a local email to an entity, metadata is cached here
-- so teammates can see email details without needing the sender's local Outlook data

CREATE TABLE IF NOT EXISTS email_cache (
  id text PRIMARY KEY,                -- same as outlook email ID
  subject text,
  from_email text NOT NULL,
  from_name text,
  received_at timestamptz,
  body_preview text,                  -- first ~500 chars of body
  cached_at timestamptz DEFAULT now(),
  cached_by uuid REFERENCES users(id)
);

-- RLS policies
ALTER TABLE email_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_cache_select" ON email_cache FOR SELECT USING (true);
CREATE POLICY "email_cache_insert" ON email_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "email_cache_update" ON email_cache FOR UPDATE USING (true);
