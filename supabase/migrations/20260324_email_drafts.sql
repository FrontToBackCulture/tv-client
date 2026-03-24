-- Email drafts for 1-to-1 transactional emails
-- Created by bot via MCP, reviewed and sent from the UI

create table if not exists email_drafts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete cascade,
  company_id uuid references crm_companies(id) on delete set null,
  to_email text not null,
  subject text not null,
  html_body text not null,
  from_name text not null default 'ThinkVAL',
  from_email text not null default 'hello@thinkval.com',
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references users(id)
);

-- Index for quick lookup by contact
create index if not exists idx_email_drafts_contact on email_drafts(contact_id) where status = 'draft';

-- RLS: allow all (internal app)
alter table email_drafts enable row level security;
drop policy if exists "email_drafts_all" on email_drafts;
create policy "email_drafts_all" on email_drafts for all using (true);
