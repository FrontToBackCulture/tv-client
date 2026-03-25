-- RPC function for atomic Notion task sync.
-- INSERT if notion_page_id doesn't exist, UPDATE (without touching project_id) if it does.
-- Handles task_number allocation atomically via next_task_number on projects table.

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
  v_task_number INT;
  v_action TEXT;
BEGIN
  -- Check if task already exists by notion_page_id (globally, regardless of project)
  SELECT id, project_id INTO v_existing_id, v_existing_project_id
  FROM tasks
  WHERE notion_page_id = p_notion_page_id;

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE existing task — sync all Notion fields, never touch project_id
    UPDATE tasks SET
      title = COALESCE(p_title, title),
      status_id = COALESCE(p_status_id, status_id),
      priority = p_priority,
      description = COALESCE(p_description, description),
      due_date = COALESCE(p_due_date, due_date),
      assignee_id = COALESCE(p_assignee_id, assignee_id),
      company_id = COALESCE(p_company_id, company_id),
      notion_content = COALESCE(p_notion_content, notion_content),
      created_at = COALESCE(p_created_at, created_at),
      updated_at = COALESCE(p_updated_at, updated_at)
    WHERE id = v_existing_id;

    v_action := 'updated';
  ELSE
    -- Atomically allocate next task_number
    UPDATE projects
    SET next_task_number = COALESCE(next_task_number, 1) + 1
    WHERE id = p_target_project_id
    RETURNING COALESCE(next_task_number - 1, 1) INTO v_task_number;

    -- INSERT new task with project_id
    INSERT INTO tasks (
      notion_page_id, project_id, task_number, title, status_id,
      priority, description, due_date, assignee_id, company_id,
      notion_content, created_at, updated_at
    ) VALUES (
      p_notion_page_id, p_target_project_id, v_task_number, p_title, p_status_id,
      p_priority, p_description, p_due_date, p_assignee_id, p_company_id,
      p_notion_content, p_created_at, p_updated_at
    );

    v_action := 'created';
  END IF;

  RETURN jsonb_build_object('action', v_action);
END;
$$ LANGUAGE plpgsql;
