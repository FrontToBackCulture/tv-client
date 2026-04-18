# Mgmt workspace migrations

Migrations for the **mgmt Supabase project** (`tvymlwsdiowajlyeokyf`) — finance/QBO data, separate from ThinkVAL workspace.

- **Project ref:** `tvymlwsdiowajlyeokyf`
- **URL:** https://tvymlwsdiowajlyeokyf.supabase.co
- **Consumed by:** tv-client (Finance module, Phase 4+)
- **Source of truth for books:** QuickBooks Online (mirror only)

## How to apply

Until we link the Supabase CLI to this project, migrations are run manually via the SQL editor:
https://supabase.com/dashboard/project/tvymlwsdiowajlyeokyf/sql/new

File naming: `YYYYMMDD_description.sql` — same convention as `../migrations/`.
