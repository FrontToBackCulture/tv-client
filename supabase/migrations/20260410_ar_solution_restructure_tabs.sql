-- Restructure the AR solution template tabs.
--
-- Old layout: Scope | Connectivity | Data Collection | Mapping Matrix | Implementation
--   (Implementation was a dumping ground: bot/POS setup, sync tables/workflows/dashboards,
--    populate mapping, populate data, recon grid, accounting rules, go live.)
--
-- New layout: Scope | Connectivity | Setup | Data | Reconciliation
--   - Setup       = Bot Setup, POS Setup, Sync Tables/Workflows/Dashboards from Lab
--   - Data        = Collection / Mapping / Load (sub-tabs inside the tab)
--   - Reconciliation = Run & Verify + Accounting Rules + Go Live
--
-- Per-item implStatus keys (sync-tbl::*, populate-data::*, recon::*, etc.) are
-- preserved — only the tab they render under has changed.

UPDATE solution_templates
SET template = jsonb_set(
  template,
  '{tabs}',
  '[
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
      "key": "setup",
      "label": "Setup",
      "color": "green",
      "sections": [
        { "key": "bot-setup", "label": "Auto-Download Bots", "type": "auto-bot-setup" },
        { "key": "pos-setup", "label": "POS Connection & Data Ingestion", "type": "auto-pos-setup" },
        { "key": "sync-tables", "label": "Sync Tables from Lab", "type": "auto-sync-items" },
        { "key": "sync-workflows", "label": "Sync Workflows", "type": "auto-sync-workflows" },
        { "key": "sync-dashboards", "label": "Sync Dashboards", "type": "auto-sync-dashboards" }
      ]
    },
    {
      "key": "data",
      "label": "Data",
      "color": "teal",
      "sections": [
        { "key": "collection", "label": "Collection", "type": "data-collection" },
        { "key": "mapping", "label": "Mapping", "type": "data-mapping" },
        { "key": "load", "label": "Load", "type": "data-load" }
      ]
    },
    {
      "key": "reconciliation",
      "label": "Reconciliation",
      "color": "amber",
      "sections": [
        { "key": "recon", "label": "Run & Verify Reconciliation", "type": "grid-recon" },
        { "key": "accounting", "label": "Accounting Rules Setup", "type": "auto-accounting" },
        { "key": "go-live", "label": "Walkthrough & Go Live", "type": "auto-go-live" }
      ]
    }
  ]'::jsonb
)
WHERE slug = 'ar';
