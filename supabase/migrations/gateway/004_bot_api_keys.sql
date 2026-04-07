-- Gateway migration: Bot API keys for per-bot JWT minting
-- Apply to the tv-gateway Supabase project (tccyronrnsimacqfhxzd)
--
-- Each bot gets a unique API key. The key determines identity and permissions.
-- Keys are stored as SHA-256 hashes — the raw key lives only in the bot's MCP config.

-- ── 1. Create bot_api_keys table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,           -- SHA-256 of the raw API key
  gateway_user_id uuid NOT NULL REFERENCES gateway_users(id) ON DELETE CASCADE,
  bot_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

-- RLS: only service_role can access (Edge Functions)
ALTER TABLE bot_api_keys ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role can read/write (which is what we want)

-- Index for key lookup
CREATE INDEX IF NOT EXISTS idx_bot_api_keys_hash ON bot_api_keys(key_hash);

-- ── 2. Insert bot API keys (hashed) ──────────────────────────────────────────
INSERT INTO bot_api_keys (key_hash, gateway_user_id, bot_name) VALUES
  (encode(digest('tvbot_46aaa35ebeb89520985e1c5391d6d8fe1cb15c55aa355330', 'sha256'), 'hex'),
   'c1000000-0000-0000-0000-000000000001', 'bot-mel'),
  (encode(digest('tvbot_09c7372806284fd3f952604565bda02d9ec9b28dd21caa47', 'sha256'), 'hex'),
   'c1000000-0000-0000-0000-000000000002', 'bot-darren'),
  (encode(digest('tvbot_84a7b84f7ca54e44b61b3f89e37fad9d995e9cad4f51b04d', 'sha256'), 'hex'),
   'c1000000-0000-0000-0000-000000000003', 'bot-gene'),
  (encode(digest('tvbot_b4ea509d7259d7d6da07a6592455714bae3b504e4d1abd19', 'sha256'), 'hex'),
   'c1000000-0000-0000-0000-000000000004', 'bot-gloria'),
  (encode(digest('tvbot_3c8fc5e06a68a8b45fd5ce3ea78ab092254c5885e3cb94a2', 'sha256'), 'hex'),
   'c1000000-0000-0000-0000-000000000005', 'bot-siti'),
  (encode(digest('tvbot_a35574faffec8aaf4e90695b3dd34a87ad7bf01fb2fd04a9', 'sha256'), 'hex'),
   'c1000000-0000-0000-0000-000000000006', 'bot-yc'),
  (encode(digest('tvbot_9d2ae5b7b78288f48e89007be692695183c6d5d8a24b0744', 'sha256'), 'hex'),
   'c0000000-0000-0000-0000-000000000001', 'bot-mgmt-mel');

-- ── 3. Ensure pgcrypto extension is available (for digest function) ──────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
