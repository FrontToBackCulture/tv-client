-- MCP Tools Registry — discovery + metadata for tv-mcp tools
-- Synced fields are upserted by tv-mcp on startup via register-mcp-tool.
-- Editable fields are preserved across syncs.

CREATE TABLE IF NOT EXISTS mcp_tools (
  slug TEXT PRIMARY KEY,

  -- Synced from tv-mcp Rust source (overwritten on each register)
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'misc',
  params_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_file TEXT,
  last_synced_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Editable in UI (preserved across syncs)
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deprecated', 'hidden', 'missing')),
  subcategory TEXT,
  purpose TEXT,
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  verified BOOLEAN NOT NULL DEFAULT false,
  owner TEXT,
  last_audited TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mcp_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_tools_select" ON mcp_tools FOR SELECT USING (is_workspace_authenticated());
CREATE POLICY "mcp_tools_insert" ON mcp_tools FOR INSERT WITH CHECK (is_workspace_authenticated());
CREATE POLICY "mcp_tools_update" ON mcp_tools FOR UPDATE USING (is_workspace_authenticated());
CREATE POLICY "mcp_tools_delete" ON mcp_tools FOR DELETE USING (is_workspace_authenticated());

CREATE OR REPLACE TRIGGER mcp_tools_updated_at
  BEFORE UPDATE ON mcp_tools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_mcp_tools_category ON mcp_tools (category);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_status ON mcp_tools (status);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_verified ON mcp_tools (verified);

-- Sync helper: marks any tool not seen in the latest sync window as 'missing'.
-- Call after a full register-mcp-tool sweep with the sync timestamp.
CREATE OR REPLACE FUNCTION mark_missing_mcp_tools(sync_started TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE mcp_tools
     SET status = 'missing'
   WHERE status = 'active'
     AND (last_synced_at IS NULL OR last_synced_at < sync_started);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
