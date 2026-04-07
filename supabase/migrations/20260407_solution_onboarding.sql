-- Solution Onboarding Matrix
-- Template-driven onboarding tracker for AR/AP/Analytics solutions

-- ============================================================================
-- solution_templates — master template definitions (managed via AI/code)
-- ============================================================================
CREATE TABLE IF NOT EXISTS solution_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  template JSONB NOT NULL DEFAULT '{}',
  example_data JSONB DEFAULT '{}',
  product_solution_id UUID REFERENCES product_solutions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solution_templates_slug ON solution_templates(slug);
CREATE INDEX IF NOT EXISTS idx_solution_templates_status ON solution_templates(status);

ALTER TABLE solution_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solution_templates_all" ON solution_templates
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- solution_instances — per-domain onboarding instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS solution_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES solution_templates(id) ON DELETE CASCADE,
  template_version INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}',
  total_items INTEGER DEFAULT 0,
  completed_items INTEGER DEFAULT 0,
  progress_pct NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain, template_id)
);

CREATE INDEX IF NOT EXISTS idx_solution_instances_domain ON solution_instances(domain);
CREATE INDEX IF NOT EXISTS idx_solution_instances_template ON solution_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_solution_instances_status ON solution_instances(status);

ALTER TABLE solution_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solution_instances_all" ON solution_instances
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Seed AR Automation template
-- ============================================================================
INSERT INTO solution_templates (slug, name, description, status, version, template, example_data)
VALUES (
  'ar',
  'AR Automation',
  'Revenue reconciliation — POS vs delivery platform vs bank settlement. Includes GL journal automation and daily reporting.',
  'published',
  1,
  '{
    "tabs": [
      {
        "key": "scope",
        "label": "Scope",
        "color": "purple",
        "sections": [
          { "key": "outlets", "label": "Entities & Outlets", "type": "scope-outlets" },
          { "key": "paymentMethods", "label": "Payment Methods", "type": "scope-payment-methods" },
          { "key": "banks", "label": "Bank Accounts", "type": "scope-banks" }
        ]
      },
      {
        "key": "connectivity",
        "label": "Connectivity",
        "color": "cyan",
        "sections": [
          { "key": "pos-connections", "label": "POS Connections", "type": "auto-pos" },
          { "key": "credentials", "label": "Platform Credentials", "type": "auto-credentials" }
        ]
      },
      {
        "key": "collection",
        "label": "Data Collection",
        "color": "teal",
        "sections": [
          { "key": "periods", "label": "Data Periods Required", "type": "periods" },
          { "key": "gl", "label": "GL Posting Method & Template", "type": "auto-gl" },
          { "key": "pos-data", "label": "POS Reports (Historical)", "type": "auto-pos-data" },
          { "key": "settlement", "label": "Settlement Reports", "type": "auto-settlement" },
          { "key": "bank-statements", "label": "Bank Statements", "type": "auto-bank-statements" }
        ]
      },
      {
        "key": "mapping",
        "label": "Mapping Matrix",
        "color": "amber",
        "sections": [
          { "key": "outlet-map", "label": "Outlet Name Mapping", "type": "grid-outlet-map" },
          { "key": "pm-map", "label": "Payment Method Mapping (POS → VAL)", "type": "grid-pm-map" },
          { "key": "bank-verify", "label": "Bank Settlement Summary", "type": "grid-bank-verify" }
        ]
      },
      {
        "key": "implementation",
        "label": "Implementation",
        "color": "green",
        "sections": [
          { "key": "bot-setup", "label": "Auto-Download Bots", "type": "auto-bot-setup" },
          { "key": "pos-setup", "label": "POS Connection & Data Ingestion", "type": "auto-pos-setup" },
          { "key": "sync-tables", "label": "Sync Tables from Lab", "type": "auto-sync-items" },
          { "key": "workflows", "label": "Configure Workflows", "type": "auto-workflow-items" },
          { "key": "populate", "label": "Populate Mapping & Data", "type": "auto-populate" },
          { "key": "recon", "label": "Run & Verify Reconciliation", "type": "grid-recon" },
          { "key": "accounting", "label": "Accounting Rules Setup", "type": "auto-accounting" },
          { "key": "go-live", "label": "Walkthrough & Go Live", "type": "auto-go-live" }
        ]
      }
    ],
    "credentialPlatforms": ["GrabFood", "foodpanda"],
    "settlementExclude": ["Cash"]
  }'::jsonb,
  '{
    "scope": [
      { "entity": "Demo Corp", "outlet": "Main Outlet", "pos": ["Epoint"], "notes": "" },
      { "entity": "Demo Corp", "outlet": "Branch 1", "pos": ["Epoint"], "notes": "" }
    ],
    "paymentMethods": [
      { "name": "Cash", "appliesTo": "all", "excludedOutlets": [], "notes": "" },
      { "name": "Visa/MC", "appliesTo": "all", "excludedOutlets": [], "notes": "" },
      { "name": "GrabFood", "appliesTo": "all", "excludedOutlets": [], "notes": "" }
    ],
    "banks": [
      { "bank": "DBS", "account": "001-234567-8", "outlets": [], "paymentMethods": [], "notes": "" }
    ],
    "periods": ["Feb 2026", "Mar 2026"]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Seed AP Automation template (draft)
INSERT INTO solution_templates (slug, name, description, status, version, template)
VALUES (
  'ap',
  'AP Automation',
  'End-to-end accounts payable automation: AI invoice scanning, price verification, and GL-ready exports.',
  'draft',
  1,
  '{
    "tabs": [
      { "key": "scope", "label": "Scope", "color": "purple", "sections": [
        { "key": "outlets", "label": "Entities & Outlets", "type": "scope-outlets" },
        { "key": "suppliers", "label": "Suppliers", "type": "scope-suppliers" }
      ]},
      { "key": "collection", "label": "Data Collection", "color": "teal", "sections": [
        { "key": "periods", "label": "Data Periods Required", "type": "periods" },
        { "key": "invoices", "label": "Sample Invoices", "type": "auto-invoices" },
        { "key": "rate-cards", "label": "Rate Cards", "type": "auto-rate-cards" },
        { "key": "soas", "label": "Statements of Account", "type": "auto-soas" }
      ]},
      { "key": "implementation", "label": "Implementation", "color": "green", "sections": [
        { "key": "scan-templates", "label": "Scan Templates", "type": "auto-scan-templates" },
        { "key": "recon", "label": "AP Reconciliation", "type": "auto-ap-recon" },
        { "key": "go-live", "label": "Go Live", "type": "auto-go-live" }
      ]}
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Seed Analytics template (draft)
INSERT INTO solution_templates (slug, name, description, status, version, template)
VALUES (
  'analytics',
  'Analytics & BI',
  'Live dashboards, automated reporting, and location analytics for multi-outlet F&B operators.',
  'draft',
  1,
  '{
    "tabs": [
      { "key": "scope", "label": "Scope", "color": "purple", "sections": [
        { "key": "outlets", "label": "Entities & Outlets", "type": "scope-outlets" },
        { "key": "reports", "label": "Reports Required", "type": "scope-reports" }
      ]},
      { "key": "collection", "label": "Data Collection", "color": "teal", "sections": [
        { "key": "periods", "label": "Data Periods Required", "type": "periods" },
        { "key": "data-sources", "label": "Data Sources", "type": "auto-data-sources" }
      ]},
      { "key": "implementation", "label": "Implementation", "color": "green", "sections": [
        { "key": "dashboards", "label": "Dashboard Setup", "type": "auto-dashboards" },
        { "key": "reports-setup", "label": "Report Setup", "type": "auto-report-setup" },
        { "key": "go-live", "label": "Go Live", "type": "auto-go-live" }
      ]}
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
