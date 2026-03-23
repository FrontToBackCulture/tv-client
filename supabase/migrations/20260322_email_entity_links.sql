-- Email correspondence metadata table
-- Stores metadata for business emails (source of truth remains markdown files)
-- ~20K emails synced from Outlook via index.json

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  outlook_id text unique,                    -- original Outlook message ID
  conversation_id text,                      -- Outlook conversation thread ID
  subject text,
  from_email text not null,
  from_name text,
  to_emails jsonb default '[]',              -- array of email addresses
  cc_emails jsonb default '[]',
  received_at timestamptz,
  is_read boolean default false,
  has_attachments boolean default false,
  folder text,                               -- Inbox, Sent, etc.
  file_path text,                            -- relative path to markdown file in tv-knowledge
  body_preview text,                         -- first ~200 chars for search/display

  -- classification (from AI triage)
  classification_category text,              -- client, vendor, noise, etc.
  classification_confidence float,
  action_required boolean default false,
  urgency text,                              -- low, medium, high

  -- linking to CRM entities (denormalized for fast queries)
  company_id uuid references crm_companies(id) on delete set null,
  contact_id uuid references crm_contacts(id) on delete set null,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for common queries
create index idx_emails_from on emails(from_email);
create index idx_emails_received on emails(received_at desc);
create index idx_emails_company on emails(company_id) where company_id is not null;
create index idx_emails_contact on emails(contact_id) where contact_id is not null;
create index idx_emails_conversation on emails(conversation_id);
create index idx_emails_classification on emails(classification_category);

-- Polymorphic junction table linking emails (correspondence or campaigns) to projects/tasks
create table if not exists email_entity_links (
  id uuid primary key default gen_random_uuid(),
  email_type text not null check (email_type in ('correspondence', 'campaign')),
  email_id uuid not null,                    -- FK to emails (correspondence) or email_campaigns (campaign)
  entity_type text not null check (entity_type in ('project', 'task')),
  entity_id uuid not null,
  match_method text,                         -- how the link was created
  relevance_score float,                     -- 0-1 confidence score for auto matches
  created_at timestamptz default now(),

  unique(email_type, email_id, entity_type, entity_id)
);

-- match_method values:
--   'auto_domain'   — matched via company domain
--   'auto_contact'  — matched via contact email address
--   'auto_keyword'  — matched via subject/content keywords
--   'auto_thread'   — matched because another email in same thread is linked
--   'manual'        — user explicitly attached

create index idx_eel_entity on email_entity_links(entity_type, entity_id);
create index idx_eel_email on email_entity_links(email_type, email_id);
create index idx_eel_method on email_entity_links(match_method);

-- RLS (permissive, consistent with other tables)
alter table emails enable row level security;
create policy "emails_all" on emails for all using (true) with check (true);

alter table email_entity_links enable row level security;
create policy "email_entity_links_all" on email_entity_links for all using (true) with check (true);

-- Updated_at trigger for emails
create or replace function update_emails_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger emails_updated_at
  before update on emails
  for each row execute function update_emails_updated_at();
