import {
  GitCommit,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { useRepoSummaries, type RepoSummary } from "../../hooks/repos";
import { cn } from "../../lib/cn";

interface RepoDashboardProps {
  onSelect: (owner: string, repo: string) => void;
}

function formatRelative(dateStr?: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CiStatusIcon({ conclusion }: { conclusion?: string | null }) {
  if (!conclusion)
    return <Clock size={14} className="text-amber-500 animate-pulse" />;
  if (conclusion === "success")
    return <CheckCircle2 size={14} className="text-emerald-500" />;
  return <XCircle size={14} className="text-red-500" />;
}

export function RepoDashboard({ onSelect }: RepoDashboardProps) {
  const { data: summaries, isLoading } = useRepoSummaries();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!summaries?.length) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-zinc-500">
        No repos tracked. Click the settings icon to add repos.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
      {summaries.map((s: RepoSummary) => (
        <button
          key={`${s.owner}/${s.repo}`}
          onClick={() => onSelect(s.owner, s.repo)}
          className={cn(
            "text-left border border-zinc-200 dark:border-zinc-800 rounded-lg p-4",
            "hover:border-teal-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
          )}
        >
          {/* Repo name */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-zinc-400">{s.owner}/</span>
            <span className="text-sm font-semibold">{s.repo}</span>
          </div>

          {/* Latest commit */}
          <div className="flex items-start gap-2 mb-2">
            <GitCommit size={14} className="text-zinc-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs truncate">
                {s.latestCommit?.message || "No commits"}
              </p>
              <p className="text-[10px] text-zinc-500">
                {s.latestCommit?.authorLogin}{" "}
                {formatRelative(s.latestCommit?.date)}
              </p>
            </div>
          </div>

          {/* Latest release */}
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} className="text-zinc-400 shrink-0" />
            <span className="text-xs truncate">
              {s.latestRelease?.tagName || "No releases"}
            </span>
            {s.latestRelease && (
              <span className="text-[10px] text-zinc-500">
                {formatRelative(s.latestRelease.publishedAt)}
              </span>
            )}
          </div>

          {/* CI status */}
          <div className="flex items-center gap-2">
            <CiStatusIcon conclusion={s.latestRun?.conclusion} />
            <span className="text-xs truncate">
              {s.latestRun
                ? `${s.latestRun.name} #${s.latestRun.runNumber}`
                : "No CI runs"}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
