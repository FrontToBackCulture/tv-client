-- Add 'review' activity type for bot-authored project reviews.
ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_type_check;
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_type_check
  CHECK (type = ANY (ARRAY['email','note','meeting','call','task','stage_change','review']::text[]));

INSERT INTO lookup_values (type, value, label, icon, sort_order) VALUES
  ('activity_type', 'review', 'Review', 'clipboard-check', 6)
ON CONFLICT (type, value) DO NOTHING;
