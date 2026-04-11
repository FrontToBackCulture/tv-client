-- Dissolve the Mapping sub-tab of Data.
--
-- Rationale: the old Data → Mapping sub-tab was mostly views, not tasks:
--   * Outlet Name Mapping   → auto-populated by "Match Outlets (AI)" in Collection.
--                             Moved to Load tab as a review-and-edit step above
--                             Populate Mapping, so the review/edit/push flow is
--                             in one place.
--   * Payment Method Mapping → decorative (only used for progress counting, not
--                             pushed anywhere operationally). Removed.
--   * Bank Settlement Summary → read-only derivation from Scope → Banks. Moved
--                             to Scope tab under Banks as a verification section.
--
-- After this migration the Data tab is flat — Collection sections only — and
-- the Mapping sub-tab no longer exists. `data.outletMap` and `data.posLabels`
-- JSON fields are left untouched so no onboarding data is lost; posLabels simply
-- has no UI anymore.

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
        { "key": "banks", "label": "Bank Accounts", "type": "scope-banks" },
        { "key": "bank-summary", "label": "Bank Settlement Summary", "type": "verify-bank-summary" }
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
        { "key": "collection", "label": "Collection", "type": "data-collection" }
      ]
    },
    {
      "key": "load",
      "label": "Load",
      "color": "blue",
      "sections": [
        { "key": "outlet-map", "label": "Outlet Name Mapping", "type": "grid-outlet-map" },
        { "key": "populate-mapping", "label": "Populate Mapping", "type": "auto-populate-mapping" },
        { "key": "populate-data", "label": "Populate Data", "type": "auto-populate-data" }
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
