import { useState, useEffect, useCallback, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateState {
  updateAvailable: boolean;
  version: string | null;
  downloading: boolean;
  installed: boolean;
  progress: number; // 0-100
  error: string | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export function useAppUpdate(): UpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    try {
      setError(null);
      const update = await check();
      if (update) {
        setUpdateAvailable(true);
        setVersion(update.version);
        updateRef.current = update;
      }
    } catch (e) {
      console.warn("[updater] Check failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    try {
      setDownloading(true);
      setProgress(0);
      setError(null);

      let totalBytes = 0;
      let downloadedBytes = 0;

      console.log("[updater] Starting downloadAndInstall for version:", update.version);

      await update.downloadAndInstall((event) => {
        console.log("[updater] Event:", event.event, "data" in event ? event.data : "");
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      console.log("[updater] downloadAndInstall completed successfully");

      // Mark as installed before attempting relaunch
      setInstalled(true);
      setDownloading(false);

      console.log("[updater] Attempting relaunch...");
      try {
        await relaunch();
      } catch (e) {
        console.error("[updater] Relaunch failed:", e);
        setError(`Update installed but restart failed: ${e instanceof Error ? e.message : String(e)}. Please quit and reopen the app.`);
      }
    } catch (e) {
      console.error("[updater] Install failed:", e);
      setError(e instanceof Error ? e.message : String(e));
      setDownloading(false);
    }
  }, []);

  // Check on mount (app launch) — skip in dev mode (already running from source)
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  return {
    updateAvailable,
    version,
    downloading,
    installed,
    progress,
    error,
    checkForUpdate,
    installUpdate,
  };
}
