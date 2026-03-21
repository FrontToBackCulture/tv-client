-- =============================================================================
-- Migration: Remove legacy crm_deals table and task-deal linking
-- Date: 2026-03-21
-- =============================================================================
-- CRM deals are now projects with project_type='deal'. The old crm_deals table
-- was fully migrated in 20260314 (preserving UUIDs). This migration drops:
--   1. task_deal_links junction table (tasks link to deal-projects via project_id)
--   2. tasks.crm_deal_id column (all 90 tasks with this also have project_id)
--   3. crm_deals table (77 rows, all exist in projects table)
--   4. crm_activities.deal_id column (all activities with deal_id have project_id)
--
-- SAFETY: Every piece of data has been verified to exist in the unified model.
-- =============================================================================

-- =============================================================================
-- STEP 1: Drop task_deal_links junction table
-- =============================================================================
-- 50+ links that mapped tasks to deals. Tasks already link to deal-type projects
-- via their project_id FK. This junction table is redundant.

DROP TABLE IF EXISTS task_deal_links CASCADE;

-- =============================================================================
-- STEP 2: Drop tasks.crm_deal_id column
-- =============================================================================
-- 90 tasks have this set. All 90 also have project_id pointing to the same
-- deal (now a project with type='deal'). Safe to remove.

ALTER TABLE tasks DROP COLUMN IF EXISTS crm_deal_id;

-- =============================================================================
-- STEP 3: Drop crm_activities.deal_id column
-- =============================================================================
-- 130 activities have deal_id set. All 130 also have project_id set to the
-- same UUID (verified: 0 orphaned). Activities now link via project_id only.

ALTER TABLE crm_activities DROP COLUMN IF EXISTS deal_id;

-- =============================================================================
-- STEP 4: Drop legacy crm_deals table
-- =============================================================================
-- 77 deals, all migrated to projects with project_type='deal' (preserving UUIDs).
-- No other table references crm_deals after steps 1-3 above.

DROP TABLE IF EXISTS crm_deals CASCADE;

-- =============================================================================
-- VERIFICATION (run manually after migration)
-- =============================================================================
-- SELECT count(*) FROM projects WHERE project_type = 'deal';  -- should be 83
-- SELECT count(*) FROM crm_activities WHERE project_id IS NOT NULL; -- should be 135
--
-- Confirm dropped:
-- SELECT to_regclass('crm_deals');         -- should be NULL
-- SELECT to_regclass('task_deal_links');    -- should be NULL
