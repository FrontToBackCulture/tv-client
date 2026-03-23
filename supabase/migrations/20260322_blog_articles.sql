-- Blog articles table for tv-website blog management
create table if not exists blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  content text,
  category text,
  author text default 'ThinkVAL Team',
  read_time text,
  color text default '#EEF8F9',
  illustration text,
  featured boolean default false,
  status text default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create extension if not exists moddatetime schema extensions;

create or replace trigger blog_articles_updated_at
  before update on blog_articles
  for each row execute function extensions.moddatetime(updated_at);

-- Auto-set published_at when status changes to published
create or replace function blog_set_published_at()
returns trigger as $$
begin
  if NEW.status = 'published' and (OLD.status is null or OLD.status != 'published') then
    NEW.published_at = now();
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger blog_articles_set_published_at
  before insert or update on blog_articles
  for each row execute function blog_set_published_at();

-- RLS
alter table blog_articles enable row level security;

create policy "blog_articles_read" on blog_articles
  for select using (true);

create policy "blog_articles_write" on blog_articles
  for all using (true);

-- Add to realtime publication
alter publication supabase_realtime add table blog_articles;

-- Index for common queries
create index blog_articles_status_idx on blog_articles (status);
create index blog_articles_published_at_idx on blog_articles (published_at desc);
