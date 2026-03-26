-- Enable RLS on task_assignees and add permissive policies
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_all" ON task_assignees
  FOR ALL USING (true) WITH CHECK (true);
