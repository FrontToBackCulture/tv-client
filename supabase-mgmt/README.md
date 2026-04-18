# Mgmt Supabase project

Parallel Supabase project root for the **mgmt workspace** (`tvymlwsdiowajlyeokyf`). Holds migrations and edge functions for the finance/QBO feature, kept separate from ThinkVAL workspace schema.

## Structure

```
supabase-mgmt/
└── supabase/
    ├── config.toml          # project_id = "tvymlwsdiowajlyeokyf"
    ├── functions/
    │   ├── _shared/qbo.ts
    │   ├── qbo-connect/
    │   ├── qbo-callback/
    │   ├── qbo-sync/
    │   └── qbo-sync-reports/
    └── migrations/
        ├── 20260418_bootstrap.sql
        └── 20260418_qbo_schema.sql
```

The nested `supabase/` directory is required — Supabase CLI looks for `<cwd>/supabase/config.toml` when resolving `functions/` and `migrations/` paths.

## Deploy

```bash
cd /Users/melvinwang/Code/SkyNet/tv-client/supabase-mgmt

# First time: link to the project (creates .supabase/ state)
supabase link --project-ref tvymlwsdiowajlyeokyf

# Deploy functions
supabase functions deploy qbo-connect
supabase functions deploy qbo-callback
supabase functions deploy qbo-sync
supabase functions deploy qbo-sync-reports

# Push migrations (when ready to automate; for now, apply via SQL editor)
# supabase db push
```

`verify_jwt = false` for `qbo-connect` and `qbo-callback` is set in `config.toml` (browser-facing).

## Secrets

Set once on the mgmt project (from any directory):

```bash
supabase secrets set \
  QBO_CLIENT_ID=... \
  QBO_CLIENT_SECRET=... \
  QBO_ENVIRONMENT=sandbox \
  QBO_REDIRECT_URI=https://tvymlwsdiowajlyeokyf.supabase.co/functions/v1/qbo-callback \
  --project-ref tvymlwsdiowajlyeokyf
```

See `supabase/functions/README.md` — wait, moved here. Check each function folder for details.

## Running migrations

Until `supabase db push` is wired up (needs `supabase link` first), apply migrations manually:
- https://supabase.com/dashboard/project/tvymlwsdiowajlyeokyf/sql/new
