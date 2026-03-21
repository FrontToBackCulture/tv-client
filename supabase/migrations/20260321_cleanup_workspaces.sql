-- =============================================================================
-- Migration: Remove workspace concept entirely
-- Date: 2026-03-21
-- =============================================================================
-- Workspaces are dead. The 5 workspace-type projects become work-type projects.
-- The legacy workspace tables (workspaces, workspace_sessions, workspace_artifacts,
-- workspace_context) are renamed to project_sessions, project_artifacts,
-- project_context — since they're used by ALL project types, not just workspaces.
--
-- SAFETY: All workspace_sessions/artifacts/context already have project_id set
--         (verified: 0 rows missing project_id). The workspace_id column becomes
--         redundant and is dropped.
-- =============================================================================

-- =============================================================================
-- STEP 1: Convert workspace-type projects to work-type
-- =============================================================================
-- 5 projects (2 active, 3 archived) change from 'workspace' to 'work'.
-- No data loss — only the type label changes.

UPDATE projects
SET project_type = 'work',
    identifier_prefix = COALESCE(NULLIF(identifier_prefix, 'WS'), 'PRJ'),
    updated_at = now()
WHERE project_type = 'workspace';

-- Verify: should return 0 rows with workspace type
-- SELECT count(*) FROM projects WHERE project_type = 'workspace';

-- =============================================================================
-- STEP 2: Remove workspace-only columns from projects
-- =============================================================================
-- 'owner' and 'intent' were workspace-specific fields. No work or deal project
-- uses them. Drop them.

ALTER TABLE projects DROP COLUMN IF EXISTS owner;
ALTER TABLE projects DROP COLUMN IF EXISTS intent;

-- =============================================================================
-- STEP 3: Rename workspace child tables to project-scoped names
-- =============================================================================
-- These tables serve ALL project types, not just workspaces. Rename for clarity.
-- The workspace_id column is dropped since project_id is the canonical FK.

-- 3a: workspace_sessions → project_sessions
ALTER TABLE workspace_sessions DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE workspace_sessions RENAME TO project_sessions;

-- 3b: workspace_artifacts → project_artifacts
ALTER TABLE workspace_artifacts DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE workspace_artifacts RENAME TO project_artifacts;

-- 3c: workspace_context → project_context
-- workspace_context already has id as PK (from 20260320 migration)
ALTER TABLE workspace_context DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE workspace_context RENAME TO project_context;

-- 3d: Rename indexes that reference old table names
ALTER INDEX IF EXISTS idx_workspace_context_project_id RENAME TO idx_project_context_project_id;

-- 3e: Rename constraints
ALTER TABLE project_context RENAME CONSTRAINT workspace_context_project_id_unique TO project_context_project_id_unique;

-- =============================================================================
-- STEP 4: Drop legacy workspaces table
-- =============================================================================
-- All 20 workspaces were migrated to projects in 20260314. The original table
-- is no longer referenced by anything.

DROP TABLE IF EXISTS workspaces CASCADE;

-- =============================================================================
-- VERIFICATION (run manually after migration)
-- =============================================================================
-- SELECT project_type, count(*) FROM projects GROUP BY project_type;
-- Expected: work=41 (36+5), deal=83, no workspace
--
-- SELECT count(*) FROM project_sessions WHERE project_id IS NULL;  -- should be 0
-- SELECT count(*) FROM project_artifacts WHERE project_id IS NULL; -- should be 0
-- SELECT count(*) FROM project_context WHERE project_id IS NULL;   -- should be 0
