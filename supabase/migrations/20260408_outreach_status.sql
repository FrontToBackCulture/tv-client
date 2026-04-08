-- Track outreach state at the company level so automations know who's been contacted
ALTER TABLE crm_companies
  ADD COLUMN IF NOT EXISTS outreach_status text
    CHECK (outreach_status IN ('drafting', 'contacted', 'replied', 'meeting_booked'));

-- Index for automation data source query (find companies not yet contacted)
CREATE INDEX IF NOT EXISTS idx_crm_companies_outreach
  ON crm_companies (outreach_status)
  WHERE hiring_signals IS NOT NULL;
