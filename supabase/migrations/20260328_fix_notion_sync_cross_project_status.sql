-- Fix: When updating an existing task that was moved to a different project,
-- re-resolve the status_id against the task's actual project (not the sync config's target).
-- This prevents cross-project status_id references that cause the UI to show wrong statuses.
--
-- Root cause: All tasks sync from one Notion DB targeting "Book of Work" (BOW10).
-- When users move tasks to other projects, the next Notion sync overwrites status_id
-- with a BOW10 status UUID, which doesn't exist in the task's actual project.
-- The UI then falls back to showing "Backlog" (first status).

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
  v_resolved_status_id UUID;
  v_status_name TEXT;
BEGIN
  -- Prefer p_notion_content (page body markdown) over p_description (property field)
  v_final_description := COALESCE(p_notion_content, p_description);

  -- Check if task already exists by notion_page_id
  SELECT id, project_id, last_pushed_at INTO v_existing_id, v_existing_project_id, v_last_pushed_at
  FROM tasks
  WHERE notion_page_id = p_notion_page_id;

  IF v_existing_id IS NOT NULL THEN
    -- Skip echo: if last_pushed_at is within 60s of now, this is our own write bouncing back
    IF v_last_pushed_at IS NOT NULL AND v_last_pushed_at > (now() - interval '60 seconds') THEN
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'echo');
    END IF;

    -- If task was moved to a different project, re-resolve status_id
    -- by matching the status name in the task's actual project
    v_resolved_status_id := p_status_id;
    IF p_status_id IS NOT NULL AND v_existing_project_id IS NOT NULL
       AND v_existing_project_id != p_target_project_id THEN
      -- Get the name of the incoming status
      SELECT name INTO v_status_name FROM task_statuses WHERE id = p_status_id;
      IF v_status_name IS NOT NULL THEN
        -- Try to find a matching status in the task's actual project
        SELECT id INTO v_resolved_status_id
        FROM task_statuses
        WHERE project_id = v_existing_project_id AND lower(name) = lower(v_status_name)
        LIMIT 1;
        -- If no match found, keep the task's current status rather than setting a wrong one
        IF v_resolved_status_id IS NULL THEN
          v_resolved_status_id := NULL;
        END IF;
      END IF;
    END IF;

    -- UPDATE existing task — sync all Notion fields, never touch project_id
    UPDATE tasks SET
      title = COALESCE(p_title, title),
      status_id = COALESCE(v_resolved_status_id, status_id),
      priority = p_priority,
      description = COALESCE(v_final_description, description),
      due_date = COALESCE(p_due_date, due_date),
      assignee_id = COALESCE(p_assignee_id, assignee_id),
      company_id = COALESCE(p_company_id, company_id),
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
      created_at, updated_at
    ) VALUES (
      p_notion_page_id, p_target_project_id, v_task_number, p_title, p_status_id,
      p_priority, v_final_description, p_due_date, p_assignee_id, p_company_id,
      p_created_at, p_updated_at
    );

    v_action := 'created';
  END IF;

  RETURN jsonb_build_object('action', v_action);
END;
$$ LANGUAGE plpgsql;
