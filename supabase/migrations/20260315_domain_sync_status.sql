-- Domain sync status: tracks artifact sync/extract state per domain
-- Replaces .sync-metadata.json files on the filesystem

CREATE TABLE IF NOT EXISTS domain_sync_status (
  domain      TEXT NOT NULL,
  artifact    TEXT NOT NULL,
  phase       TEXT NOT NULL CHECK (phase IN ('sync', 'extract')),
  count       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ok',
  duration_ms INTEGER,
  last_sync   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, artifact, phase)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_domain_sync_status_domain ON domain_sync_status (domain);

-- RLS
ALTER TABLE domain_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "domain_sync_status_select" ON domain_sync_status FOR SELECT USING (true);
CREATE POLICY "domain_sync_status_insert" ON domain_sync_status FOR INSERT WITH CHECK (true);
CREATE POLICY "domain_sync_status_update" ON domain_sync_status FOR UPDATE USING (true);
CREATE POLICY "domain_sync_status_delete" ON domain_sync_status FOR DELETE USING (true);
