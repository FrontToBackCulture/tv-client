import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Gateway Supabase client — singleton, never changes.
//
// The gateway project handles authentication and workspace discovery only.
// It stores: gateway_users, workspaces, workspace_memberships, workspace_settings.
// It does NOT store any business or personal data.
//
// Auth flow:
//   1. User signs in via Supabase Auth (GitHub or Azure/MS365)
//   2. Gateway JWT issued — used for workspace discovery
//   3. Edge Function mints workspace-specific JWTs for data access
// ---------------------------------------------------------------------------

export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_SUPABASE_URL ||
  "https://tccyronrnsimacqfhxzd.supabase.co";

const gatewayAnonKey =
  import.meta.env.VITE_GATEWAY_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjY3lyb25ybnNpbWFjcWZoeHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODYyNTAsImV4cCI6MjA5MDc2MjI1MH0.wcAx-xx4FHiPItRMU-N8aPOc7TjtI2vvVf2xfo7TyBs";

export const gateway = createClient(GATEWAY_URL, gatewayAnonKey, {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,
    storageKey: "tv-gateway-auth",
  },
});
