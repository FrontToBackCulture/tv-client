-- Promote Load out of the Data sub-tabs into its own top-level tab.
--
-- Before: Scope | Connectivity | Setup | Data (Collection, Mapping, Load sub-tabs) | Reconciliation
-- After:  Scope | Connectivity | Setup | Data (Collection, Mapping sub-tabs) | Load | Reconciliation
--
-- Rationale: Collection and Mapping are data-entry / spec phases. Load is execution
-- (push outlet map + run dataLoad workflows). Keeping Load as a sub-tab of Data buried
-- execution behind a spec tab; promoting it mirrors the 5-phase mental model more
-- faithfully — Setup (VAL plumbing) → Data (client inputs) → Load (push to VAL) →
-- Reconciliation (verify).

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
        { "key": "mapping", "label": "Mapping", "type": "data-mapping" }
      ]
    },
    {
      "key": "load",
      "label": "Load",
      "color": "blue",
      "sections": [
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
