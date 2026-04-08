-- Track LinkedIn connect message approval status
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS linkedin_connect_status text
    CHECK (linkedin_connect_status IN ('draft', 'approved', 'sent'));
