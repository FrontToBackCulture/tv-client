// src/modules/inbox/EmptyInbox.tsx

import { Mail, RefreshCw, Settings, Loader2 } from "lucide-react";

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
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400 text-left">
            {syncError}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isSyncing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Sync Emails
                </>
              )}
            </button>
          )}
          {onSetup && (
            <button
              onClick={onSetup}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors"
            >
              <Settings size={16} />
              Setup
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-400 mt-6">
          Emails are synced directly from Outlook via MS Graph API and stored locally.
        </p>
      </div>
    </div>
  );
}
