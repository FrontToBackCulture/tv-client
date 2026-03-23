-- Fix: Notion sync was creating duplicate tasks because existing_map query
-- hit the Supabase 1000-row default limit, so tasks beyond row 1000 were
-- treated as "new" and re-inserted into the TNT project.

-- Step 1: Delete duplicate notion_page_id rows, keeping the OLDEST task
-- (the one most likely to have been manually reassigned to another project).
DELETE FROM tasks
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY notion_page_id ORDER BY created_at ASC) AS rn
    FROM tasks
    WHERE notion_page_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add unique constraint so this can never happen again.
-- Nullable column: multiple NULLs are allowed, only non-null values must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_notion_page_id_unique
  ON tasks (notion_page_id)
  WHERE notion_page_id IS NOT NULL;
