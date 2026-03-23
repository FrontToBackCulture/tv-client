-- Add notion_content column to tasks (stores page body as markdown)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notion_content text;

-- Create task_attachments table for Notion file/image references
CREATE TABLE IF NOT EXISTS task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text,                    -- mime type or extension
  source text NOT NULL DEFAULT 'notion',  -- notion | upload | claude
  notion_block_id text,              -- traces back to Notion block
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup by task
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);

-- RLS policies
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_attachments_select" ON task_attachments FOR SELECT USING (true);
CREATE POLICY "task_attachments_insert" ON task_attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "task_attachments_update" ON task_attachments FOR UPDATE USING (true);
CREATE POLICY "task_attachments_delete" ON task_attachments FOR DELETE USING (true);
