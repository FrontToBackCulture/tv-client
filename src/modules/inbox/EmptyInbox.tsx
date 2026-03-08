// src/modules/inbox/EmptyInbox.tsx

import { Mail, RefreshCw, Settings, Loader2 } from "lucide-react";
import { Button } from "../../components/ui";
import { ErrorBanner } from "../../components/ui/DetailStates";

interface EmptyInboxProps {
  onRefresh?: () => void;
  onSetup?: () => void;
  message?: string;
  isSyncing?: boolean;
  syncError?: string | null;
  syncProgress?: { phase: string; current: number; total: number; message: string } | null;
}

export function EmptyInbox({ onRefresh, onSetup, message, isSyncing, syncError, syncProgress }: EmptyInboxProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          {isSyncing ? (
            <Loader2 size={32} className="text-zinc-400 animate-spin" />
          ) : (
            <Mail size={32} className="text-zinc-400" />
          )}
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          {isSyncing ? "Syncing emails..." : "No emails yet"}
        </h2>
        <p className="text-zinc-500 mb-6">
          {isSyncing && syncProgress
            ? syncProgress.message
            : message || "Click sync to fetch your emails from Outlook with AI-powered classification."}
        </p>

        {syncError && (
          <ErrorBanner message={syncError} className="mb-4 text-left" />
        )}

        <div className="flex items-center justify-center gap-3">
          {onRefresh && (
            <Button
              size="md"
              icon={isSyncing ? Loader2 : RefreshCw}
              onClick={onRefresh}
              loading={isSyncing}
              className="rounded-lg"
            >
              {isSyncing ? "Syncing..." : "Sync Emails"}
            </Button>
          )}
          {onSetup && (
            <Button
              variant="secondary"
              size="md"
              icon={Settings}
              onClick={onSetup}
              className="rounded-lg"
            >
              Setup
            </Button>
          )}
        </div>
        <p className="text-xs text-zinc-400 mt-6">
          Emails are synced directly from Outlook via MS Graph API and stored locally.
        </p>
      </div>
    </div>
  );
}
