-- Make workspace_id nullable on workspace_artifacts and workspace_sessions
-- so that Work and Deal type projects (which only exist in the projects table,
-- not the legacy workspaces table) can have artifacts and sessions via project_id.
--
-- Note: workspace_context is skipped because workspace_id is its primary key.
-- Context for Work/Deal projects will need a schema change (add id column) later.

ALTER TABLE workspace_artifacts ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE workspace_sessions ALTER COLUMN workspace_id DROP NOT NULL;
