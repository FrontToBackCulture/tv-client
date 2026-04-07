-- Seed: ThinkVAL workspace + Melvin as owner
-- Run this after 001_workspace_schema.sql on the tv-gateway project

-- 1. Create Melvin's identity
insert into gateway_users (id, github_username, name, email)
values (
  'a0000000-0000-0000-0000-000000000001',
  'melvinwang',
  'Melvin Wang',
  'melvin@thinkval.com'
);

-- 2. Register the existing ThinkVAL Supabase project as a workspace
insert into workspaces (id, slug, display_name, supabase_url, supabase_anon_key, icon_emoji, color)
values (
  'b0000000-0000-0000-0000-000000000001',
  'thinkval',
  'ThinkVAL',
  'https://cqwcaeffzanfqsxlspig.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxd2NhZWZmemFuZnFzeGxzcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE2MzIsImV4cCI6MjA5MDcwNzYzMn0.4UjeZdVjB7z-_sTWP6BRqHINkpTxA6jhP6ZabvKQC_0',
  '🏢',
  '#14b8a6'
);

-- 3. Link Melvin as owner of ThinkVAL workspace
insert into workspace_memberships (user_id, workspace_id, role, is_default)
values (
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'owner',
  true
);
