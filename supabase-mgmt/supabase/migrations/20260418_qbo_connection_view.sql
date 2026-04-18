-- ============================================================================
-- qbo_connection_info — read-only view over qbo_connections, excludes tokens
-- ============================================================================
-- `qbo_connections` stays service-role-only so access/refresh tokens are never
-- exposed to the workspace client. The Finance UI queries this view to show
-- connection status / company / environment without touching secrets.
-- ============================================================================

create or replace view public.qbo_connection_info as
select
  id,
  realm_id,
  company_name,
  expires_at,
  environment,
  status,
  last_error,
  created_at,
  updated_at
from public.qbo_connections;

-- Views inherit RLS from their underlying tables by default. Make this view
-- explicitly readable to the workspace-authenticated client.
alter view public.qbo_connection_info set (security_invoker = false);
grant select on public.qbo_connection_info to authenticated, anon;
