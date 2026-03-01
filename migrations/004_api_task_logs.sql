-- API Task Logs: persist Slack-triggered skill runs to Supabase
-- Tracks /sod, /test, and other API-triggered skills with status, duration, errors

CREATE TABLE IF NOT EXISTS api_task_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill           TEXT NOT NULL,          -- e.g. "/sod", "/test"
  skill_name      TEXT NOT NULL,          -- e.g. "Morning SOD Check"
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  triggered_by    TEXT NOT NULL,          -- Slack username
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  duration_secs   NUMERIC,
  error           TEXT
);

-- Index for listing recent logs
CREATE INDEX idx_api_task_logs_started_at ON api_task_logs (started_at DESC);

-- Enable RLS (permissive for now — anon can read/write)
ALTER TABLE api_task_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to api_task_logs"
  ON api_task_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE api_task_logs;
