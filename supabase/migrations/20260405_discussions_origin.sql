-- Segregate chat threads by origin so the inbox can filter direct
-- conversations vs automation-generated ones (DIO check-ins, task-advisor,
-- scheduled bot posts, etc.).

ALTER TABLE discussions
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'direct'
    CHECK (origin IN ('direct', 'automation'));

-- Backfill: any existing thread whose entity_id is one of the automation
-- namespaces is marked as automation. Replies inherit via the root (the UI
-- filters on the root row).
UPDATE discussions
  SET origin = 'automation'
  WHERE entity_id LIKE 'dio:%'
     OR entity_id LIKE 'task-advisor:%';

CREATE INDEX IF NOT EXISTS idx_discussions_origin
  ON discussions (origin)
  WHERE parent_id IS NULL;
