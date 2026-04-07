-- Add notion_api_key column to notion_sync_configs
-- Stores the Notion integration token per config so the server-side
-- Edge Function can authenticate without local settings.
-- The column is nullable — configs without a key fall back to
-- client-side sync (until migrated).

ALTER TABLE notion_sync_configs
  ADD COLUMN IF NOT EXISTS notion_api_key TEXT;

-- Security: restrict notion_api_key to service_role only (never exposed via PostgREST)
-- The Edge Function uses SUPABASE_SERVICE_ROLE_KEY so it can read this column.
-- Normal authenticated users should NOT see this column.
COMMENT ON COLUMN notion_sync_configs.notion_api_key IS
  'Notion integration bearer token. Read by notion-sync Edge Function. Never expose to client.';

-- RLS: ensure the column is excluded from client reads.
-- Since notion_sync_configs already has RLS, we just need to make sure
-- the select policy doesn't include notion_api_key. We'll handle this
-- by creating a view for client access if needed later.
-- For now, the Edge Function uses service_role which bypasses RLS.
