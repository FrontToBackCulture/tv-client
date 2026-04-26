-- Drop unused tables that backed the removed Strategy / Context / Plans UI.
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS triage_runs CASCADE;
DROP TABLE IF EXISTS triage_contexts CASCADE;
DROP TABLE IF EXISTS triage_config CASCADE;

-- Remove dead MCP tool registrations
DELETE FROM mcp_tools WHERE slug IN ('list-triage-contexts','upsert-triage-context','delete-triage-context');
