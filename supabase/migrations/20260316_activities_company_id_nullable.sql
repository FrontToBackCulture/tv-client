-- Make company_id nullable on crm_activities so Work projects
-- can log activities without a CRM company association.

ALTER TABLE crm_activities ALTER COLUMN company_id DROP NOT NULL;
