-- Ensure PostgREST schema cache is reloaded after DDL changes.
-- Supabase hosted auto-reloads on most changes, but this acts as a safety net
-- for edge cases (e.g., column renames, FK changes, RLS policy updates).

-- Create an event trigger that fires NOTIFY pgrst after any DDL statement.
-- This ensures PostgREST immediately picks up schema changes instead of
-- waiting for its polling interval.

CREATE OR REPLACE FUNCTION pgrst_ddl_watch() RETURNS event_trigger AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any (idempotent)
DROP EVENT TRIGGER IF EXISTS pgrst_ddl_watcher;

-- Fire on all DDL commands that could affect schema
CREATE EVENT TRIGGER pgrst_ddl_watcher
  ON ddl_command_end
  EXECUTE FUNCTION pgrst_ddl_watch();
