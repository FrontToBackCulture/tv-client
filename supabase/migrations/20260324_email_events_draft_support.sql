-- Allow email_events to track 1-to-1 draft sends (not just campaigns)
-- campaign_id becomes nullable, draft_id added as optional FK

-- Make campaign_id nullable
ALTER TABLE email_events ALTER COLUMN campaign_id DROP NOT NULL;

-- Make contact_id nullable (draft sends use crm_contacts, not email_contacts)
ALTER TABLE email_events ALTER COLUMN contact_id DROP NOT NULL;

-- Add draft_id column
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS draft_id uuid REFERENCES email_drafts(id) ON DELETE SET NULL;

-- Add crm_contact_id for draft tracking (references crm_contacts instead of email_contacts)
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS crm_contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL;

-- Index for draft event lookups
CREATE INDEX IF NOT EXISTS idx_email_events_draft ON email_events(draft_id) WHERE draft_id IS NOT NULL;
