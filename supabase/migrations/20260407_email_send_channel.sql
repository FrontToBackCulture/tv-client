-- Add send_channel to email_campaigns: 'ses' (default) or 'outlook'
-- When 'outlook', campaign creates drafts in the sender's Outlook mailbox via Graph API
-- instead of sending directly through SES.

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS send_channel TEXT NOT NULL DEFAULT 'ses'
  CHECK (send_channel IN ('ses', 'outlook'));

-- Add 'drafted', 'partial', 'failed' to allowed statuses
-- (drafted = Outlook drafts created but not yet sent by user)
ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'drafted', 'partial', 'failed'));
