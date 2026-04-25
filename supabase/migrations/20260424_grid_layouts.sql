-- Grid layouts — shared, workspace-wide saved views for AG Grid surfaces.
-- Replaces per-device localStorage persistence on the Skills review grid;
-- reusable for other grids by varying grid_key.

CREATE TABLE IF NOT EXISTS grid_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_key TEXT NOT NULL,
  name TEXT NOT NULL,
  column_state JSONB NOT NULL DEFAULT '[]'::jsonb,
  filter_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_group_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grid_key, name)
);

CREATE INDEX IF NOT EXISTS idx_grid_layouts_grid_key ON grid_layouts(grid_key);

-- At most one row per grid_key can be flagged default.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_grid_layouts_default_per_grid
  ON grid_layouts(grid_key) WHERE is_default;

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION set_grid_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grid_layouts_updated_at ON grid_layouts;
CREATE TRIGGER trg_grid_layouts_updated_at
  BEFORE UPDATE ON grid_layouts
  FOR EACH ROW EXECUTE FUNCTION set_grid_layouts_updated_at();

ALTER TABLE grid_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grid_layouts_all" ON grid_layouts
  FOR ALL USING (true) WITH CHECK (true);
