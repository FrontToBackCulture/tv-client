-- Add prospect outreach fields to crm_contacts
-- prospect_type: classification tags (array), linkedin messaging, email outreach

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS prospect_type text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linkedin_connect_msg text,
  ADD COLUMN IF NOT EXISTS linkedin_dm_msg text,
  ADD COLUMN IF NOT EXISTS email_outreach_msg text,
  ADD COLUMN IF NOT EXISTS linkedin_connected boolean DEFAULT false;

-- Validate each element in prospect_type array
ALTER TABLE crm_contacts
  ADD CONSTRAINT crm_contacts_prospect_type_valid
    CHECK (prospect_type <@ ARRAY['prospect','influencer','peer','customer','door_opener']::text[]);
