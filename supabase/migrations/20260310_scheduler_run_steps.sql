-- Per-turn token breakdown for scheduler runs
CREATE TABLE scheduler_run_steps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scheduler_runs(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  input_tokens BIGINT DEFAULT 0,
  output_tokens BIGINT DEFAULT 0,
  cache_read_tokens BIGINT DEFAULT 0,
  cache_creation_tokens BIGINT DEFAULT 0,
  tools TEXT[],
  tool_details JSONB,
  stop_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_run_steps_run_id ON scheduler_run_steps(run_id);
