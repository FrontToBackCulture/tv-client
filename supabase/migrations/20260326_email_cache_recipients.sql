-- Add to/cc recipient fields to email_cache
-- So the email list can show from → to without opening each email

ALTER TABLE email_cache ADD COLUMN IF NOT EXISTS to_emails jsonb DEFAULT '[]';
ALTER TABLE email_cache ADD COLUMN IF NOT EXISTS cc_emails jsonb DEFAULT '[]';
