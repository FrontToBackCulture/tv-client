-- Gateway migration: Role-based specialist bots
-- Apply to the tv-gateway Supabase project (tccyronrnsimacqfhxzd)
--
-- New bots: bot-sales, bot-delivery, bot-builder, bot-domain
-- These replace the per-user generalist pattern with role-based specialists.

-- ── 1. Create gateway_users for new bots ────────────────────────────────────
INSERT INTO gateway_users (id, name, email) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'bot-sales', 'bot-sales@thinkval.com'),
  ('c2000000-0000-0000-0000-000000000002', 'bot-delivery', 'bot-delivery@thinkval.com'),
  ('c2000000-0000-0000-0000-000000000003', 'bot-builder', 'bot-builder@thinkval.com'),
  ('c2000000-0000-0000-0000-000000000004', 'bot-domain', 'bot-domain@thinkval.com');

-- ── 2. Link bots to ThinkVAL workspace with general permissions ─────────────
INSERT INTO workspace_memberships (user_id, workspace_id, role, is_default, permission_groups) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'member', true, '{general}'),
  ('c2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'member', true, '{general}'),
  ('c2000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'member', true, '{general}'),
  ('c2000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'member', true, '{general}');

-- ── 3. Insert bot API keys (hashed) ─────────────────────────────────────────
INSERT INTO bot_api_keys (key_hash, gateway_user_id, bot_name) VALUES
  (encode(digest('tvbot_d343bcded4698f7b56851b6ae8e542e47730b5dd73648b2c', 'sha256'), 'hex'),
   'c2000000-0000-0000-0000-000000000001', 'bot-sales'),
  (encode(digest('tvbot_48b0ab51be815ab4dcb68926ef3780bfe9924fce972e05fe', 'sha256'), 'hex'),
   'c2000000-0000-0000-0000-000000000002', 'bot-delivery'),
  (encode(digest('tvbot_9aff099900ad373e97fc2a171086c88042a85608e5c03a83', 'sha256'), 'hex'),
   'c2000000-0000-0000-0000-000000000003', 'bot-builder'),
  (encode(digest('tvbot_8a8d3e585777b312be89511b56b1c63687256eaa3b9d14fd', 'sha256'), 'hex'),
   'c2000000-0000-0000-0000-000000000004', 'bot-domain');
