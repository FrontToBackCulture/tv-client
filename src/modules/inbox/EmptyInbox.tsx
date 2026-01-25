// src/modules/inbox/EmptyInbox.tsx

import { Mail, RefreshCw, Settings } from "lucide-react";

interface EmptyInboxProps {
  onRefresh?: () => void;
  onSetup?: () => void;
  message?: string;
}

export function EmptyInbox({ onRefresh, onSetup, message }: EmptyInboxProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
          <Mail size={32} className="text-zinc-400" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          No emails yet
        </h2>
        <p className="text-zinc-500 mb-6">
          {message || "Sync your emails to start triaging your inbox with AI-powered classification."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
            >
              <RefreshCw size={16} />
              Sync Emails
            </button>
          )}
          {onSetup && (
            <button
              onClick={onSetup}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors"
            >
              <Settings size={16} />
              Setup
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-400 mt-6">
          Emails are synced from Outlook via tv-tools and stored locally in the knowledge base.
        </p>
      </div>
    </div>
  );
}
