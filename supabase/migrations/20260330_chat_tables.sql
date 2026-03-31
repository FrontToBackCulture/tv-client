-- Chat v1 — additive schema changes on top of existing discussions system
-- Adds thread titles, activity tracking, read positions, and entity mention index

-- ============================================================
-- 1. Extend discussions: add title and last_activity_at
-- ============================================================

ALTER TABLE discussions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill last_activity_at for existing rows
UPDATE discussions SET last_activity_at = COALESCE(updated_at, created_at)
  WHERE last_activity_at = now();

-- Keep last_activity_at current when replies are posted
CREATE OR REPLACE FUNCTION update_thread_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE discussions
      SET last_activity_at = now()
      WHERE id = NEW.parent_id;
  ELSE
    NEW.last_activity_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS discussions_thread_activity ON discussions;
CREATE TRIGGER discussions_thread_activity
  BEFORE INSERT ON discussions
  FOR EACH ROW EXECUTE FUNCTION update_thread_last_activity();

-- Index for inbox query (top-level threads sorted by activity)
CREATE INDEX IF NOT EXISTS idx_discussions_thread_activity
  ON discussions (last_activity_at DESC)
  WHERE parent_id IS NULL;

-- ============================================================
-- 2. chat_read_positions — per-user, per-thread read marker
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_read_positions (
  user_id      TEXT        NOT NULL,
  thread_id    UUID        NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_read_positions_user
  ON chat_read_positions (user_id);

ALTER TABLE chat_read_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_read_positions_all" ON chat_read_positions
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_read_positions;

-- ============================================================
-- 3. discussion_mentions — normalized entity mention index
-- ============================================================

CREATE TABLE IF NOT EXISTS discussion_mentions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id  UUID        NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  mention_type   TEXT        NOT NULL CHECK (mention_type IN ('user', 'company', 'task', 'project', 'deal')),
  mention_ref    TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussion_mentions_discussion
  ON discussion_mentions (discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_mentions_ref
  ON discussion_mentions (mention_type, mention_ref);

ALTER TABLE discussion_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discussion_mentions_all" ON discussion_mentions
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE discussion_mentions;
