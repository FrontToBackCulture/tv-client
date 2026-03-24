-- Add prospect pipeline stage to contacts
-- NULL = not a prospect, value = actively being prospected

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS prospect_stage text
    CHECK (prospect_stage IN ('new','researched','drafted','sent','opened','replied'));

CREATE INDEX IF NOT EXISTS idx_crm_contacts_prospect_stage
  ON crm_contacts(prospect_stage) WHERE prospect_stage IS NOT NULL;
