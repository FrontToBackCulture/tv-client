import { useState } from "react";
import {
  GitCommit,
  Tag,
  Play,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import {
  useCommits,
  useReleases,
  useWorkflowRuns,
  type RepoCommit,
  type RepoRelease,
  type WorkflowRun,
} from "../../hooks/repos";
import { cn } from "../../lib/cn";

type Tab = "commits" | "releases" | "ci";

interface RepoDetailProps {
  owner: string;
  repo: string;
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function OpenLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-zinc-400 hover:text-teal-500 shrink-0"
      title="Open in GitHub"
    >
      <ExternalLink size={13} />
    </a>
  );
}

function CommitsList({
  commits,
  isLoading,
}: {
  commits: RepoCommit[];
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {commits.map((c) => (
        <div
          key={c.sha}
          className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
        >
          {c.authorAvatar ? (
            <img
              src={c.authorAvatar}
              alt={c.authorLogin}
              className="w-6 h-6 rounded-full mt-0.5 shrink-0"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{c.message}</p>
            <p className="text-xs text-zinc-500">
              <span className="font-medium">{c.authorLogin}</span>{" "}
              <code className="text-[10px] text-zinc-400">
                {c.sha.slice(0, 7)}
              </code>{" "}
              · {formatRelative(c.date)}
            </p>
          </div>
          <OpenLink url={c.htmlUrl} />
        </div>
      ))}
    </div>
  );
}

function ReleasesList({
  releases,
  isLoading,
}: {
  releases: RepoRelease[];
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );

  if (!releases.length)
    return (
      <p className="text-sm text-zinc-500 text-center py-8">No releases</p>
    );

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {releases.map((r) => (
        <div
          key={r.id}
          className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
        >
          <Tag size={14} className="text-zinc-400 mt-1 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{r.tagName}</span>
              {r.prerelease && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  pre-release
                </span>
              )}
            </div>
            {r.name && r.name !== r.tagName && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {r.name}
              </p>
            )}
            <p className="text-xs text-zinc-500">
              {r.authorLogin} · {formatRelative(r.publishedAt)}
            </p>
          </div>
          <OpenLink url={r.htmlUrl} />
        </div>
      ))}
    </div>
  );
}

function CiList({
  runs,
  isLoading,
}: {
  runs: WorkflowRun[];
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );

  if (!runs.length)
    return (
      <p className="text-sm text-zinc-500 text-center py-8">
        No workflow runs
      </p>
    );

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {runs.map((r) => {
        const icon =
          r.conclusion === "success" ? (
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          ) : r.conclusion === "failure" ? (
            <XCircle size={14} className="text-red-500 shrink-0" />
          ) : (
            <Clock size={14} className="text-amber-500 animate-pulse shrink-0" />
          );

        return (
          <div
            key={r.id}
            className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
          >
            <div className="mt-1">{icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {r.name}{" "}
                <span className="text-zinc-400">#{r.runNumber}</span>
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {r.headCommitMessage || r.headBranch}
              </p>
              <p className="text-[10px] text-zinc-400">
                {r.headBranch} · {formatRelative(r.createdAt)}
              </p>
            </div>
            <OpenLink url={r.htmlUrl} />
          </div>
        );
      })}
    </div>
  );
}

export function RepoDetail({ owner, repo }: RepoDetailProps) {
  const [tab, setTab] = useState<Tab>("commits");

  const { data: commits = [], isLoading: commitsLoading } = useCommits(
    owner,
    repo
  );
  const { data: releases = [], isLoading: releasesLoading } = useReleases(
    owner,
    repo
  );
  const { data: runs = [], isLoading: runsLoading } = useWorkflowRuns(
    owner,
    repo
  );

  const tabs: { id: Tab; label: string; icon: typeof GitCommit }[] = [
    { id: "commits", label: "Commits", icon: GitCommit },
    { id: "releases", label: "Releases", icon: Tag },
    { id: "ci", label: "CI/CD", icon: Play },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-2 pb-1 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors",
                tab === t.id
                  ? "bg-zinc-200 dark:bg-zinc-800 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "commits" && (
        <CommitsList commits={commits} isLoading={commitsLoading} />
      )}
      {tab === "releases" && (
        <ReleasesList releases={releases} isLoading={releasesLoading} />
      )}
      {tab === "ci" && <CiList runs={runs} isLoading={runsLoading} />}
    </div>
  );
}
