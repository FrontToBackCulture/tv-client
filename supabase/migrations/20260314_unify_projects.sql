-- =============================================================================
-- Migration: Unify Projects, Workspaces, and CRM Deals
-- Date: 2026-03-14
-- =============================================================================
-- This migration collapses workspaces and crm_deals into the projects table.
-- Phase 1: Schema extension (additive, nothing breaks)
-- Phase 2: Data migration
-- Phase 4 (cleanup) is a separate migration after 2 weeks stable.
-- =============================================================================

-- PRE-CHECK: UUID collision check (must return 0 rows)
-- Run this manually first:
-- SELECT id FROM crm_deals WHERE id IN (SELECT id FROM projects)
-- UNION ALL
-- SELECT id FROM workspaces WHERE id IN (SELECT id FROM projects)
-- UNION ALL
-- SELECT id FROM crm_deals WHERE id IN (SELECT id FROM workspaces);

-- =============================================================================
-- PHASE 1: Schema Extension
-- =============================================================================

-- 1.1 Add columns to projects table

-- Workspace columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'work';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS intent text;

-- Deal columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES crm_companies(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_stage text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_value numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_currency text DEFAULT 'SGD';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_solution text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_expected_close date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_actual_close date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_proposal_path text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_order_form_path text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_lost_reason text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_won_notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_stage_changed_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_stale_snoozed_until timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_contact_ids uuid[];
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_tags text[];
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deal_notes text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects (project_type);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deal_stage ON projects (deal_stage) WHERE deal_stage IS NOT NULL;

-- 1.2 Add project_id to workspace child tables (alongside existing workspace_id)
ALTER TABLE workspace_sessions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE workspace_artifacts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE workspace_context ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);

-- 1.3 Add project_id to crm_activities (alongside existing deal_id)
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);

-- =============================================================================
-- PHASE 2: Data Migration
-- =============================================================================

-- 2.1 Migrate workspaces → projects
INSERT INTO projects (id, name, slug, description, status, project_type, owner, intent,
                      initiative_id, identifier_prefix, next_task_number, created_at, updated_at)
SELECT w.id, w.title,
  lower(regexp_replace(w.title, '[^a-zA-Z0-9]+', '-', 'g')),
  w.description,
  CASE w.status
    WHEN 'open' THEN 'planned'
    WHEN 'active' THEN 'active'
    WHEN 'in_progress' THEN 'active'
    WHEN 'done' THEN 'completed'
    WHEN 'paused' THEN 'paused'
    ELSE 'planned'
  END,
  'workspace', w.owner, w.intent, w.initiative_id, 'WS', 1, w.created_at, w.updated_at
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = w.id);

-- 2.2 Re-point workspace child tables
UPDATE workspace_sessions SET project_id = workspace_id WHERE project_id IS NULL;
UPDATE workspace_artifacts SET project_id = workspace_id WHERE project_id IS NULL;
UPDATE workspace_context SET project_id = workspace_id WHERE project_id IS NULL;

-- 2.3 Migrate deals → projects
INSERT INTO projects (id, name, slug, description, status, project_type, company_id,
  deal_stage, deal_value, deal_currency, deal_solution, deal_expected_close, deal_actual_close,
  deal_proposal_path, deal_order_form_path, deal_lost_reason, deal_won_notes,
  deal_stage_changed_at, deal_stale_snoozed_until, deal_contact_ids, deal_tags, deal_notes,
  identifier_prefix, next_task_number, created_at, updated_at)
SELECT d.id, d.name,
  lower(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g')),
  d.description,
  CASE d.stage WHEN 'won' THEN 'completed' WHEN 'lost' THEN 'completed' ELSE 'active' END,
  'deal', d.company_id,
  d.stage, d.value, d.currency, d.solution, d.expected_close_date::date, d.actual_close_date::date,
  d.proposal_path, d.order_form_path, d.lost_reason, d.won_notes,
  d.stage_changed_at, d.stale_snoozed_until, d.contact_ids, d.tags, d.notes,
  'DEAL', 1, d.created_at, d.updated_at
FROM crm_deals d
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = d.id);

-- 2.4 Re-point crm_activities
UPDATE crm_activities SET project_id = deal_id WHERE deal_id IS NOT NULL AND project_id IS NULL;

-- 2.5 Create default task_statuses for migrated projects
INSERT INTO task_statuses (project_id, name, type, color, icon, sort_order)
SELECT p.id, s.name, s.type, s.color, s.icon, s.sort_order
FROM projects p
CROSS JOIN (VALUES
  ('Backlog', 'backlog', '#6B7280', 'inbox', 0),
  ('Todo', 'unstarted', '#3B82F6', 'circle', 1),
  ('In Progress', 'started', '#0D7680', 'play', 2),
  ('Done', 'completed', '#10B981', 'check', 3)
) AS s(name, type, color, icon, sort_order)
WHERE p.project_type IN ('deal', 'workspace')
AND NOT EXISTS (SELECT 1 FROM task_statuses ts WHERE ts.project_id = p.id);

-- =============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- =============================================================================
-- SELECT project_type, count(*) FROM projects GROUP BY project_type;
-- SELECT count(*) FROM workspace_sessions WHERE project_id IS NULL;  -- should be 0
-- SELECT count(*) FROM crm_activities WHERE deal_id IS NOT NULL AND project_id IS NULL;  -- should be 0
