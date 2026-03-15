-- Lookup values table — replaces hardcoded constants
-- Types: deal_stage, deal_solution, company_stage, activity_type, project_status, project_health

CREATE TABLE IF NOT EXISTS lookup_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  color text,
  icon text,
  weight numeric,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(type, value)
);

CREATE INDEX IF NOT EXISTS idx_lookup_values_type ON lookup_values(type);

-- Seed deal stages
INSERT INTO lookup_values (type, value, label, color, weight, sort_order) VALUES
  ('deal_stage', 'target', 'Target', 'zinc', 0.05, 0),
  ('deal_stage', 'prospect', 'Prospect', 'zinc', 0.1, 1),
  ('deal_stage', 'lead', 'Lead', 'gray', 0.2, 2),
  ('deal_stage', 'qualified', 'Qualified', 'blue', 0.3, 3),
  ('deal_stage', 'pilot', 'Pilot', 'purple', 0.5, 4),
  ('deal_stage', 'proposal', 'Proposal', 'cyan', 0.6, 5),
  ('deal_stage', 'negotiation', 'Negotiation', 'yellow', 0.8, 6),
  ('deal_stage', 'won', 'Won', 'green', 1.0, 7),
  ('deal_stage', 'lost', 'Lost', 'red', 0, 8)
ON CONFLICT (type, value) DO NOTHING;

-- Seed deal solutions
INSERT INTO lookup_values (type, value, label, color, icon, sort_order) VALUES
  ('deal_solution', 'ap_automation', 'AP Automation', 'blue', 'receipt', 0),
  ('deal_solution', 'ar_automation', 'AR Automation', 'indigo', 'receipt', 1),
  ('deal_solution', 'free_invoice_scan', 'Free Invoice Scan', 'green', 'scan', 2),
  ('deal_solution', 'analytics', 'Analytics', 'purple', 'chart', 3),
  ('deal_solution', 'revenue_reconciliation', 'Revenue Reconciliation', 'cyan', 'calculator', 4),
  ('deal_solution', 'professional_services', 'Professional Services', 'amber', 'briefcase', 5),
  ('deal_solution', 'partnership', 'Partnership', 'rose', 'handshake', 6),
  ('deal_solution', 'data_extraction', 'Data Extraction', 'orange', 'file-search', 7),
  ('deal_solution', 'events_ai', 'Events AI', 'pink', 'calendar-days', 8),
  ('deal_solution', 'byoai', 'BYOAI', 'emerald', 'sparkles', 9),
  ('deal_solution', 'general', 'General', 'gray', 'folder-open', 10),
  ('deal_solution', 'other', 'Other', 'zinc', 'folder', 11)
ON CONFLICT (type, value) DO NOTHING;

-- Seed company stages
INSERT INTO lookup_values (type, value, label, color, sort_order) VALUES
  ('company_stage', 'prospect', 'Prospect', 'gray', 0),
  ('company_stage', 'opportunity', 'Opportunity', 'blue', 1),
  ('company_stage', 'client', 'Client', 'green', 2),
  ('company_stage', 'churned', 'Churned', 'red', 3),
  ('company_stage', 'partner', 'Partner', 'purple', 4)
ON CONFLICT (type, value) DO NOTHING;

-- Seed activity types
INSERT INTO lookup_values (type, value, label, icon, sort_order) VALUES
  ('activity_type', 'email', 'Email', 'mail', 0),
  ('activity_type', 'note', 'Note', 'file-text', 1),
  ('activity_type', 'meeting', 'Meeting', 'calendar', 2),
  ('activity_type', 'call', 'Call', 'phone', 3),
  ('activity_type', 'task', 'Task', 'check-square', 4),
  ('activity_type', 'stage_change', 'Stage Change', 'git-branch', 5)
ON CONFLICT (type, value) DO NOTHING;

-- Seed project statuses
INSERT INTO lookup_values (type, value, label, color, sort_order) VALUES
  ('project_status', 'planned', 'Planned', '#6B7280', 0),
  ('project_status', 'active', 'Active', '#0D7680', 1),
  ('project_status', 'completed', 'Completed', '#10B981', 2),
  ('project_status', 'paused', 'Paused', '#F59E0B', 3)
ON CONFLICT (type, value) DO NOTHING;

-- Seed project health
INSERT INTO lookup_values (type, value, label, color, sort_order) VALUES
  ('project_health', 'on_track', 'On Track', '#10B981', 0),
  ('project_health', 'at_risk', 'At Risk', '#F59E0B', 1),
  ('project_health', 'off_track', 'Off Track', '#EF4444', 2)
ON CONFLICT (type, value) DO NOTHING;

-- Seed project types
INSERT INTO lookup_values (type, value, label, color, icon, sort_order) VALUES
  ('project_type', 'work', 'Work', '#6B7280', 'check-square', 0),
  ('project_type', 'deal', 'Deal', '#3B82F6', 'building-2', 1),
  ('project_type', 'workspace', 'Workspace', '#A855F7', 'folder-open', 2)
ON CONFLICT (type, value) DO NOTHING;
