// First-time Outlook OAuth setup UI
// Auto-imports credentials from tv-tools/mcp-server/.env

import { useState, useEffect } from "react";
import { Mail, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { useOutlookLogin, useOutlookAuth } from "../../hooks/useOutlook";
import { invoke } from "@tauri-apps/api/core";

type SetupState = "loading" | "no-credentials" | "ready" | "connecting" | "error";

export function OutlookSetup() {
  const { data: auth } = useOutlookAuth();
  const login = useOutlookLogin();
  const [state, setState] = useState<SetupState>("loading");
  const [clientId, setClientId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // On mount: try to load from settings, then auto-import from mcp-server .env
  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    setState("loading");

    // 1. Check if already in settings
    const existingId = await invoke<string | null>("settings_get_key", {
      keyName: "ms_graph_client_id",
    }).catch(() => null);
    const existingTenant = await invoke<string | null>("settings_get_key", {
      keyName: "ms_graph_tenant_id",
    }).catch(() => null);
    const existingSecret = await invoke<string | null>("settings_get_key", {
      keyName: "ms_graph_client_secret",
    }).catch(() => null);

    if (existingId && existingTenant && existingSecret) {
      setClientId(existingId);
      setTenantId(existingTenant);
      setClientSecret(existingSecret);

      // Try to import existing tokens from msteams-sync (avoids re-auth)
      const homeDir = await getHomeDir();
      const tokenPaths = [
        `${homeDir}/Code/SkyNet/tv-tools/msteams-sync/.tokens/user-tokens.json`,
      ];
      for (const tokenPath of tokenPaths) {
        try {
          await invoke("outlook_auth_import", { tokenFilePath: tokenPath });
          // Tokens imported successfully - auth check will see them
          setState("ready");
          return;
        } catch {
          // No tokens to import, continue to manual connect
        }
      }

      setState("ready");
      return;
    }

    // 2. Auto-import from mcp-server .env
    // Try absolute paths based on common locations
    const homeDir = await getHomeDir();
    const absolutePaths = [
      `${homeDir}/Code/SkyNet/tv-tools/mcp-server/.env`,
      `${homeDir}/code/SkyNet/tv-tools/mcp-server/.env`,
    ];

    for (const envPath of absolutePaths) {
      try {
        const imported = await invoke<string[]>("settings_import_from_file", {
          filePath: envPath,
        });

        if (imported.length > 0) {
          // Re-read the newly imported credentials
          const id = await invoke<string | null>("settings_get_key", {
            keyName: "ms_graph_client_id",
          }).catch(() => null);
          const tenant = await invoke<string | null>("settings_get_key", {
            keyName: "ms_graph_tenant_id",
          }).catch(() => null);
          const secret = await invoke<string | null>("settings_get_key", {
            keyName: "ms_graph_client_secret",
          }).catch(() => null);

          if (id && tenant && secret) {
            setClientId(id);
            setTenantId(tenant);
            setClientSecret(secret);

            // Also try to import existing tokens from msteams-sync
            const tokenPath = `${homeDir}/Code/SkyNet/tv-tools/msteams-sync/.tokens/user-tokens.json`;
            try {
              await invoke("outlook_auth_import", { tokenFilePath: tokenPath });
            } catch {
              // No tokens to import, user will need to connect via browser
            }

            setState("ready");
            return;
          }
        }
      } catch {
        // Path doesn't exist, try next
        continue;
      }
    }

    // 3. No credentials found anywhere
    setState("no-credentials");
  }

  async function getHomeDir(): Promise<string> {
    try {
      const path = await invoke<string>("settings_get_path");
      // path is like /Users/melvinwang/.tv-desktop/settings.json
      const match = path.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/);
      return match ? match[1] : "";
    } catch {
      return "";
    }
  }

  const handleConnect = async () => {
    if (!clientId || !tenantId || !clientSecret) return;
    setState("connecting");
    setErrorMsg("");

    try {
      // Save credentials to settings (needed for token refresh)
      await invoke("settings_set_key", { keyName: "ms_graph_client_id", value: clientId });
      await invoke("settings_set_key", { keyName: "ms_graph_tenant_id", value: tenantId });
      await invoke("settings_set_key", { keyName: "ms_graph_client_secret", value: clientSecret });

      await login.mutateAsync({ clientId, tenantId, clientSecret });
    } catch (e) {
      setState("error");
      setErrorMsg(String(e));
    }
  };

  // Already authenticated
  if (auth?.isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Connected to Outlook
          </h2>
          <p className="text-zinc-500">
            Signed in as {auth.userEmail || "Unknown"}
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (state === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-4 text-zinc-400 animate-spin" />
          <p className="text-zinc-500">Loading credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Mail size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Connect Outlook
          </h2>
          {state === "ready" ? (
            <p className="text-zinc-500 text-sm">
              Credentials loaded from tv-tools. Click connect to sign in.
            </p>
          ) : (
            <p className="text-zinc-500 text-sm">
              Could not find credentials in tv-tools. Enter them manually.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {state === "no-credentials" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Tenant ID
                </label>
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="e.g., common or your-tenant-id"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Azure AD Application (client) ID"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Azure AD Application client secret"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>
            </>
          )}

          {state === "ready" && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-400">
              Credentials found: Client ID {clientId.slice(0, 8)}...
            </div>
          )}

          {(state === "error" || login.error) && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg || String(login.error)}</span>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={!clientId || !tenantId || !clientSecret || state === "connecting" || login.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
          >
            {state === "connecting" || login.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Waiting for browser...
              </>
            ) : (
              "Connect with Microsoft"
            )}
          </button>

          <p className="text-xs text-zinc-400 text-center">
            Opens Microsoft login in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}
