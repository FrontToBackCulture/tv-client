import { useState } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";
import { RepoDashboard } from "./RepoDashboard";
import { RepoDetail } from "./RepoDetail";
import { RepoSettingsDialog } from "./RepoSettingsDialog";

type ReposView =
  | { kind: "dashboard" }
  | { kind: "detail"; owner: string; repo: string };

export function ReposModule() {
  const [view, setView] = useState<ReposView>({ kind: "dashboard" });
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        {view.kind === "detail" && (
          <button
            onClick={() => setView({ kind: "dashboard" })}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="text-sm font-semibold flex-1">
          {view.kind === "dashboard"
            ? "Repos"
            : `${view.owner}/${view.repo}`}
        </h1>
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
          title="Manage repos"
        >
          <Settings2 size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view.kind === "dashboard" ? (
          <RepoDashboard
            onSelect={(owner, repo) =>
              setView({ kind: "detail", owner, repo })
            }
          />
        ) : (
          <RepoDetail owner={view.owner} repo={view.repo} />
        )}
      </div>

      {/* Settings dialog */}
      {showSettings && (
        <RepoSettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
