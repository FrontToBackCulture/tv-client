// src/modules/settings/NoRepositoryEmptyState.tsx
//
// Shown by settings views (VAL Credentials, MCP Endpoints) that discover
// domains from the filesystem. Those views need an active repository in
// `repositoryStore` — when the store is empty (e.g. after clearing
// localStorage), they'd otherwise render a silent "No domains discovered"
// state with no way to recover without leaving settings.
//
// This component gives the user a way to fix it in place: a native folder
// picker that registers and activates the selected repo, plus a fallback
// that jumps to the Library module where the full repo list lives.

import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Library, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useModuleTabStore } from "../../stores/moduleTabStore";
import { formatError } from "../../lib/formatError";

interface NoRepositoryEmptyStateProps {
  /** Short explanation of *why* this view needs a repo. */
  reason: string;
}

export function NoRepositoryEmptyState({ reason }: NoRepositoryEmptyStateProps) {
  const addRepository = useRepositoryStore((s) => s.addRepository);
  const openTab = useModuleTabStore((s) => s.openTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open a native folder picker and register the chosen folder as the
  // active repository. `addRepository` auto-selects the first repo it adds,
  // so no separate setActiveRepository call is needed when the store is empty.
  const handleSelectFolder = async () => {
    setError(null);
    try {
      const selected = await openDialog({
        title: "Select knowledge repository folder",
        directory: true,
        multiple: false,
      });
      if (!selected) return;
      setBusy(true);
      const path = selected as string;
      // Derive a name from the last path segment.
      const name = path.split("/").filter(Boolean).pop() ?? "Repository";
      addRepository(name, path);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            No active repository
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            {reason} Point the app at your knowledge repo folder to continue.
          </p>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
          )}

          <div className="flex items-center gap-2 mt-4">
            <Button
              icon={FolderOpen}
              onClick={handleSelectFolder}
              disabled={busy}
              loading={busy}
            >
              Select Repository Folder
            </Button>
            <Button
              variant="secondary"
              icon={Library}
              onClick={() => openTab("library")}
              disabled={busy}
            >
              Open Library
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
