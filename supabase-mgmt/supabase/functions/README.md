# Mgmt workspace edge functions

Edge functions deployed to the **mgmt Supabase project** (`tvymlwsdiowajlyeokyf`) — finance/QBO operations, separate from ThinkVAL workspace.

## Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `qbo-connect` | GET | Initiates Intuit OAuth — returns 302 to Intuit auth URL |
| `qbo-callback` | GET | Handles Intuit redirect — exchanges code for tokens, stores in `qbo_connections` |
| `qbo-sync` | POST | Pulls entities from QBO into mirror tables (invoices, bills, customers, etc.) |
| `qbo-sync-reports` | POST | Caches P&L / Balance Sheet / Cash Flow / Aged reports |

Shared helpers live in `_shared/qbo.ts` — OAuth URLs, token refresh, authenticated API client.

## Secrets required

Set in mgmt Supabase project:

```bash
supabase secrets set \
  QBO_CLIENT_ID=... \
  QBO_CLIENT_SECRET=... \
  QBO_ENVIRONMENT=sandbox \
  QBO_REDIRECT_URI=https://tvymlwsdiowajlyeokyf.supabase.co/functions/v1/qbo-callback \
  --project-ref tvymlwsdiowajlyeokyf
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the Supabase runtime.

## Deploy

```bash
cd /Users/melvinwang/Code/SkyNet/tv-client
# Each function deployed individually:
supabase functions deploy qbo-connect --project-ref tvymlwsdiowajlyeokyf --no-verify-jwt
supabase functions deploy qbo-callback --project-ref tvymlwsdiowajlyeokyf --no-verify-jwt
supabase functions deploy qbo-sync --project-ref tvymlwsdiowajlyeokyf
supabase functions deploy qbo-sync-reports --project-ref tvymlwsdiowajlyeokyf
```

Notes:
- `qbo-connect` and `qbo-callback` use `--no-verify-jwt` because they're browser-facing (user hits them directly; Intuit hits the callback). Other functions require the workspace JWT.
- Supabase CLI `functions deploy` reads from `supabase/functions/<name>` by default. For mgmt functions we need the CLI to point at `supabase/functions-mgmt/<name>` — simplest way: `cd supabase/functions-mgmt && supabase functions deploy <name> --project-ref tvymlwsdiowajlyeokyf`. Or symlink individual functions at deploy time.

## Cron (set up in Supabase dashboard → Database → Cron)

| Schedule | Function | Body |
|----------|----------|------|
| `*/30 * * * *` | qbo-sync | `{ "entity": "invoices", "triggered_by": "cron" }` |
| `0 2 * * *` | qbo-sync | `{ "entity": "all", "triggered_by": "cron" }` |
| `0 */4 * * *` | qbo-sync-reports | `{}` |

Use `since` param on incremental syncs — defaults to full sync if omitted.
