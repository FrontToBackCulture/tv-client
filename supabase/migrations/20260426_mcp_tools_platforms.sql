-- Add `platforms` to mcp_tools — which external system(s) the tool talks to
-- (e.g. supabase, val, qbo, apollo, gamma, nanobanana, microsoft_graph).
-- Editable in the UI; preserved across syncs.

ALTER TABLE mcp_tools
  ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Seed obvious cases by name prefix. Only fills empty rows so re-running is safe.
UPDATE mcp_tools SET platforms = ARRAY['quickbooks']
  WHERE platforms = '{}' AND slug LIKE 'qbo-%';

UPDATE mcp_tools SET platforms = ARRAY['quickbooks']
  WHERE platforms = '{}' AND slug LIKE 'fy-%';

UPDATE mcp_tools SET platforms = ARRAY['apollo']
  WHERE platforms = '{}' AND slug LIKE 'apollo-%';

UPDATE mcp_tools SET platforms = ARRAY['gamma']
  WHERE platforms = '{}' AND slug LIKE 'gamma-%';

UPDATE mcp_tools SET platforms = ARRAY['nanobanana']
  WHERE platforms = '{}' AND slug LIKE 'nanobanana-%';

UPDATE mcp_tools SET platforms = ARRAY['val']
  WHERE platforms = '{}' AND category = 'val_sync';

UPDATE mcp_tools SET platforms = ARRAY['intercom']
  WHERE platforms = '{}' AND (slug LIKE 'list-intercom-%' OR slug = 'publish-to-intercom');

UPDATE mcp_tools SET platforms = ARRAY['supabase']
  WHERE platforms = '{}' AND category IN ('crm', 'work');
