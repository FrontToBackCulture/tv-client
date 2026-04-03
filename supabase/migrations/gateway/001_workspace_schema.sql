-- Gateway schema: workspace discovery and user identity
-- Apply this to the tv-gateway Supabase project (NOT the main tv-client project)

-- ── Users ────────────────────────────────────────────────────────────────────
-- Canonical identity, linked to OAuth providers. One row per person.
create table gateway_users (
  id uuid primary key default gen_random_uuid(),
  github_username text unique,
  github_id bigint,
  microsoft_email text unique,
  microsoft_id text,
  name text not null,
  email text,
  avatar_url text,
  created_at timestamptz default now(),
  last_login_at timestamptz
);

-- ── Workspaces ───────────────────────────────────────────────────────────────
-- Each row = one Supabase project. The app connects to whichever one the user
-- selects.
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  supabase_url text not null,
  supabase_anon_key text not null,
  icon_emoji text default '🏢',
  color text default '#14b8a6',
  created_at timestamptz default now()
);

-- ── Memberships ──────────────────────────────────────────────────────────────
-- Who can access what. RLS filters on this.
create table workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references gateway_users(id) on delete cascade not null,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  is_default boolean default false,
  created_at timestamptz default now(),
  unique(user_id, workspace_id)
);

-- ── Per-workspace settings ───────────────────────────────────────────────────
-- API keys and other settings that differ between workspaces.
-- These get pushed to Tauri settings.json on workspace switch.
create table workspace_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  key text not null,
  value text not null,
  unique(workspace_id, key)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index idx_memberships_user on workspace_memberships(user_id);
create index idx_memberships_workspace on workspace_memberships(workspace_id);
create index idx_settings_workspace on workspace_settings(workspace_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- NOTE: Gateway uses anon key access (no Supabase Auth), so RLS policies are
-- placeholder for now. When gateway auth is added, these should filter by
-- auth.uid(). For the initial single-user setup, we enable RLS but allow
-- all access via anon key.

alter table gateway_users enable row level security;
alter table workspaces enable row level security;
alter table workspace_memberships enable row level security;
alter table workspace_settings enable row level security;

-- Permissive policies for anon access (single-user bootstrap)
create policy "anon_read_users" on gateway_users for select using (true);
create policy "anon_write_users" on gateway_users for all using (true);
create policy "anon_read_workspaces" on workspaces for select using (true);
create policy "anon_read_memberships" on workspace_memberships for select using (true);
create policy "anon_read_settings" on workspace_settings for select using (true);
