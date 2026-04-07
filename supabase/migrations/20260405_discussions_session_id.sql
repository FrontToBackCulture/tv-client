-- Add Claude Code session ID to discussions so chat threads can resume
-- the same Claude session across app restarts. Stored on the thread root
-- (parent_id IS NULL); replies inherit continuity via the root.

ALTER TABLE discussions
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_discussions_session_id
  ON discussions (session_id)
  WHERE session_id IS NOT NULL;
