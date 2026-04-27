-- Per-reply metrics from the Agent SDK sidecar (cost, tokens, duration, model).
-- Populated only on bot replies that go through the SDK; null for everything else.
-- Stored as JSONB so we can extend (cache breakdowns, model id, etc.) without migrations.

ALTER TABLE discussions
  ADD COLUMN IF NOT EXISTS agent_metrics JSONB;
