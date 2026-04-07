// src/modules/settings/SharedInboxSettingsView.tsx
// Admin-only settings page for managing shared mailboxes.
// Uses the Tauri localhost listener (port 3847) to capture the OAuth code
// automatically — same pattern as the personal inbox auth.

import { useState, useEffect } from "react";
import { Mail, Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/ui";
import { useSharedMailboxes, useRegisterSharedMailbox, useRemoveSharedMailbox, useSyncSharedMailbox } from "../../hooks/useSharedInbox";
import { useSettings } from "../../hooks/useSettings";
import { formatDateRelative } from "../../lib/date";
import { formatError } from "../../lib/formatError";

const REDIRECT_URI = "http://localhost:3847/callback";

export function SharedInboxSettingsView() {
  const { data: mailboxes = [], isLoading } = useSharedMailboxes();
  const registerMailbox = useRegisterSharedMailbox();
  const removeMailbox = useRemoveSharedMailbox();
  const syncMailbox = useSyncSharedMailbox();
  const { getKey } = useSettings();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Azure credentials — loaded automatically from existing Outlook settings
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [credsLoaded, setCredsLoaded] = useState(false);
  const [credsError, setCredsError] = useState(false);

  // Auto-load credentials when form opens
  useEffect(() => {
    if (!showForm || credsLoaded) return;
    (async () => {
      const tid = await getKey("ms_graph_tenant_id");
      const cid = await getKey("ms_graph_client_id");
      const cs = await getKey("ms_graph_client_secret");
      if (tid && cid && cs) {
        setTenantId(tid);
        setClientId(cid);
        setClientSecret(cs);
        setCredsError(false);
      } else {
        setCredsError(true);
      }
      setCredsLoaded(true);
    })();
  }, [showForm, credsLoaded, getKey]);

  // One-click: authenticate + register in a single flow
  const handleAuthenticateAndRegister = async () => {
    setFormError(null);
    if (!label || !emailAddress) {
      setFormError("Label and email address are required.");
      return;
    }
    if (!tenantId || !clientId) {
      setFormError("Outlook credentials not found. Set up Outlook in Integrations first.");
      return;
    }

    setIsAuthenticating(true);
    try {
      // Step 1: Open browser + capture code via Tauri localhost listener
      const code = await invoke<string>("outlook_oauth_code", {
        clientId,
        tenantId,
        loginHint: emailAddress,
      });

      // Step 2: Send code to Edge Function to exchange for tokens + register
      await registerMailbox.mutateAsync({
        code,
        label,
        email_address: emailAddress,
        tenant_id: tenantId,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
      });

      // Done — reset form
      setShowForm(false);
      setLabel("");
      setEmailAddress("");
      setFormError(null);
      setCredsLoaded(false);
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRemove = (id: string, name: string) => {
    if (confirm(`Remove shared mailbox "${name}"? Emails will be hidden but not deleted.`)) {
      removeMailbox.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Shared Inboxes</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Connect Outlook mailboxes that all workspace users can view. Emails sync automatically every 5 minutes.
        </p>
      </div>

      {/* Existing Mailboxes */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="animate-pulse text-zinc-400 text-sm">Loading mailboxes...</div>
        ) : mailboxes.length === 0 ? (
          <div className="text-sm text-zinc-500 p-4 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg text-center">
            No shared mailboxes configured yet.
          </div>
        ) : (
          mailboxes.map((mb) => (
            <div
              key={mb.id}
              className="flex items-center gap-4 p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg"
            >
              <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                <Mail size={18} className="text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{mb.label}</div>
                <div className="text-sm text-zinc-500">{mb.email_address}</div>
                <div className="flex items-center gap-3 mt-1">
                  {mb.last_sync_error ? (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <AlertTriangle size={10} />
                      {mb.last_sync_error}
                    </span>
                  ) : mb.last_synced_at ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 size={10} />
                      Synced {formatDateRelative(mb.last_synced_at)}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">Never synced</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  icon={RefreshCw}
                  onClick={() => syncMailbox.mutate(mb.id)}
                  disabled={syncMailbox.isPending}
                >
                  Sync
                </Button>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => handleRemove(mb.id, mb.label)}
                  className="text-red-500 hover:text-red-600"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Mailbox Form */}
      {showForm ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">Add Shared Mailbox</h3>

          {credsError && (
            <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <AlertTriangle size={14} />
              Outlook credentials not found. Set up your personal Outlook connection in Integrations first — the same app registration is reused here.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Label
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Support"
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                disabled={isAuthenticating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Email Address
              </label>
              <input
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="e.g., support@thinkval.com"
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                disabled={isAuthenticating}
              />
            </div>
          </div>

          {formError && (
            <div className="text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle size={14} />
              {formError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              icon={isAuthenticating ? Loader2 : ExternalLink}
              onClick={handleAuthenticateAndRegister}
              disabled={isAuthenticating || !credsLoaded || credsError}
              className={isAuthenticating ? "[&>svg:first-child]:animate-spin" : ""}
            >
              {isAuthenticating ? "Waiting for authentication..." : "Authenticate & Add Mailbox"}
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setFormError(null); setCredsLoaded(false); }} disabled={isAuthenticating}>
              Cancel
            </Button>
          </div>

          {isAuthenticating && (
            <p className="text-xs text-zinc-500">
              A browser window has opened for Microsoft sign-in. Complete it there and this will update automatically.
            </p>
          )}
        </div>
      ) : (
        <Button icon={Plus} onClick={() => setShowForm(true)}>
          Add Shared Mailbox
        </Button>
      )}
    </div>
  );
}
