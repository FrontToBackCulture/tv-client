-- Skills Registry — centralised skill metadata (replaces _skills/registry.json)
-- Apply via Supabase SQL editor

CREATE TABLE IF NOT EXISTS skills (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'val',
  subcategory TEXT,
  target TEXT NOT NULL DEFAULT 'platform'
    CHECK (target IN ('bot', 'platform', 'both')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deprecated', 'test', 'review', 'draft', 'deleted')),
  command TEXT,
  domain TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  owner TEXT,
  last_audited DATE,
  rating NUMERIC(3,1),
  has_demo BOOLEAN NOT NULL DEFAULT false,
  has_examples BOOLEAN NOT NULL DEFAULT false,
  has_deck BOOLEAN NOT NULL DEFAULT false,
  has_guide BOOLEAN NOT NULL DEFAULT false,
  demo_uploaded BOOLEAN NOT NULL DEFAULT false,
  demo_url TEXT,
  needs_work TEXT,
  work_notes TEXT,
  action TEXT,
  outcome TEXT,
  gallery_pinned BOOLEAN NOT NULL DEFAULT false,
  gallery_order INTEGER,
  distributions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- Allow authenticated reads/writes (same pattern as other tables)
CREATE POLICY "skills_select" ON skills FOR SELECT USING (true);
CREATE POLICY "skills_insert" ON skills FOR INSERT WITH CHECK (true);
CREATE POLICY "skills_update" ON skills FOR UPDATE USING (true);
CREATE POLICY "skills_delete" ON skills FOR DELETE USING (true);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for common filters
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills (category);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills (status);
CREATE INDEX IF NOT EXISTS idx_skills_target ON skills (target);
