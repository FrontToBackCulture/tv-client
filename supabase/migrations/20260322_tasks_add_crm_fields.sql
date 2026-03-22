-- Add CRM association fields to tasks
-- Allows tasks to be linked to companies and contacts without creating deal projects

-- Add company_id (optional FK to crm_companies)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES crm_companies(id);

-- Add contact_id (optional FK to crm_contacts)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES crm_contacts(id);

-- Add task_type as text (not enum, for Supabase JS client compatibility)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'general';

-- Track when task_type last changed (for "days in stage" metric)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type_changed_at timestamptz;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks (task_type) WHERE task_type IS NOT NULL;
