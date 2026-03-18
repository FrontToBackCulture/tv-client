-- Discussions table — universal comment/discussion system
-- Attaches to any entity via polymorphic entity_type + entity_id

CREATE TABLE discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,      -- 'file', 'crm_deal', 'crm_company', 'task', 'project', 'workspace', 'campaign'
  entity_id TEXT NOT NULL,        -- UUID for DB entities, relative path for files
  parent_id UUID REFERENCES discussions(id) ON DELETE CASCADE,  -- for threaded replies
  author TEXT NOT NULL,           -- 'melvin', 'darren', 'bot-mel', etc.
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching discussions by entity (most common query)
CREATE INDEX idx_discussions_entity ON discussions(entity_type, entity_id, created_at DESC);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE discussions;
