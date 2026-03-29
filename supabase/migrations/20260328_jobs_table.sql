-- Jobs table: persists job definitions (scheduled + ad-hoc) to Supabase
-- Replaces local ~/.tv-desktop/scheduler/jobs.json

-- 1. Create the jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skill_prompt TEXT NOT NULL,
  cron_expression TEXT,                -- NULL = ad-hoc only, not scheduled
  model TEXT NOT NULL DEFAULT 'sonnet',
  max_budget NUMERIC(10,2),
  allowed_tools TEXT[] DEFAULT '{}',
  slack_webhook_url TEXT,
  slack_channel_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  generate_report BOOLEAN NOT NULL DEFAULT false,
  report_prefix TEXT,
  skill_refs JSONB,                    -- [{bot, slug, title}] or null
  bot_path TEXT,
  sod_reports_folder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('running', 'success', 'failed'))
);

CREATE INDEX idx_jobs_enabled ON jobs(enabled);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- 2. Rename scheduler_runs → job_runs
ALTER TABLE scheduler_runs RENAME TO job_runs;

-- Update indexes
ALTER INDEX idx_scheduler_runs_job_id RENAME TO idx_job_runs_job_id;
ALTER INDEX idx_scheduler_runs_started RENAME TO idx_job_runs_started;

-- 3. Rename scheduler_run_steps → job_run_steps
ALTER TABLE scheduler_run_steps RENAME TO job_run_steps;

-- Update indexes
ALTER INDEX idx_run_steps_run_id RENAME TO idx_job_run_steps_run_id;

-- 4. Make job_id nullable for orphaned runs, then add FK as NOT VALID
--    (NOT VALID skips checking existing rows — old runs may reference jobs not yet migrated)
ALTER TABLE job_runs ALTER COLUMN job_id DROP NOT NULL;

ALTER TABLE job_runs
  ADD CONSTRAINT fk_job_runs_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL NOT VALID;
