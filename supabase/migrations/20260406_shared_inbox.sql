-- Shared Inbox: multi-mailbox shared email viewer
-- Allows admins to connect Outlook mailboxes visible to all workspace users

-- 1. Shared mailboxes (client-readable metadata)
CREATE TABLE IF NOT EXISTS shared_mailboxes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  email_address TEXT      NOT NULL UNIQUE,
  active      BOOLEAN     NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT
);

ALTER TABLE shared_mailboxes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "shared_mailboxes_select" ON shared_mailboxes
  FOR SELECT USING (true);

-- Only service role writes (Edge Functions)
-- No INSERT/UPDATE/DELETE policy for anon/authenticated

-- 2. Shared mailbox credentials (service-role only, never exposed to clients)
CREATE TABLE IF NOT EXISTS shared_mailbox_credentials (
  mailbox_id              UUID PRIMARY KEY REFERENCES shared_mailboxes(id) ON DELETE CASCADE,
  refresh_token           TEXT NOT NULL,
  access_token            TEXT,
  access_token_expires_at TIMESTAMPTZ,
  delta_link              TEXT,
  tenant_id               TEXT,
  client_id               TEXT,
  client_secret           TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shared_mailbox_credentials ENABLE ROW LEVEL SECURITY;

-- Deny all client access — only service role can touch this
-- (no policies = deny by default with RLS enabled)

-- 3. Shared emails
CREATE TABLE IF NOT EXISTS shared_emails (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id       UUID        NOT NULL REFERENCES shared_mailboxes(id) ON DELETE CASCADE,
  graph_message_id TEXT        NOT NULL,
  conversation_id  TEXT,
  subject          TEXT,
  from_name        TEXT,
  from_email       TEXT,
  to_addresses     JSONB,
  cc_addresses     JSONB,
  received_at      TIMESTAMPTZ,
  preview          TEXT,
  body_html        TEXT,
  has_attachments  BOOLEAN     NOT NULL DEFAULT false,
  importance       TEXT,
  is_read_in_source BOOLEAN   NOT NULL DEFAULT false,
  web_link         TEXT,
  raw              JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, graph_message_id)
);

ALTER TABLE shared_emails ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "shared_emails_select" ON shared_emails
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_emails_mailbox_received
  ON shared_emails (mailbox_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_emails_from
  ON shared_emails (from_email);

CREATE INDEX IF NOT EXISTS idx_shared_emails_conversation
  ON shared_emails (conversation_id);

-- Enable realtime for shared_emails (live updates in UI)
ALTER PUBLICATION supabase_realtime ADD TABLE shared_emails;
