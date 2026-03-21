-- Add proper id column to workspace_context so it can work with both legacy
-- workspaces (via workspace_id FK) and new projects (via project_id FK).
--
-- Previously workspace_id was the PK, which meant:
-- 1. workspace_id could never be NULL
-- 2. Projects not in the legacy workspaces table couldn't have context
--
-- After this migration:
-- - id (uuid) is the new PK
-- - workspace_id is nullable (FK to legacy workspaces, backward compat)
-- - project_id is the primary FK to projects table
-- - Unique constraint on project_id ensures one context per project

-- Step 0: Disable realtime publication temporarily (blocks UPDATE without replica identity)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE workspace_context;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Step 1: Drop the old primary key constraint
ALTER TABLE workspace_context DROP CONSTRAINT IF EXISTS workspace_context_pkey;

-- Step 2: Add a proper id column as PK
ALTER TABLE workspace_context ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE workspace_context SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE workspace_context ALTER COLUMN id SET NOT NULL;
ALTER TABLE workspace_context ADD PRIMARY KEY (id);

-- Step 3: Make workspace_id nullable (was the old PK, so it was NOT NULL)
ALTER TABLE workspace_context ALTER COLUMN workspace_id DROP NOT NULL;

-- Step 4: Add unique constraint on project_id for upsert conflict target
-- (one context row per project)
ALTER TABLE workspace_context ADD CONSTRAINT workspace_context_project_id_unique UNIQUE (project_id);

-- Step 5: Index for quick lookup by project_id
CREATE INDEX IF NOT EXISTS idx_workspace_context_project_id ON workspace_context (project_id);

-- Step 6: Set replica identity to the new PK and re-add to realtime publication
ALTER TABLE workspace_context REPLICA IDENTITY USING INDEX workspace_context_pkey;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_context;
