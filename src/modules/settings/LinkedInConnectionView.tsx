// Settings view for managing the LinkedIn connection

import { useState } from "react";
import { CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui";
import { useLinkedInAuth, useLinkedInLogin, useLinkedInLogout } from "../../hooks/useLinkedIn";
import { invoke } from "@tauri-apps/api/core";

export function LinkedInConnectionView() {
  const { data: auth, isLoading, refetch } = useLinkedInAuth();
  const login = useLinkedInLogin();
  const logout = useLinkedInLogout();
  const [error, setError] = useState("");

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
      const clientId = await invoke<string | null>("settings_get_key", { keyName: "linkedin_client_id" }).catch(() => null);
      const clientSecret = await invoke<string | null>("settings_get_key", { keyName: "linkedin_client_secret" }).catch(() => null);

      if (!clientId || !clientSecret) {
        setError("Missing credentials. Go to LinkedIn module to set up first.");
        return;
      }

      await logout.mutateAsync();
      await login.mutateAsync({ clientId, clientSecret });
    } catch (e) {
      setError(String(e));
      refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">LinkedIn</h2>
          <p className="text-sm text-zinc-500 mt-1">Manage your LinkedIn connection.</p>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Checking connection...</span>
        </div>
      </div>
    );
  }

  const isConnected = auth?.isAuthenticated;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">LinkedIn</h2>
        <p className="text-sm text-zinc-500 mt-1">Manage your LinkedIn connection for posting and engagement.</p>
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
              {isConnected && auth?.userName && (
                <p className="text-xs text-zinc-500">{auth.userName}</p>
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

      {/* Scopes info */}
      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">Granted scopes</p>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          openid, profile, email, w_member_social (Share on LinkedIn)
        </p>
        <p className="text-xs text-blue-500 mt-1">
          Redirect URI: <code>http://localhost:3848/callback</code>
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
          <p className="text-sm text-zinc-500">
            Go to the <span className="font-medium">LinkedIn</span> module to connect your account.
          </p>
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
