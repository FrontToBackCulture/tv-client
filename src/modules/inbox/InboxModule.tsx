// src/modules/inbox/InboxModule.tsx

import { Mail } from "lucide-react";

export function InboxModule() {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
      <div className="text-center">
        <Mail size={48} className="mx-auto mb-4 text-zinc-400 dark:text-zinc-700" />
        <h2 className="text-xl font-semibold text-zinc-600 dark:text-zinc-400">Inbox</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-600 mt-2">
          Email triage coming in Phase 7
        </p>
      </div>
    </div>
  );
}
