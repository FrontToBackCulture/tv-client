-- Gateway migration: Supabase Auth integration + permission groups
-- Apply to the tv-gateway Supabase project (tccyronrnsimacqfhxzd)
--
-- Prerequisites:
--   1. Enable GitHub + Azure providers in Supabase Auth dashboard
--   2. Add redirect URLs: http://localhost:4002/callback, http://localhost:4003/callback

-- ── 1. Add auth_uid to gateway_users ─────────────────────────────────────────
-- Links the Supabase Auth user (auth.users.id) to our gateway_users identity.
alter table gateway_users add column if not exists auth_uid uuid unique;

-- ── 2. Add permission_groups to workspace_memberships ────────────────────────
-- Controls fine-grained access within a workspace (e.g., "finance", "hr").
-- Default is ["general"] — everyone gets basic access.
alter table workspace_memberships
  add column if not exists permission_groups text[] default '{general}';

-- ── 3. Auto-link auth.users to gateway_users on sign-up ─────────────────────
-- When a user signs in via Supabase Auth, we link their auth.uid to the
-- matching gateway_users row (matched by email or GitHub username).
create or replace function link_auth_to_gateway_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gw_user_id uuid;
begin
  -- Try matching by email first (covers Microsoft + GitHub with public email)
  select id into gw_user_id
  from gateway_users
  where (microsoft_email = new.email or email = new.email)
    and auth_uid is null
  limit 1;

  -- If no match by email, try GitHub username from raw_user_meta_data
  if gw_user_id is null and new.raw_user_meta_data->>'user_name' is not null then
    select id into gw_user_id
    from gateway_users
    where github_username = new.raw_user_meta_data->>'user_name'
      and auth_uid is null
    limit 1;
  end if;

  -- Link if found
  if gw_user_id is not null then
    update gateway_users set auth_uid = new.id where id = gw_user_id;
  end if;

  return new;
end;
$$;

-- Trigger on auth.users insert (new sign-up or first OAuth login)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function link_auth_to_gateway_user();

-- ── 4. Also handle re-login (update) — link if not yet linked ───────────────
create or replace function link_auth_on_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gw_user_id uuid;
begin
  -- Skip if already linked
  if exists (select 1 from gateway_users where auth_uid = new.id) then
    return new;
  end if;

  select id into gw_user_id
  from gateway_users
  where (microsoft_email = new.email or email = new.email)
    and auth_uid is null
  limit 1;

  if gw_user_id is null and new.raw_user_meta_data->>'user_name' is not null then
    select id into gw_user_id
    from gateway_users
    where github_username = new.raw_user_meta_data->>'user_name'
      and auth_uid is null
    limit 1;
  end if;

  if gw_user_id is not null then
    update gateway_users set auth_uid = new.id where id = gw_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update on auth.users
  for each row execute function link_auth_on_login();

-- ── 5. Replace permissive RLS policies with auth-based ones ──────────────────

-- Drop old permissive policies
drop policy if exists "anon_read_users" on gateway_users;
drop policy if exists "anon_write_users" on gateway_users;
drop policy if exists "anon_read_workspaces" on workspaces;
drop policy if exists "anon_read_memberships" on workspace_memberships;
drop policy if exists "anon_read_settings" on workspace_settings;

-- gateway_users: authenticated users can read their own record
create policy "read_own_user" on gateway_users
  for select using (auth_uid = auth.uid());

-- gateway_users: service_role can manage all (for admin + Edge Functions)
-- (service_role bypasses RLS by default, so no explicit policy needed)

-- workspaces: authenticated users can read workspaces they're a member of
create policy "read_member_workspaces" on workspaces
  for select using (
    id in (
      select wm.workspace_id
      from workspace_memberships wm
      join gateway_users gu on gu.id = wm.user_id
      where gu.auth_uid = auth.uid()
    )
  );

-- workspace_memberships: users can read their own memberships
create policy "read_own_memberships" on workspace_memberships
  for select using (
    user_id = (select id from gateway_users where auth_uid = auth.uid())
  );

-- workspace_settings: users can read settings for workspaces they belong to
-- (excludes sensitive keys like jwt_secret — those are only for Edge Functions via service_role)
create policy "read_workspace_settings" on workspace_settings
  for select using (
    key not in ('jwt_secret')
    and workspace_id in (
      select wm.workspace_id
      from workspace_memberships wm
      join gateway_users gu on gu.id = wm.user_id
      where gu.auth_uid = auth.uid()
    )
  );

-- ── 6. Backfill: give Melvin finance + admin permissions ─────────────────────
update workspace_memberships
set permission_groups = '{general,finance,admin}'
where user_id = 'a0000000-0000-0000-0000-000000000001';

-- ── 7. Index for auth_uid lookups ────────────────────────────────────────────
create index if not exists idx_gateway_users_auth_uid on gateway_users(auth_uid);
