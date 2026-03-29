// Settings view for toggling background sync (email, calendar, notion)
// All syncs are disabled by default — user must explicitly enable them.

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const SYNC_TOGGLES = [
  {
    key: "bg_sync_outlook_email",
    label: "Outlook Email Sync",
    description: "Sync emails from Outlook every 5 minutes",
  },
  {
    key: "bg_sync_outlook_calendar",
    label: "Outlook Calendar Sync",
    description: "Sync calendar events from Outlook every 5 minutes",
  },
  {
    key: "bg_sync_notion",
    label: "Notion Incremental Sync",
    description: "Sync tasks from Notion every 4 hours",
  },
] as const;

type SyncKey = (typeof SYNC_TOGGLES)[number]["key"];

export function BackgroundSyncView() {
  const [values, setValues] = useState<Record<SyncKey, boolean>>({
    bg_sync_outlook_email: false,
    bg_sync_outlook_calendar: false,
    bg_sync_notion: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const result = { ...values };
    for (const toggle of SYNC_TOGGLES) {
      const val = await invoke<string | null>("settings_get_key", {
        keyName: toggle.key,
      }).catch(() => null);
      result[toggle.key] = val === "true";
    }
    setValues(result);
    setLoading(false);
  }

  async function toggle(key: SyncKey) {
    const newValue = !values[key];
    setValues((prev) => ({ ...prev, [key]: newValue }));
    await invoke("settings_set_key", {
      keyName: key,
      value: newValue ? "true" : "false",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Background Sync
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Enable or disable automatic background syncing. All syncs are off by
          default. You can always trigger a manual sync from each module.
        </p>
      </div>

      <div className="space-y-1">
        {SYNC_TOGGLES.map((item) => {
          const enabled = values[item.key];
          return (
            <label
              key={item.key}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {item.label}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.description}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={loading}
                onClick={() => toggle(item.key)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ml-3 ${
                  enabled
                    ? "bg-teal-600"
                    : "bg-zinc-300 dark:bg-zinc-600"
                } ${loading ? "opacity-50" : ""}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          );
        })}
      </div>
    </div>
  );
}
