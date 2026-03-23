-- Add email_status to crm_contacts for Apollo email verification tracking
-- Values: verified, guessed, unavailable, null (unknown/not checked)

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS email_status text;

COMMENT ON COLUMN crm_contacts.email_status IS 'Email verification status from Apollo: verified | guessed | unavailable';
