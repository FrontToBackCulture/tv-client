-- AP template v2: rename Matching Rules → Mapping, update section labels
UPDATE solution_templates
SET
  version = 2,
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
        "label": "Mapping Matrix",
        "color": "amber",
        "sections": [
          { "key": "outlet-map", "label": "Outlet Mapping", "type": "ap-outlet-map" },
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
  updated_at = now()
WHERE slug = 'ap';
