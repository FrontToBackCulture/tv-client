// React hook for Outlook sync events
// Listens to Tauri events and invalidates React Query cache

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";

interface SyncProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

interface SyncComplete {
  emailsSynced: number;
  timestamp: string;
  incremental?: boolean;
}

export function useOutlookSync() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<SyncProgress>("outlook:sync-progress", (event) => {
      setIsSyncing(true);
      setProgress(event.payload);
      setError(null);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<SyncComplete>("outlook:sync-complete", (event) => {
      setIsSyncing(false);
      setProgress(null);
      setLastSync(event.payload.timestamp);
      // Invalidate all outlook queries so UI refreshes
      queryClient.invalidateQueries({ queryKey: ["outlook"] });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<{ error: string }>("outlook:sync-error", (event) => {
      setIsSyncing(false);
      setProgress(null);
      setError(event.payload.error);
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient]);

  return { isSyncing, progress, lastSync, error };
}
