// Settings view for Outlook — handles full onboarding (auth + initial sync) and connection management

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw, Mail, Download } from "lucide-react";
import { Button } from "../../components/ui";
import { formatError } from "@/lib/formatError";
import {
  useOutlookAuth,
  useOutlookLogin,
  useOutlookLogout,
  useInitialSetup,
  useSyncStatus,
} from "../../hooks/useOutlook";
import { useOutlookSync } from "../../hooks/useOutlookSync";
import { invoke } from "@tauri-apps/api/core";

type SetupState = "loading" | "no-credentials" | "ready";

export function OutlookConnectionView() {
  const { data: auth, isLoading: isLoadingAuth, refetch: refetchAuth } = useOutlookAuth();
  const login = useOutlookLogin();
  const logout = useOutlookLogout();
  const initialSetup = useInitialSetup();
  const { data: syncStatus } = useSyncStatus();
  const { isSyncing, progress: syncProgress, error: syncEventError } = useOutlookSync();

  const [error, setError] = useState("");
  const [syncMonths, setSyncMonths] = useState(6);

  // Credential form state (for first-time setup)
  const [setupState, setSetupState] = useState<SetupState>("loading");
  const [clientId, setClientId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const isConnected = auth?.isAuthenticated;
  const emailInitialDone = (syncStatus?.email.emailsSynced ?? 0) > 0 && syncStatus?.email.lastSync;
  const calendarInitialDone = (syncStatus?.calendar.eventsSynced ?? 0) > 0 && syncStatus?.calendar.lastSync;
  const initialSyncDone = emailInitialDone && calendarInitialDone;

  // Load credentials on mount (for not-connected state)
  useEffect(() => {
    if (!isConnected && !isLoadingAuth) {
      loadCredentials();
    }
  }, [isConnected, isLoadingAuth]);

  async function loadCredentials() {
    setSetupState("loading");
    const existingId = await invoke<string | null>("settings_get_key", { keyName: "ms_graph_client_id" }).catch(() => null);
    const existingTenant = await invoke<string | null>("settings_get_key", { keyName: "ms_graph_tenant_id" }).catch(() => null);
    const existingSecret = await invoke<string | null>("settings_get_key", { keyName: "ms_graph_client_secret" }).catch(() => null);

    if (existingId && existingTenant && existingSecret) {
      setClientId(existingId);
      setTenantId(existingTenant);
      setClientSecret(existingSecret);
      setSetupState("ready");
    } else {
      setSetupState("no-credentials");
    }
  }

  const handleConnect = async () => {
    if (!clientId || !tenantId || !clientSecret) return;
    setError("");

    try {
      await invoke("settings_set_key", { keyName: "ms_graph_client_id", value: clientId });
      await invoke("settings_set_key", { keyName: "ms_graph_tenant_id", value: tenantId });
      await invoke("settings_set_key", { keyName: "ms_graph_client_secret", value: clientSecret });
      await login.mutateAsync({ clientId, tenantId, clientSecret });
    } catch (e) {
      setError(String(e));
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
      if (!clientId || !tenantId || !clientSecret) {
        setError("Missing credentials. Enter them above to reconnect.");
        return;
      }
      await logout.mutateAsync();
      await login.mutateAsync({ clientId, tenantId, clientSecret });
    } catch (e) {
      setError(String(e));
      refetchAuth();
    }
  };

  const handleInitialSync = () => {
    setError("");
    initialSetup.mutate(syncMonths, {
      onError: (e) => setError(formatError(e)),
    });
  };

  if (isLoadingAuth) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Outlook</h2>
          <p className="text-sm text-zinc-500 mt-1">Manage your Microsoft Outlook connection.</p>
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
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Outlook</h2>
        <p className="text-sm text-zinc-500 mt-1">Manage your Microsoft Outlook connection for email and calendar.</p>
      </div>

      {/* ================================================================
          STATE 1: Not connected — show credential form + connect button
          ================================================================ */}
      {!isConnected && (
        <>
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center gap-3 mb-4">
              <XCircle size={20} className="text-zinc-400" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Not connected</p>
            </div>

            {setupState === "loading" && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-sm">Loading credentials...</span>
              </div>
            )}

            {(setupState === "no-credentials" || setupState === "ready") && (
              <div className="space-y-3">
                {setupState === "ready" && (
                  <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-400">
                    Credentials found: Client ID {clientId.slice(0, 8)}...
                  </div>
                )}

                {setupState === "no-credentials" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tenant ID</label>
                      <input
                        type="text"
                        value={tenantId}
                        onChange={(e) => setTenantId(e.target.value)}
                        placeholder='e.g., "common" or your-tenant-id'
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Client ID</label>
                      <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Azure AD Application (client) ID"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Client Secret</label>
                      <input
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Azure AD Application client secret"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </>
                )}

                <Button
                  size="md"
                  onClick={handleConnect}
                  disabled={!clientId || !tenantId || !clientSecret}
                  loading={login.isPending}
                  className="w-full rounded-lg"
                >
                  <Mail size={14} className="mr-1.5" />
                  {login.isPending ? "Waiting for browser..." : "Connect with Microsoft"}
                </Button>
                <p className="text-xs text-zinc-400 text-center">Opens Microsoft login in your browser.</p>
              </div>
            )}
          </div>

          {/* Scopes info */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">Required scopes</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Mail.Read, Mail.ReadWrite, Mail.Send, User.Read, Calendars.Read
            </p>
          </div>
        </>
      )}

      {/* ================================================================
          STATE 2: Connected but initial sync not done
          ================================================================ */}
      {isConnected && !initialSyncDone && (
        <>
          {/* Connection status */}
          <div className="p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500" />
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Connected</p>
                {auth?.userEmail && <p className="text-xs text-zinc-500">{auth.userEmail}</p>}
              </div>
            </div>
          </div>

          {/* Initial sync controls */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Initial Sync</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Fetch your email and calendar history. This only runs once.
            </p>

            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-zinc-600 dark:text-zinc-400">Sync period:</label>
              <select
                value={syncMonths}
                onChange={(e) => setSyncMonths(parseInt(e.target.value))}
                className="text-sm px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                <option value={1}>1 month</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months (recommended)</option>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
              </select>
            </div>

            {/* Progress */}
            {(isSyncing || initialSetup.isPending) && syncProgress && (
              <div className="mb-4 p-3 rounded-lg bg-teal-50 dark:bg-teal-900/20">
                <div className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{syncProgress.message}</span>
                </div>
                {syncProgress.total > 0 && (
                  <div className="mt-2 w-full bg-teal-100 dark:bg-teal-900/40 rounded-full h-1.5">
                    <div
                      className="bg-teal-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (syncProgress.current / syncProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <Button
              size="md"
              onClick={handleInitialSync}
              loading={isSyncing || initialSetup.isPending}
              className="w-full rounded-lg"
            >
              <Download size={14} className="mr-1.5" />
              {isSyncing || initialSetup.isPending ? "Syncing..." : "Start Initial Sync"}
            </Button>
          </div>
        </>
      )}

      {/* ================================================================
          STATE 3: Connected + synced — show status and management
          ================================================================ */}
      {isConnected && initialSyncDone && (
        <>
          {/* Connection status */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-500" />
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Connected</p>
                  {auth?.userEmail && <p className="text-xs text-zinc-500">{auth.userEmail}</p>}
                  {auth?.expiresAt && (
                    <p className="text-xs text-zinc-400">
                      Token expires: {new Date(auth.expiresAt * 1000).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sync status */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Sync Status</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500 text-xs">Emails synced</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{syncStatus?.email.emailsSynced?.toLocaleString() ?? "—"}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Events synced</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{syncStatus?.calendar.eventsSynced?.toLocaleString() ?? "—"}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Last email sync</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">
                  {syncStatus?.email.lastSync
                    ? new Date(syncStatus.email.lastSync).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Last calendar sync</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">
                  {syncStatus?.calendar.lastSync
                    ? new Date(syncStatus.calendar.lastSync).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })
                    : "—"}
                </p>
              </div>
            </div>

            {/* Re-run initial sync option */}
            <details className="mt-4">
              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
                Re-run initial sync (expand date range)
              </summary>
              <div className="mt-3 flex items-center gap-3">
                <select
                  value={syncMonths}
                  onChange={(e) => setSyncMonths(parseInt(e.target.value))}
                  className="text-sm px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                >
                  <option value={1}>1 month</option>
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                  <option value={24}>24 months</option>
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleInitialSync}
                  loading={isSyncing || initialSetup.isPending}
                  className="rounded-lg"
                >
                  <Download size={14} className="mr-1.5" />
                  Re-sync
                </Button>
              </div>
              {(isSyncing || initialSetup.isPending) && syncProgress && (
                <div className="mt-3 p-2 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-sm text-teal-700 dark:text-teal-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{syncProgress.message}</span>
                </div>
              )}
            </details>
          </div>

          {/* Scopes info */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">Required scopes</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Mail.Read, Mail.ReadWrite, Mail.Send, User.Read, Calendars.Read
            </p>
            {auth?.userEmail && (
              <p className="text-xs text-blue-500 mt-1">
                If calendar isn't working, reconnect to grant the Calendars.Read scope.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
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
          </div>
        </>
      )}

      {/* Error */}
      {(error || syncEventError) && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error || syncEventError}</span>
        </div>
      )}
    </div>
  );
}
