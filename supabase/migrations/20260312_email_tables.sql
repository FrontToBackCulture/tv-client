-- Email Module — 5 tables for audience management, campaigns, and tracking
-- Apply via Supabase SQL editor or MCP tool

-- ============================================================
-- Core Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS email_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_contact_groups (
  contact_id UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES email_groups(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, group_id)
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  html_body TEXT,
  group_id UUID REFERENCES email_groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  url_clicked TEXT,
  ip_address TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_email_contacts_status ON email_contacts(status);
CREATE INDEX IF NOT EXISTS idx_email_contact_groups_group ON email_contact_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_group ON email_campaigns(group_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_contact ON email_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_email_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_contacts_updated_at
  BEFORE UPDATE ON email_contacts
  FOR EACH ROW EXECUTE FUNCTION update_email_updated_at();

CREATE TRIGGER email_groups_updated_at
  BEFORE UPDATE ON email_groups
  FOR EACH ROW EXECUTE FUNCTION update_email_updated_at();

CREATE TRIGGER email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_email_updated_at();

-- ============================================================
-- RLS Policies (permissive — same as other modules)
-- ============================================================

ALTER TABLE email_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_contacts_all" ON email_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_groups_all" ON email_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_contact_groups_all" ON email_contact_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_campaigns_all" ON email_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_events_all" ON email_events FOR ALL USING (true) WITH CHECK (true);
