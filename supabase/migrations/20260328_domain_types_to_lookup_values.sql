-- Migrate domain_types into lookup_values for consistency
-- All lookup-style reference data now lives in one table

-- Insert domain_types rows into lookup_values (skip if already exists)
INSERT INTO lookup_values (type, value, label, color, sort_order)
SELECT 'domain_type', value, label, color, sort_order
FROM domain_types
ON CONFLICT (type, value) DO NOTHING;

-- Drop the standalone domain_types table
DROP TABLE IF EXISTS domain_types;
