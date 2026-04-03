import { useState, useEffect, useCallback, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { formatError } from "../lib/formatError";

const WHATS_NEW_KEY = "tv-client-whats-new";
const LAST_VERSION_KEY = "tv-client-last-version";

interface UpdateState {
  updateAvailable: boolean;
  version: string | null;
  body: string | null;
  downloading: boolean;
  installed: boolean;
  progress: number; // 0-100
  error: string | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export interface WhatsNewData {
  version: string;
  notes: string;
}

const UPDATER_ENDPOINT = "https://github.com/FrontToBackCulture/tv-client/releases/latest/download/latest.json";

/** Check if app just updated and return the stored release notes */
export function getWhatsNew(): WhatsNewData | null {
  const lastVersion = localStorage.getItem(LAST_VERSION_KEY);
  const currentVersion = __APP_VERSION__;

  // First launch ever — just record current version
  if (!lastVersion) {
    localStorage.setItem(LAST_VERSION_KEY, currentVersion);
    return null;
  }

  // Same version — no update happened
  if (lastVersion === currentVersion) return null;

  // Version changed — we just updated
  const stored = localStorage.getItem(WHATS_NEW_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored) as WhatsNewData;
      return data;
    } catch {
      // Malformed data, skip
    }
  }

  // Version changed but no stored notes (manual install, etc.)
  // Still show something — notes will be fetched async by fetchWhatsNewNotes()
  return { version: currentVersion, notes: "" };
}

/** Fetch release notes for the current version.
 *  Tries GitHub API first (full release body), falls back to latest.json. */
export async function fetchWhatsNewNotes(): Promise<string | null> {
  // Try GitHub API — same approach as Command Palette
  try {
    const res = await fetch(
      `https://api.github.com/repos/FrontToBackCulture/tv-client/releases/tags/v${__APP_VERSION__}`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (res.ok) {
      const release = await res.json();
      const body: string = release.body ?? "";
      const match = body.match(/## What's New\s*\n([\s\S]*?)(?=\n## |$)/);
      if (match) return match[1].trim();
      if (body) return body;
    }
  } catch {
    // Fall through to latest.json
  }

  // Fallback: latest.json
  try {
    const resp = await fetch(UPDATER_ENDPOINT);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.notes && typeof data.notes === "string") {
      return data.notes;
    }
  } catch {
    // Network error — just skip
  }
  return null;
}

/** Mark "What's New" as dismissed */
export function dismissWhatsNew() {
  localStorage.setItem(LAST_VERSION_KEY, __APP_VERSION__);
  localStorage.removeItem(WHATS_NEW_KEY);
}

export function useAppUpdate(): UpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
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
        setBody(update.body ?? null);
        updateRef.current = update;
      }
    } catch (e) {
      console.warn("[updater] Check failed:", e);
      setError(formatError(e));
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

      // Store release notes for "What's New" modal after relaunch
      localStorage.setItem(
        WHATS_NEW_KEY,
        JSON.stringify({ version: update.version, notes: update.body ?? "" })
      );

      // Mark as installed before attempting relaunch
      setInstalled(true);
      setDownloading(false);

      console.log("[updater] Attempting relaunch...");
      try {
        await relaunch();
      } catch (e) {
        console.error("[updater] Relaunch failed:", e);
        setError(`Update installed but restart failed: ${formatError(e)}. Please quit and reopen the app.`);
      }
    } catch (e) {
      console.error("[updater] Install failed:", e);
      setError(formatError(e));
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
    body,
    downloading,
    installed,
    progress,
    error,
    checkForUpdate,
    installUpdate,
  };
}
