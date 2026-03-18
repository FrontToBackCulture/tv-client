INSERT INTO projects (id, name, slug, description, status, project_type, owner, intent, identifier_prefix, next_task_number, created_at, updated_at)
SELECT w.id, w.title, lower(regexp_replace(w.title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(w.id::text, 8), w.description,
  CASE w.status WHEN 'open' THEN 'planned' WHEN 'active' THEN 'active' WHEN 'in_progress' THEN 'active' WHEN 'done' THEN 'completed' WHEN 'paused' THEN 'paused' ELSE 'planned' END,
  'workspace', w.owner, w.intent, 'WS', 1, w.created_at, w.updated_at
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = w.id);
