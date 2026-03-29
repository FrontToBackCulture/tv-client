-- Teams and team membership (many-to-many with users)

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  color text not null default '#6B7280',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index idx_team_members_user on public.team_members(user_id);
create index idx_team_members_team on public.team_members(team_id);

-- Seed starter teams
insert into public.teams (name, slug, color) values
  ('Sales', 'sales', '#D97706'),
  ('Engineering', 'engineering', '#2563EB'),
  ('Analyst', 'analyst', '#059669')
on conflict (slug) do nothing;

-- RLS
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "teams_select" on public.teams for select using (true);
create policy "teams_insert" on public.teams for insert with check (true);
create policy "teams_update" on public.teams for update using (true);
create policy "teams_delete" on public.teams for delete using (true);

create policy "team_members_select" on public.team_members for select using (true);
create policy "team_members_insert" on public.team_members for insert with check (true);
create policy "team_members_delete" on public.team_members for delete using (true);
