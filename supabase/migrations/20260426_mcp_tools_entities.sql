-- Add `entities` to mcp_tools — which workspace entities the tool reads/writes
-- (e.g. companies, contacts, activities, projects, tasks, emails). Orthogonal
-- to category/subcategory and platforms. Editable in the UI; preserved across syncs.

ALTER TABLE mcp_tools
  ADD COLUMN IF NOT EXISTS entities TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Seed by slug pattern. Only fills empty rows so re-running is safe.

-- CRM
UPDATE mcp_tools SET entities = ARRAY['companies']
  WHERE entities = '{}' AND (slug LIKE '%-crm-company' OR slug LIKE '%-crm-companies');
UPDATE mcp_tools SET entities = ARRAY['contacts']
  WHERE entities = '{}' AND (slug LIKE '%-crm-contact' OR slug LIKE '%-crm-contacts');
UPDATE mcp_tools SET entities = ARRAY['activities', 'companies']
  WHERE entities = '{}' AND (slug = 'log-activity' OR slug = 'list-activities' OR slug = 'update-activity' OR slug = 'delete-activity');

-- Work
UPDATE mcp_tools SET entities = ARRAY['projects']
  WHERE entities = '{}' AND (slug LIKE '%-project' OR slug LIKE '%-projects');
UPDATE mcp_tools SET entities = ARRAY['tasks']
  WHERE entities = '{}' AND (slug LIKE '%-task' OR slug LIKE '%-tasks');
UPDATE mcp_tools SET entities = ARRAY['milestones']
  WHERE entities = '{}' AND (slug LIKE '%-milestone' OR slug LIKE '%-milestones');
UPDATE mcp_tools SET entities = ARRAY['initiatives']
  WHERE entities = '{}' AND (slug LIKE '%-initiative' OR slug LIKE '%-initiatives');
UPDATE mcp_tools SET entities = ARRAY['project_sessions']
  WHERE entities = '{}' AND slug LIKE '%-project-session%';
UPDATE mcp_tools SET entities = ARRAY['skills']
  WHERE entities = '{}' AND (slug LIKE '%-skill' OR slug LIKE '%-skills' OR slug = 'register-skill');
UPDATE mcp_tools SET entities = ARRAY['labels']
  WHERE entities = '{}' AND (slug LIKE '%-label' OR slug LIKE '%-labels');
UPDATE mcp_tools SET entities = ARRAY['users']
  WHERE entities = '{}' AND slug = 'list-users';
UPDATE mcp_tools SET entities = ARRAY['bots']
  WHERE entities = '{}' AND slug = 'list-bots';

-- Communication
UPDATE mcp_tools SET entities = ARRAY['emails']
  WHERE entities = '{}' AND (slug LIKE '%-email' OR slug LIKE '%-emails' OR slug = 'send-email' OR slug = 'list-entity-emails');
UPDATE mcp_tools SET entities = ARRAY['email_campaigns']
  WHERE entities = '{}' AND slug LIKE '%-email-campaign%';
UPDATE mcp_tools SET entities = ARRAY['email_drafts']
  WHERE entities = '{}' AND slug LIKE '%-email-draft%';
UPDATE mcp_tools SET entities = ARRAY['email_groups']
  WHERE entities = '{}' AND slug LIKE '%-email-group%';
UPDATE mcp_tools SET entities = ARRAY['discussions']
  WHERE entities = '{}' AND (slug LIKE '%-discussion' OR slug LIKE '%-discussions');
UPDATE mcp_tools SET entities = ARRAY['notifications']
  WHERE entities = '{}' AND (slug LIKE '%-notification' OR slug LIKE '%-notifications' OR slug LIKE 'mark-notification-%');
UPDATE mcp_tools SET entities = ARRAY['whatsapp_summaries']
  WHERE entities = '{}' AND (slug LIKE '%-whatsapp-summary' OR slug LIKE '%-whatsapp-summaries' OR slug = 'whatsapp-latest-date');
UPDATE mcp_tools SET entities = ARRAY['triage_contexts']
  WHERE entities = '{}' AND slug LIKE '%-triage-context%';

-- Content
UPDATE mcp_tools SET entities = ARRAY['feed_cards']
  WHERE entities = '{}' AND (slug LIKE '%-feed-card' OR slug LIKE '%-feed-cards');
UPDATE mcp_tools SET entities = ARRAY['blog_articles']
  WHERE entities = '{}' AND (slug LIKE '%-blog-article' OR slug LIKE '%-blog-articles');
UPDATE mcp_tools SET entities = ARRAY['guides']
  WHERE entities = '{}' AND (slug LIKE '%-guide' OR slug LIKE '%-guides');

-- VAL
UPDATE mcp_tools SET entities = ARRAY['domains']
  WHERE entities = '{}' AND category = 'val_sync';
UPDATE mcp_tools SET entities = ARRAY['drive_files']
  WHERE entities = '{}' AND (slug = 'list-drive-files' OR slug = 'check-all-domain-drive-files');

-- Generation
UPDATE mcp_tools SET entities = ARRAY['decks']
  WHERE entities = '{}' AND slug LIKE 'gamma-%';
UPDATE mcp_tools SET entities = ARRAY['images']
  WHERE entities = '{}' AND slug LIKE 'nanobanana-%';
UPDATE mcp_tools SET entities = ARRAY['proposals']
  WHERE entities = '{}' AND slug LIKE 'generate-proposal%';
UPDATE mcp_tools SET entities = ARRAY['order_forms']
  WHERE entities = '{}' AND slug LIKE 'generate-order-form%';

-- Registry / system
UPDATE mcp_tools SET entities = ARRAY['mcp_tools']
  WHERE entities = '{}' AND (slug = 'sync-mcp-tools' OR slug = 'list-mcp-tools');
