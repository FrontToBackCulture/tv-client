-- ============================================================
-- Skill Activity Log
-- Tracks changes to skill files in _skills/ directory
-- Logged automatically via Claude Code PostToolUse hook
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('edit', 'create', 'delete')),
  actor TEXT,
  machine TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_activity_slug ON skill_activity (skill_slug);
CREATE INDEX idx_skill_activity_created ON skill_activity (created_at DESC);

-- RLS
ALTER TABLE skill_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skill_activity_select" ON skill_activity FOR SELECT USING (true);
CREATE POLICY "skill_activity_insert" ON skill_activity FOR INSERT WITH CHECK (true);
