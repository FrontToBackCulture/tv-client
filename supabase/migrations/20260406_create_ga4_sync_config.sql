-- Store GA4 OAuth credentials for server-side sync
CREATE TABLE ga4_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  platform_property_id TEXT,
  website_property_id TEXT,
  enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name)
);

-- RLS: authenticated users can manage config
ALTER TABLE ga4_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage ga4_sync_config"
  ON ga4_sync_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE ga4_sync_config IS 'GA4 OAuth credentials for server-side analytics sync. Sensitive — refresh_token and client_secret stored here.';

-- Register cron job: daily at 01:15 UTC = 09:15 SGT
SELECT cron.schedule(
  'ga4-sync',
  '15 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cqwcaeffzanfqsxlspig.supabase.co/functions/v1/ga4-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
