-- Add UEN and outlet_count columns to crm_companies
-- Convention: "unknown" = searched but not found, NULL = not yet populated
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS uen text;
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS outlet_count integer;
