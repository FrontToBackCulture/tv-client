// First-time LinkedIn OAuth setup UI

import { useState, useEffect } from "react";
import { Linkedin, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { formatError } from "@/lib/formatError";
import { Button } from "../../components/ui";
import { useLinkedInLogin, useLinkedInAuth } from "../../hooks/useLinkedIn";
import { invoke } from "@tauri-apps/api/core";

type SetupState = "loading" | "no-credentials" | "ready" | "connecting" | "error";

export function LinkedInSetup() {
  const { data: auth } = useLinkedInAuth();
  const login = useLinkedInLogin();
  const [state, setState] = useState<SetupState>("loading");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    setState("loading");

    const existingId = await invoke<string | null>("settings_get_key", {
      keyName: "linkedin_client_id",
    }).catch(() => null);
    const existingSecret = await invoke<string | null>("settings_get_key", {
      keyName: "linkedin_client_secret",
    }).catch(() => null);

    if (existingId && existingSecret) {
      setClientId(existingId);
      setClientSecret(existingSecret);
      setState("ready");
      return;
    }

    setState("no-credentials");
  }

  const handleConnect = async () => {
    if (!clientId || !clientSecret) return;
    setState("connecting");
    setErrorMsg("");

    try {
      // Save credentials to settings
      await invoke("settings_set_key", { keyName: "linkedin_client_id", value: clientId });
      await invoke("settings_set_key", { keyName: "linkedin_client_secret", value: clientSecret });

      await login.mutateAsync({ clientId, clientSecret });
    } catch (e) {
      setState("error");
      setErrorMsg(formatError(e));
    }
  };

  // Already authenticated
  if (auth?.isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Connected to LinkedIn
          </h2>
          <p className="text-zinc-500">
            Signed in as {auth.userName || "Unknown"}
          </p>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-4 text-zinc-400 animate-spin" />
          <p className="text-zinc-500">Loading credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Linkedin size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Connect LinkedIn
          </h2>
          {state === "ready" ? (
            <p className="text-zinc-500 text-sm">
              Credentials found. Click connect to sign in with LinkedIn.
            </p>
          ) : (
            <p className="text-zinc-500 text-sm">
              Enter your LinkedIn app credentials from{" "}
              <span className="font-medium">developer.linkedin.com</span>.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {state === "no-credentials" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="LinkedIn App Client ID"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
                  placeholder="LinkedIn App Client Secret"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
              <span>{errorMsg || formatError(login.error)}</span>
            </div>
          )}

          <Button
            size="md"
            onClick={handleConnect}
            disabled={!clientId || !clientSecret}
            loading={state === "connecting" || login.isPending}
            className="w-full rounded-lg"
          >
            {state === "connecting" || login.isPending
              ? "Waiting for browser..."
              : "Connect with LinkedIn"}
          </Button>

          <p className="text-xs text-zinc-400 text-center">
            Opens LinkedIn login in your browser. Requires redirect URI:{" "}
            <code className="text-xs">http://localhost:3848/callback</code>
          </p>
        </div>
      </div>
    </div>
  );
}
