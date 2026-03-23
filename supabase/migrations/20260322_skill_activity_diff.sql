-- Add diff columns to skill_activity for storing actual changes
ALTER TABLE skill_activity ADD COLUMN IF NOT EXISTS old_value TEXT;
ALTER TABLE skill_activity ADD COLUMN IF NOT EXISTS new_value TEXT;
