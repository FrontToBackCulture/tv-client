// Settings view for managing the Google Analytics (GA4) connection

import { useState } from "react";
import { CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw, BarChart3, Cloud } from "lucide-react";
import { Button } from "../../components/ui";
import { formatError } from "../../lib/formatError";
import { useGA4Auth, useGA4Login, useGA4Logout, useGA4Config } from "../../hooks/useGA4";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import { useQuery } from "@tanstack/react-query";

export function GA4ConnectionView() {
  const { data: auth, isLoading: authLoading, refetch: refetchAuth } = useGA4Auth();
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useGA4Config();
  const login = useGA4Login();
  const logout = useGA4Logout();
  const [error, setError] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [websitePropertyId, setWebsitePropertyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "success" | "error">("idle");

  const serverConfigQuery = useQuery({
    queryKey: ["ga4-server-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ga4_sync_config")
        .select("name, enabled, last_synced_at")
        .eq("name", "default")
        .single();
      if (error) return null;
      return data as { name: string; enabled: boolean; last_synced_at: string | null };
    },
    staleTime: 30_000,
  });

  const isLoading = authLoading || configLoading;
  const isConnected = auth?.isAuthenticated;

  const handleConnect = async () => {
    setError("");
    try {
      const clientId = await invoke<string | null>("settings_get_key", { keyName: "ga4_client_id" }).catch(() => null);
      const clientSecret = await invoke<string | null>("settings_get_key", { keyName: "ga4_client_secret" }).catch(() => null);

      if (!clientId || !clientSecret) {
        setError("Missing GA4 Client ID or Client Secret. Add them in API Keys first.");
        return;
      }

      await login.mutateAsync({ clientId, clientSecret });
    } catch (e) {
      setError(formatError(e));
      refetchAuth();
    }
  };

  const handleDisconnect = async () => {
    setError("");
    try {
      await logout.mutateAsync();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleReconnect = async () => {
    setError("");
    try {
      const clientId = await invoke<string | null>("settings_get_key", { keyName: "ga4_client_id" }).catch(() => null);
      const clientSecret = await invoke<string | null>("settings_get_key", { keyName: "ga4_client_secret" }).catch(() => null);

      if (!clientId || !clientSecret) {
        setError("Missing credentials. Set GA4 Client ID and Secret in API Keys first.");
        return;
      }

      await logout.mutateAsync();
      await login.mutateAsync({ clientId, clientSecret });
    } catch (e) {
      setError(formatError(e));
      refetchAuth();
    }
  };

  const handleSavePropertyIds = async () => {
    setSaving(true);
    setError("");
    try {
      if (propertyId.trim()) {
        await invoke("settings_set_key", { keyName: "ga4_property_id", value: propertyId.trim() });
      }
      if (websitePropertyId.trim()) {
        await invoke("settings_set_key", { keyName: "ga4_website_property_id", value: websitePropertyId.trim() });
      }
      refetchConfig();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePushToServer = async () => {
    setPushing(true);
    setPushStatus("idle");
    setError("");
    try {
      // Read all credentials from local settings
      const clientId = await invoke<string | null>("settings_get_key", { keyName: "ga4_client_id" }).catch(() => null);
      const clientSecret = await invoke<string | null>("settings_get_key", { keyName: "ga4_client_secret" }).catch(() => null);
      const platformPropId = await invoke<string | null>("settings_get_key", { keyName: "ga4_property_id" }).catch(() => null);
      const websitePropId = await invoke<string | null>("settings_get_key", { keyName: "ga4_website_property_id" }).catch(() => null);

      if (!clientId || !clientSecret) {
        setError("Missing GA4 Client ID or Client Secret.");
        setPushStatus("error");
        return;
      }

      // Read refresh token from local token store
      const tokens = await invoke<{ access_token: string; refresh_token: string | null; expires_at: number }>(
        "ga4_export_tokens",
      ).catch(() => null);

      if (!tokens || !tokens.refresh_token) {
        setError("No refresh token found. Connect (or reconnect) to Google first.");
        setPushStatus("error");
        return;
      }

      // Upsert into ga4_sync_config
      const { error: upsertErr } = await supabase
        .from("ga4_sync_config")
        .upsert(
          {
            name: "default",
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: tokens.refresh_token,
            access_token: tokens.access_token || null,
            token_expires_at: tokens.expires_at
              ? new Date(tokens.expires_at * 1000).toISOString()
              : null,
            platform_property_id: platformPropId || null,
            website_property_id: websitePropId || null,
            enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "name" },
        );

      if (upsertErr) throw upsertErr;
      setPushStatus("success");
    } catch (e) {
      setError(formatError(e));
      setPushStatus("error");
    } finally {
      setPushing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Google Analytics</h2>
          <p className="text-sm text-zinc-500 mt-1">Connect to GA4 for platform and website analytics.</p>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Checking connection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Google Analytics</h2>
        <p className="text-sm text-zinc-500 mt-1">Connect to GA4 for VAL platform and website usage analytics.</p>
      </div>

      {/* Connection status */}
      <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle size={20} className="text-green-500" />
            ) : (
              <XCircle size={20} className="text-zinc-400" />
            )}
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {isConnected ? "Connected" : "Not connected"}
              </p>
              {isConnected && auth?.userEmail && (
                <p className="text-xs text-zinc-500">{auth.userEmail}</p>
              )}
              {isConnected && auth?.expiresAt && (
                <p className="text-xs text-zinc-400">
                  Token expires: {new Date(auth.expiresAt * 1000).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Property IDs */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">GA4 Property IDs</p>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">VAL Platform Property ID</label>
            <input
              type="text"
              placeholder={config?.propertyId || "e.g. 385363937"}
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
            {config?.propertyId && !propertyId && (
              <p className="text-xs text-zinc-400 mt-0.5">Current: {config.propertyId}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Website Property ID</label>
            <input
              type="text"
              placeholder={config?.websitePropertyId || "e.g. 328465572"}
              value={websitePropertyId}
              onChange={(e) => setWebsitePropertyId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
            {config?.websitePropertyId && !websitePropertyId && (
              <p className="text-xs text-zinc-400 mt-0.5">Current: {config.websitePropertyId}</p>
            )}
          </div>
        </div>
        {(propertyId.trim() || websitePropertyId.trim()) && (
          <Button size="sm" variant="primary" onClick={handleSavePropertyIds} loading={saving} className="rounded-lg">
            Save Property IDs
          </Button>
        )}
      </div>

      {/* Server Sync */}
      <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 space-y-3">
        <div className="flex items-center gap-2">
          <Cloud size={16} className="text-zinc-500" />
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Server-Side Sync</p>
        </div>
        {serverConfigQuery.data ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-500" />
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                Configured — syncs daily at 09:15 SGT via pg_cron
              </p>
            </div>
            {serverConfigQuery.data.last_synced_at && (
              <p className="text-xs text-zinc-400 ml-5">
                Last synced: {new Date(serverConfigQuery.data.last_synced_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Not configured. Push credentials to enable automatic server-side sync.
          </p>
        )}
        {isConnected && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePushToServer}
            loading={pushing}
            className="rounded-lg"
          >
            <Cloud size={14} className="mr-1.5" />
            {pushStatus === "success" ? "Pushed!" : serverConfigQuery.data ? "Update Credentials" : "Push Credentials to Server"}
          </Button>
        )}
        {pushStatus === "success" && (
          <p className="text-xs text-green-600">Credentials saved to server.</p>
        )}
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">How it works</p>
        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-0.5 list-disc list-inside">
          <li>Syncs daily at 09:15 SGT via Supabase pg_cron (server-side)</li>
          <li>VAL platform: tracks <code>/dashboard/*</code> usage per domain + user</li>
          <li>Website: tracks all page views (anonymous visitors)</li>
          <li>Data stored in Supabase <code>analytics_page_views</code> table</li>
        </ul>
        <p className="text-xs text-blue-500 mt-2">
          Redirect URI: <code>http://localhost:3849/callback</code>
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {isConnected ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleReconnect}
              loading={login.isPending || logout.isPending}
              className="rounded-lg"
            >
              <RefreshCw size={14} className="mr-1.5" />
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleDisconnect}
              loading={logout.isPending}
              className="rounded-lg"
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={handleConnect}
            loading={login.isPending}
            className="rounded-lg"
          >
            <BarChart3 size={14} className="mr-1.5" />
            Connect with Google
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
