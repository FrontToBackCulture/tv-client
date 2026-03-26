-- Drop the unused emails table and its orphaned scan RPC
--
-- The emails table was designed as a Supabase-side store but the sync pipeline
-- never writes to it — emails live in local SQLite, and email_entity_links +
-- email_cache are the live mechanism.
--
-- The company_id column would also corrupt multi-user data (second user's sync
-- silently overwrites the first user's company link).
--
-- email_entity_links is NOT dropped — it is the working link table.

DROP FUNCTION IF EXISTS scan_emails_for_entity(text, uuid);

DROP TABLE IF EXISTS emails CASCADE;
