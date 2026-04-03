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
  'https://sabrnwuhgkqfwunbrnrt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnJud3VoZ2txZnd1bmJybnJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NTE3NTQsImV4cCI6MjA4NDEyNzc1NH0.ZPUkYRsVzrFKW5jFutm7HkauRW-mkbXPyPhix4q083k',
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
