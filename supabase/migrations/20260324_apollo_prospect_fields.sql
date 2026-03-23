-- Add Apollo-specific fields for prospect integration
-- Companies: employee_count, annual_revenue for enrichment data
-- Contacts: source, source_id, seniority for Apollo dedup and tracking

-- Companies enrichment fields
ALTER TABLE crm_companies
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS annual_revenue numeric;

COMMENT ON COLUMN crm_companies.employee_count IS 'Number of employees (from Apollo enrichment)';
COMMENT ON COLUMN crm_companies.annual_revenue IS 'Annual revenue in USD (from Apollo enrichment)';

-- Contacts source tracking (parity with companies)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS seniority text;

COMMENT ON COLUMN crm_contacts.source IS 'Lead source: apollo | inbound | referral | manual';
COMMENT ON COLUMN crm_contacts.source_id IS 'External source identifier (e.g., Apollo person ID)';
COMMENT ON COLUMN crm_contacts.seniority IS 'Seniority level: owner | founder | c_suite | vp | director | manager | senior | entry';

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_crm_contacts_source_id ON crm_contacts(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_companies_source_id ON crm_companies(source_id) WHERE source_id IS NOT NULL;
