-- Scheduler run history table
-- Stores execution results from scheduler jobs for analytics (cost, tokens, duration)

CREATE TABLE IF NOT EXISTS scheduler_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_secs NUMERIC(10,2),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  output TEXT,
  output_preview TEXT,
  error TEXT,
  slack_posted BOOLEAN DEFAULT false,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual')),
  cost_usd NUMERIC(10,6),
  input_tokens BIGINT,
  output_tokens BIGINT,
  cache_read_tokens BIGINT,
  cache_creation_tokens BIGINT,
  num_turns INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduler_runs_job_id ON scheduler_runs(job_id);
CREATE INDEX idx_scheduler_runs_started ON scheduler_runs(started_at DESC);

ALTER TABLE scheduler_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON scheduler_runs FOR ALL USING (true) WITH CHECK (true);
