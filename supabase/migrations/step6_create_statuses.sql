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
