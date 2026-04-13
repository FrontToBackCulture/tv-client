-- RPCs powering the Background Sync settings panel (BackgroundSyncView.tsx).
-- Created ad-hoc in the ThinkVAL workspace; committing here so every workspace gets them.

CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE(jobname text, schedule text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
  SELECT j.jobname::text, j.schedule::text, j.active
  FROM cron.job j
  ORDER BY j.jobname;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cron_jobs() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_sync_run_history(max_rows integer DEFAULT 200)
RETURNS TABLE(
  source text,
  job_name text,
  status text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_secs numeric,
  details jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
  -- Server-side cron runs
  SELECT
    'server' as source,
    j.jobname as job_name,
    d.status,
    CASE WHEN d.status = 'failed' THEN d.return_message ELSE null END as error,
    d.start_time as started_at,
    d.end_time as completed_at,
    EXTRACT(EPOCH FROM (d.end_time - d.start_time))::numeric as duration_secs,
    null::jsonb as details
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid

  UNION ALL

  -- Local client runs (all triggers)
  SELECT
    'local' as source,
    jr.job_name,
    jr.status,
    jr.error,
    jr.started_at,
    jr.finished_at as completed_at,
    jr.duration_secs::numeric,
    null::jsonb as details
  FROM job_runs jr

  UNION ALL

  -- VAL sync runs (detailed server-side)
  SELECT
    'server-detail' as source,
    vsr.sync_type as job_name,
    vsr.status,
    vsr.error,
    vsr.started_at,
    vsr.completed_at,
    EXTRACT(EPOCH FROM (vsr.completed_at - vsr.started_at))::numeric as duration_secs,
    vsr.details
  FROM val_sync_runs vsr

  ORDER BY started_at DESC
  LIMIT max_rows;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sync_run_history(integer) TO anon, authenticated, service_role;
