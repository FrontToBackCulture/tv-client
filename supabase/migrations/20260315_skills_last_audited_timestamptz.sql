-- Change last_audited from DATE to TIMESTAMPTZ for full datetime precision
ALTER TABLE skills ALTER COLUMN last_audited TYPE TIMESTAMPTZ USING last_audited::timestamptz;
