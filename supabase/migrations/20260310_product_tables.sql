-- Product Module — 14 tables for platform lifecycle management
-- Apply via Supabase SQL editor or MCP tool

-- ============================================================
-- 6 Core Entity Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS product_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  layer TEXT NOT NULL CHECK (layer IN ('connectivity', 'application', 'experience')),
  description TEXT,
  icon TEXT,
  doc_path TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'deprecated')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  module_id UUID NOT NULL REFERENCES product_modules(id) ON DELETE CASCADE,
  category TEXT,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  tags TEXT[],
  doc_path TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'alpha', 'beta', 'ga', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform_category TEXT NOT NULL,
  connector_type TEXT NOT NULL CHECK (connector_type IN ('api', 'report_translator', 'rpa', 'hybrid')),
  description TEXT,
  region TEXT,
  doc_path TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'development', 'active', 'maintenance', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  target_industry TEXT,
  roi_summary TEXT,
  doc_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'sunset')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  name TEXT,
  description TEXT,
  release_date DATE,
  notion_sync_path TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id TEXT NOT NULL UNIQUE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  description TEXT,
  go_live_date DATE,
  domain_path TEXT,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'inactive', 'trial')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6 Junction Tables (M:M relationships)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_feature_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES product_connectors(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'integrates_with' CHECK (relation IN ('depends_on', 'integrates_with', 'optional')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feature_id, connector_id)
);

CREATE TABLE IF NOT EXISTS product_solution_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID NOT NULL REFERENCES product_solutions(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  is_core BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (solution_id, feature_id)
);

CREATE TABLE IF NOT EXISTS product_solution_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID NOT NULL REFERENCES product_solutions(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES product_connectors(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (solution_id, connector_id)
);

CREATE TABLE IF NOT EXISTS product_release_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES product_releases(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('feature', 'bugfix', 'connector', 'improvement')),
  title TEXT NOT NULL,
  description TEXT,
  feature_id UUID REFERENCES product_features(id) ON DELETE SET NULL,
  connector_id UUID REFERENCES product_connectors(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_deployment_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES product_connectors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trial')),
  enabled_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, connector_id)
);

CREATE TABLE IF NOT EXISTS product_deployment_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  solution_id UUID NOT NULL REFERENCES product_solutions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trial')),
  enabled_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, solution_id)
);

-- ============================================================
-- 2 Supporting Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS product_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('module', 'feature', 'connector', 'solution', 'release', 'deployment')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  content TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('module', 'feature', 'connector', 'solution', 'release', 'deployment')),
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, entity_type, entity_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_product_features_module ON product_features(module_id);
CREATE INDEX IF NOT EXISTS idx_product_deployments_company ON product_deployments(company_id);
CREATE INDEX IF NOT EXISTS idx_product_activity_entity ON product_activity(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_product_task_links_entity ON product_task_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_product_release_items_release ON product_release_items(release_id);

-- ============================================================
-- RLS Policies (permissive — same as CRM)
-- ============================================================

ALTER TABLE product_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_feature_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_solution_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_solution_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_deployment_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_deployment_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_task_links ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "product_modules_all" ON product_modules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_features_all" ON product_features FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_connectors_all" ON product_connectors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_solutions_all" ON product_solutions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_releases_all" ON product_releases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_deployments_all" ON product_deployments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_feature_connectors_all" ON product_feature_connectors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_solution_features_all" ON product_solution_features FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_solution_connectors_all" ON product_solution_connectors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_release_items_all" ON product_release_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_deployment_connectors_all" ON product_deployment_connectors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_deployment_solutions_all" ON product_deployment_solutions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_activity_all" ON product_activity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "product_task_links_all" ON product_task_links FOR ALL USING (true) WITH CHECK (true);
