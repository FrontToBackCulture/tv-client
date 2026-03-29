// Settings view for managing the Google Analytics (GA4) connection

import { useState } from "react";
import { CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw, BarChart3 } from "lucide-react";
import { Button } from "../../components/ui";
import { useGA4Auth, useGA4Login, useGA4Logout, useGA4Config } from "../../hooks/useGA4";
import { invoke } from "@tauri-apps/api/core";

export function GA4ConnectionView() {
  const { data: auth, isLoading: authLoading, refetch: refetchAuth } = useGA4Auth();
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useGA4Config();
  const login = useGA4Login();
  const logout = useGA4Logout();
  const [error, setError] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [websitePropertyId, setWebsitePropertyId] = useState("");
  const [saving, setSaving] = useState(false);

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
      setError(String(e));
      refetchAuth();
    }
  };

  const handleDisconnect = async () => {
    setError("");
    try {
      await logout.mutateAsync();
    } catch (e) {
      setError(String(e));
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
      setError(String(e));
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
      setError(String(e));
    } finally {
      setSaving(false);
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
      <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
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
              className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
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
              className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
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

      {/* Info */}
      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">How it works</p>
        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-0.5 list-disc list-inside">
          <li>Syncs automatically once per day on app launch</li>
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
