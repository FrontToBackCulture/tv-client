-- Update AP Automation template with full onboarding structure and publish
UPDATE solution_templates
SET
  status = 'published',
  version = 1,
  description = 'End-to-end accounts payable automation: supplier management, document collection (PO, DO, Invoice, SOA), reconciliation matching, and GL-ready exports.',
  template = '{
    "tabs": [
      {
        "key": "scope",
        "label": "Scope",
        "color": "purple",
        "sections": [
          { "key": "outlets", "label": "Entities & Outlets", "type": "scope-outlets" },
          { "key": "suppliers", "label": "Suppliers", "type": "scope-suppliers" }
        ]
      },
      {
        "key": "collection",
        "label": "Document Collection",
        "color": "teal",
        "sections": [
          { "key": "periods", "label": "Data Periods Required", "type": "periods" },
          { "key": "supplier-docs", "label": "Supplier Documents", "type": "ap-supplier-docs" }
        ]
      },
      {
        "key": "mapping",
        "label": "Matching Rules",
        "color": "amber",
        "sections": [
          { "key": "outlet-map", "label": "Outlet Name Mapping", "type": "grid-outlet-map" },
          { "key": "supplier-map", "label": "Supplier Mapping", "type": "ap-supplier-map" }
        ]
      },
      {
        "key": "implementation",
        "label": "Implementation",
        "color": "green",
        "sections": [
          { "key": "scan-templates", "label": "Scan Templates per Supplier", "type": "ap-scan-templates" },
          { "key": "matching-rules", "label": "Matching & Reconciliation Rules", "type": "ap-matching-rules" },
          { "key": "recon", "label": "Run & Verify Reconciliation", "type": "ap-recon" },
          { "key": "accounting", "label": "Accounting Rules Setup", "type": "auto-accounting" },
          { "key": "go-live", "label": "Walkthrough & Go Live", "type": "auto-go-live" }
        ]
      }
    ],
    "slug": "ap"
  }'::jsonb,
  example_data = '{
    "scope": [
      { "entity": "Demo Corp", "outlet": "Central Kitchen", "pos": [], "notes": "" },
      { "entity": "Demo Corp", "outlet": "Main Outlet", "pos": [], "notes": "" }
    ],
    "suppliers": [
      {
        "name": "ABC Food Supply",
        "documentTypes": ["purchase_order", "delivery_order", "invoice"],
        "reconciliationTypes": ["do_vs_invoice", "po_vs_invoice"],
        "appliesTo": "all",
        "excludedOutlets": [],
        "notes": "Main dry goods supplier"
      },
      {
        "name": "Fresh Produce Co",
        "documentTypes": ["delivery_order", "invoice", "statement_of_account"],
        "reconciliationTypes": ["do_vs_invoice", "invoice_vs_soa"],
        "appliesTo": "all",
        "excludedOutlets": [],
        "notes": "Fresh vegetables and fruits"
      }
    ],
    "periods": ["Feb 2026", "Mar 2026"]
  }'::jsonb,
  updated_at = now()
WHERE slug = 'ap';
