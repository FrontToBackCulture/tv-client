-- ============================================================================
-- Bootstrap — mgmt Supabase project
-- ============================================================================
-- Defines shared primitives used by all subsequent migrations:
--   * update_updated_at() trigger function
--
-- Run against: https://tvymlwsdiowajlyeokyf.supabase.co
-- ============================================================================

-- Trigger function: auto-update `updated_at` column on any row update.
-- Matches the convention used in the ThinkVAL workspace project.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

comment on function public.update_updated_at() is
  'Trigger function — sets updated_at to now() on row update. Attach via BEFORE UPDATE trigger.';
