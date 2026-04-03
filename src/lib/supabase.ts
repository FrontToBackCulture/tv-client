import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Dynamic workspace Supabase client
//
// Instead of a static singleton, the client is swapped when the user selects
// a workspace. The named `supabase` export is a Proxy so that the 100+ files
// that `import { supabase }` continue to work without any changes — every
// property access is forwarded to the current underlying client.
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null;

/** (Re-)initialise the workspace Supabase client. Call this when the user
 *  selects or switches a workspace. Any existing realtime channels on the
 *  previous client are torn down automatically. */
export function initWorkspaceClient(
  url: string,
  anonKey: string,
): SupabaseClient {
  if (_client) {
    _client.removeAllChannels();
  }
  _client = createClient(url, anonKey);
  return _client;
}

/** Returns the raw workspace client (throws if none initialised yet). */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    throw new Error(
      "Supabase client not initialised — select a workspace first.",
    );
  }
  return _client;
}

/** Whether a workspace client is currently active. */
export function isWorkspaceClientReady(): boolean {
  return _client !== null;
}

// Backward-compatible named export. The Proxy delegates every property access
// to whatever `_client` is set to, so existing call-sites like
// `supabase.from("users").select(...)` keep working after a workspace switch.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    // Bind functions so `this` stays correct (e.g. supabase.from())
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const isSupabaseConfigured = true;
