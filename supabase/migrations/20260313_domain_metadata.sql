-- Domain Metadata — stores domain classification tags (replaces folder-based inference)
-- Apply via Supabase SQL editor or MCP tool

CREATE TABLE IF NOT EXISTS domain_metadata (
  domain TEXT PRIMARY KEY,
  domain_type TEXT NOT NULL DEFAULT 'production'
    CHECK (domain_type IN ('production', 'demo', 'template', 'not-active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE domain_metadata ENABLE ROW LEVEL SECURITY;

-- Allow authenticated reads/writes (same pattern as other tables)
CREATE POLICY "domain_metadata_select" ON domain_metadata FOR SELECT USING (true);
CREATE POLICY "domain_metadata_insert" ON domain_metadata FOR INSERT WITH CHECK (true);
CREATE POLICY "domain_metadata_update" ON domain_metadata FOR UPDATE USING (true);
CREATE POLICY "domain_metadata_delete" ON domain_metadata FOR DELETE USING (true);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER domain_metadata_updated_at
  BEFORE UPDATE ON domain_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
