UPDATE workspace_sessions SET project_id = workspace_id WHERE project_id IS NULL AND workspace_id IN (SELECT id FROM projects);
UPDATE workspace_artifacts SET project_id = workspace_id WHERE project_id IS NULL AND workspace_id IN (SELECT id FROM projects);
UPDATE workspace_context SET project_id = workspace_id WHERE project_id IS NULL AND workspace_id IN (SELECT id FROM projects);
