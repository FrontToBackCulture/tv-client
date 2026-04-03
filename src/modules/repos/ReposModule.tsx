import { useState } from "react";
import { Settings2 } from "lucide-react";
import { BackButton } from "../../components/BackButton";
import { PageHeader } from "../../components/PageHeader";
import { RepoDashboard } from "./RepoDashboard";
import { RepoDetail } from "./RepoDetail";
import { RepoSettingsDialog } from "./RepoSettingsDialog";
import { IconButton } from "../../components/ui";

type ReposView =
  | { kind: "dashboard" }
  | { kind: "detail"; owner: string; repo: string };

export function ReposModule() {
  const [view, setView] = useState<ReposView>({ kind: "dashboard" });
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <PageHeader description="Monitor GitHub repositories, PRs, and CI status." />
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        {view.kind === "detail" && (
          <BackButton onClick={() => setView({ kind: "dashboard" })} />
        )}
        <h1 className="text-sm font-semibold flex-1">
          {view.kind === "dashboard"
            ? "Repos"
            : `${view.owner}/${view.repo}`}
        </h1>
        <IconButton icon={Settings2} label="Manage repos" onClick={() => setShowSettings(true)} />
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
