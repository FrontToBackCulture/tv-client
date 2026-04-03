// Settings: Configurable Folder Paths

import { useFolderConfigStore } from "../../stores/folderConfigStore";
import {
  FolderConfig,
  FOLDER_CONFIG_DEFAULTS,
  FOLDER_CONFIG_LABELS,
  FOLDER_CONFIG_DESCRIPTIONS,
} from "../../lib/folderConfig";
import { RotateCcw } from "lucide-react";
import { Button } from "../../components/ui";

const FOLDER_KEYS = Object.keys(FOLDER_CONFIG_DEFAULTS) as (keyof FolderConfig)[];

export function FolderPathsView() {
  const config = useFolderConfigStore((s) => s.config);
  const setFolderName = useFolderConfigStore((s) => s.setFolderName);
  const resetToDefaults = useFolderConfigStore((s) => s.resetToDefaults);

  const hasAnyNonDefault = FOLDER_KEYS.some(
    (key) => config[key] !== FOLDER_CONFIG_DEFAULTS[key]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Folder Paths
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configure knowledge base folder names. Changes take effect
            immediately — rename actual folders on disk to match.
          </p>
        </div>
        {hasAnyNonDefault && (
          <Button variant="ghost" onClick={resetToDefaults}>
            <RotateCcw size={14} className="mr-1.5" />
            Reset all
          </Button>
        )}
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
        {FOLDER_KEYS.map((key) => {
          const isModified = config[key] !== FOLDER_CONFIG_DEFAULTS[key];
          return (
            <div key={key} className="flex items-center gap-3 px-4 py-3">
              <div className="w-36 flex-shrink-0">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {FOLDER_CONFIG_LABELS[key]}
                </span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {FOLDER_CONFIG_DESCRIPTIONS[key]}
                </p>
              </div>
              <input
                type="text"
                value={config[key]}
                onChange={(e) => setFolderName(key, e.target.value)}
                className="flex-1 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm placeholder:text-zinc-400"
              />
              {isModified && (
                <button
                  onClick={() => setFolderName(key, FOLDER_CONFIG_DEFAULTS[key])}
                  title={`Reset to "${FOLDER_CONFIG_DEFAULTS[key]}"`}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
