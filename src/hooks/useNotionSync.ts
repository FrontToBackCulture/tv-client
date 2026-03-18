// React hook for Notion sync events
// Listens to Tauri events and invalidates React Query cache

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import type { SyncProgress, SyncComplete } from "../lib/notion/types";

export function useNotionSync() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterWarning, setFilterWarning] = useState<{ config: string; warning: string } | null>(null);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<SyncProgress>("notion:sync-progress", (event) => {
      setIsSyncing(true);
      setProgress(event.payload);
      setError(null);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<SyncComplete>("notion:sync-complete", (event) => {
      setIsSyncing(false);
      setProgress(null);
      setLastSync(event.payload.timestamp);
      // Invalidate notion + work queries so UI refreshes
      queryClient.invalidateQueries({ queryKey: ["notion"] });
      queryClient.invalidateQueries({ queryKey: ["work"] });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<{ error: string }>("notion:sync-error", (event) => {
      setIsSyncing(false);
      setProgress(null);
      setError(event.payload.error);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<{ config: string; config_id: string; warning: string }>("notion:sync-filter-warning", (event) => {
      setFilterWarning({ config: event.payload.config, warning: event.payload.warning });
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient]);

  return { isSyncing, progress, lastSync, error, filterWarning, clearFilterWarning: () => setFilterWarning(null) };
}
