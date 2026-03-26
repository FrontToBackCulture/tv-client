-- WhatsApp chat summaries linked to client initiatives
-- Daily AI-generated summaries of WhatsApp group chats with clients

CREATE TABLE IF NOT EXISTS whatsapp_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  client_folder text NOT NULL,          -- e.g., "3_Clients/koi" — used for resolution
  date date NOT NULL,
  summary text NOT NULL,
  key_topics jsonb DEFAULT '[]',        -- ["bank recon setup", "Grab account"]
  action_items jsonb DEFAULT '[]',      -- ["Send DBS statement", "Follow up on NETS RID"]
  participants jsonb DEFAULT '[]',      -- ["Melvin WANG", "YC", "+65 8856 8303"]
  message_count integer DEFAULT 0,
  media_notes text,                     -- description of images/docs shared that day
  source_file text,                     -- which export file this came from
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One summary per initiative per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_summaries_initiative_date
  ON whatsapp_summaries(initiative_id, date);

-- Query by client folder (for resolution from folder path)
CREATE INDEX IF NOT EXISTS idx_whatsapp_summaries_client_folder
  ON whatsapp_summaries(client_folder, date DESC);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER whatsapp_summaries_updated_at
  BEFORE UPDATE ON whatsapp_summaries
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- RLS
ALTER TABLE whatsapp_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_summaries_select" ON whatsapp_summaries FOR SELECT USING (true);
CREATE POLICY "whatsapp_summaries_insert" ON whatsapp_summaries FOR INSERT WITH CHECK (true);
CREATE POLICY "whatsapp_summaries_update" ON whatsapp_summaries FOR UPDATE USING (true);
CREATE POLICY "whatsapp_summaries_delete" ON whatsapp_summaries FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_summaries;
