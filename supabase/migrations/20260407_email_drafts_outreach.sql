-- Extend email_drafts for outreach pipeline
-- Adds draft_type to distinguish outreach from manual drafts,
-- context for AI research notes, and outlook_message_id for Graph API tracking.

-- New columns
ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS draft_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS context jsonb,
  ADD COLUMN IF NOT EXISTS automation_run_id text,
  ADD COLUMN IF NOT EXISTS outlook_message_id text;

-- Constrain draft_type values
ALTER TABLE email_drafts ADD CONSTRAINT email_drafts_draft_type_check
  CHECK (draft_type IN ('manual', 'outreach'));

-- Expand status to include 'approved' (pushed to Outlook) and 'skipped' (rejected by reviewer)
ALTER TABLE email_drafts DROP CONSTRAINT IF EXISTS email_drafts_status_check;
ALTER TABLE email_drafts ADD CONSTRAINT email_drafts_status_check
  CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'skipped'));

-- Index for Outreach tab queries
CREATE INDEX IF NOT EXISTS idx_email_drafts_outreach
  ON email_drafts (created_at DESC)
  WHERE draft_type = 'outreach';
