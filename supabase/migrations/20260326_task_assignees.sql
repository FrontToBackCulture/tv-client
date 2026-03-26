-- Multi-assignee support: junction table replaces tasks.assignee_id
--
-- 1. Create task_assignees junction table
-- 2. Migrate existing assignee_id data
-- 3. Drop assignee_id column
-- 4. Replace sync_notion_task RPC to write to junction table

-- Step 1: Create task_assignees junction table
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees (user_id);

-- Step 2: Migrate existing assignee_id data into task_assignees
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id
FROM tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 3: Drop assignee_id from tasks
ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_id;

-- Step 4: Replace sync_notion_task RPC — write assignee to task_assignees
CREATE OR REPLACE FUNCTION sync_notion_task(
  p_notion_page_id TEXT,
  p_target_project_id UUID,
  p_title TEXT,
  p_status_id UUID DEFAULT NULL,
  p_priority INT DEFAULT 0,
  p_description TEXT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_notion_content TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL,
  p_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing_id UUID;
  v_existing_project_id UUID;
  v_last_pushed_at TIMESTAMPTZ;
  v_task_number INT;
  v_action TEXT;
  v_final_description TEXT;
BEGIN
  v_final_description := COALESCE(p_notion_content, p_description);

  SELECT id, project_id, last_pushed_at INTO v_existing_id, v_existing_project_id, v_last_pushed_at
  FROM tasks
  WHERE notion_page_id = p_notion_page_id;

  IF v_existing_id IS NOT NULL THEN
    IF v_last_pushed_at IS NOT NULL AND v_last_pushed_at > (now() - interval '60 seconds') THEN
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'echo');
    END IF;

    UPDATE tasks SET
      title       = COALESCE(p_title, title),
      status_id   = COALESCE(p_status_id, status_id),
      priority    = p_priority,
      description = COALESCE(v_final_description, description),
      due_date    = COALESCE(p_due_date, due_date),
      company_id  = COALESCE(p_company_id, company_id),
      created_at  = COALESCE(p_created_at, created_at),
      updated_at  = COALESCE(p_updated_at, updated_at)
    WHERE id = v_existing_id;

    -- Sync assignee: replace existing if a new one is provided
    IF p_assignee_id IS NOT NULL THEN
      DELETE FROM task_assignees WHERE task_id = v_existing_id;
      INSERT INTO task_assignees (task_id, user_id)
      VALUES (v_existing_id, p_assignee_id)
      ON CONFLICT DO NOTHING;
    END IF;

    v_action := 'updated';
  ELSE
    UPDATE projects
    SET next_task_number = COALESCE(next_task_number, 1) + 1
    WHERE id = p_target_project_id
    RETURNING COALESCE(next_task_number - 1, 1) INTO v_task_number;

    INSERT INTO tasks (
      notion_page_id, project_id, task_number, title, status_id,
      priority, description, due_date, company_id,
      created_at, updated_at
    ) VALUES (
      p_notion_page_id, p_target_project_id, v_task_number, p_title, p_status_id,
      p_priority, v_final_description, p_due_date, p_company_id,
      p_created_at, p_updated_at
    )
    RETURNING id INTO v_existing_id;

    IF p_assignee_id IS NOT NULL THEN
      INSERT INTO task_assignees (task_id, user_id)
      VALUES (v_existing_id, p_assignee_id)
      ON CONFLICT DO NOTHING;
    END IF;

    v_action := 'created';
  END IF;

  RETURN jsonb_build_object('action', v_action);
END;
$$ LANGUAGE plpgsql;
