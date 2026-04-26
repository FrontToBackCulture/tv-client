-- User sidebar layouts — per-user sidebar customization synced across
-- devices. Replaces device-only localStorage persistence in
-- sidebarLayoutStore. Workspace scoping is implicit because each workspace
-- has its own Supabase project.

CREATE TABLE IF NOT EXISTS user_sidebar_layouts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_user_sidebar_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_sidebar_layouts_updated_at ON user_sidebar_layouts;
CREATE TRIGGER trg_user_sidebar_layouts_updated_at
  BEFORE UPDATE ON user_sidebar_layouts
  FOR EACH ROW EXECUTE FUNCTION set_user_sidebar_layouts_updated_at();

ALTER TABLE user_sidebar_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_sidebar_layouts_all" ON user_sidebar_layouts
  FOR ALL USING (true) WITH CHECK (true);
