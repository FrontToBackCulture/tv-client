-- Add deal_folder_path and research_folder_path to crm_companies
-- These store knowledge base paths to deal and research folders alongside existing client_folder_path

ALTER TABLE crm_companies
  ADD COLUMN IF NOT EXISTS deal_folder_path text,
  ADD COLUMN IF NOT EXISTS research_folder_path text;

COMMENT ON COLUMN crm_companies.deal_folder_path IS 'Path to deal folder in knowledge base (e.g., 4_Sales/deals/les-amis)';
COMMENT ON COLUMN crm_companies.research_folder_path IS 'Path to research profile folder in knowledge base (e.g., 4_Sales/research/companies/les-amis-group)';
