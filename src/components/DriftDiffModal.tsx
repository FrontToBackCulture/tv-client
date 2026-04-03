// Shared drift diff modal — shows side-by-side file comparison between
// source (_skills/) and a distributed copy (bot or domain).
// Used by BotOverviewPanel and DomainAiTab.

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  Sparkles,
  FileDiff,
  Plus,
  Minus,
  FileEdit,
  File,
  ChevronDown,
  Check,
  RefreshCw,
} from "lucide-react";
import { cn } from "../lib/cn";
import { invoke } from "@tauri-apps/api/core";
import { useSkillDiff, useSkillDistribute } from "../modules/skills/useSkillRegistry";
import type { SkillDiffResult } from "../modules/skills/useSkillRegistry";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FILE_STATUS_CONFIG: Record<string, { icon: typeof File; color: string; bg: string; label: string }> = {
  modified: { icon: FileEdit, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20", label: "Modified" },
  added: { icon: Plus, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", label: "Added" },
  removed: { icon: Minus, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20", label: "Removed" },
  unchanged: { icon: File, color: "text-zinc-400", bg: "", label: "Unchanged" },
};

function buildSideBySideLines(hunks: { lines: { kind: string; content: string }[] }[]): { left: { kind: string; content: string } | null; right: { kind: string; content: string } | null }[][] {
  return hunks.map((hunk) => {
    const pairs: { left: { kind: string; content: string } | null; right: { kind: string; content: string } | null }[] = [];
    let i = 0;
    const lines = hunk.lines;
    while (i < lines.length) {
      const line = lines[i];
      if (line.kind === "context") {
        pairs.push({ left: { kind: "context", content: line.content }, right: { kind: "context", content: line.content } });
        i++;
      } else {
        const removes: typeof lines = [];
        const adds: typeof lines = [];
        while (i < lines.length && lines[i].kind === "remove") { removes.push(lines[i]); i++; }
        while (i < lines.length && lines[i].kind === "add") { adds.push(lines[i]); i++; }
        const max = Math.max(removes.length, adds.length);
        for (let j = 0; j < max; j++) {
          pairs.push({
            left: j < removes.length ? removes[j] : null,
            right: j < adds.length ? adds[j] : null,
          });
        }
      }
    }
    return pairs;
  });
}

function formatSize(bytes: number) {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── Drift Badge ────────────────────────────────────────────────────────────

/** Clickable drift badge for use in skill cards */
export function DriftBadge({
  status,
  targetModified,
  onClick,
}: {
  status: "drifted" | "in_sync" | "not_distributed" | "missing" | string;
  targetModified?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  if (status === "drifted") {
    return (
      <span
        role={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 ml-auto",
          onClick && "hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-300 dark:hover:border-amber-700 transition-colors cursor-pointer"
        )}
        title={onClick ? "Click to see what changed" : "Out of sync with _skills/ source"}
      >
        <RefreshCw size={9} />
        drifted
      </span>
    );
  }
  if (status === "in_sync") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 dark:text-emerald-400 ml-auto" title="In sync with _skills/ source">
        <Check size={9} />
        synced{targetModified ? ` · ${targetModified}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 ml-auto" title="Not tracked">
      not tracked
    </span>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export function DriftDiffModal({
  slug,
  skillName,
  targetPath,
  leftLabel = "Current copy",
  rightLabel = "Source (_skills/)",
  onClose,
  onSynced,
}: {
  slug: string;
  skillName: string;
  targetPath: string;
  leftLabel?: string;
  rightLabel?: string;
  onClose: () => void;
  onSynced: () => void;
}) {
  const diffMutation = useSkillDiff();
  const distributeMutation = useSkillDistribute();
  const [diffResult, setDiffResult] = useState<SkillDiffResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const toggleExpand = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  useEffect(() => {
    diffMutation.mutateAsync({ slug, targetPath }).then(setDiffResult);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changedFiles = diffResult?.files.filter((f) => f.status !== "unchanged") ?? [];
  const unchangedFiles = diffResult?.files.filter((f) => f.status === "unchanged") ?? [];

  const handleSync = async () => {
    setSyncing(true);
    try {
      await distributeMutation.mutateAsync(slug);
      onSynced();
      onClose();
    } catch (err) {
      console.error("Failed to sync skill:", err);
      setSyncing(false);
    }
  };

  const handleAiSummary = async () => {
    if (aiSummary || aiLoading || !diffResult) return;
    setAiLoading(true);
    try {
      const diffText = changedFiles.map((f) => {
        let text = `File: ${f.path} (${f.status})\n`;
        if (f.hunks) {
          for (const hunk of f.hunks) {
            for (const line of hunk.lines) {
              if (line.kind === "add") text += `+ ${line.content}\n`;
              else if (line.kind === "remove") text += `- ${line.content}\n`;
            }
          }
        }
        return text;
      }).join("\n");

      const result = await invoke<string>("ai_summarize_diff", {
        skillName,
        diffText: diffText.slice(0, 8000),
      });
      setAiSummary(result);
    } catch {
      setAiSummary("Could not generate summary.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-full flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileDiff size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{skillName}</span>
              {diffResult && <span className="text-xs text-zinc-400">{diffResult.summary} · {diffResult.files.length} files</span>}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {diffMutation.isPending && !diffResult && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
              <span className="ml-2 text-sm text-zinc-400">Comparing files...</span>
            </div>
          )}

          {diffResult && (
            <div className="px-5 py-4 space-y-3">
              {/* AI Summary */}
              {aiSummary && (
                <div className="px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={11} className="text-blue-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">AI Summary</span>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">{aiSummary}</p>
                </div>
              )}

              {/* Changed files */}
              {changedFiles.map((f) => {
                const cfg = FILE_STATUS_CONFIG[f.status] || FILE_STATUS_CONFIG.unchanged;
                const Icon = cfg.icon;
                const hasHunks = f.hunks && f.hunks.length > 0;
                const isExpanded = expandedFiles.has(f.path);
                const sideBySide = hasHunks ? buildSideBySideLines(f.hunks!) : [];

                return (
                  <div key={f.path} className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div
                      role={hasHunks ? "button" : undefined}
                      onClick={hasHunks ? () => toggleExpand(f.path) : undefined}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/50",
                        hasHunks && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      )}
                    >
                      {hasHunks && (
                        <ChevronDown size={10} className={cn("text-zinc-400 transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
                      )}
                      <Icon size={12} className={cn(cfg.color, "flex-shrink-0")} />
                      <span className="font-mono text-zinc-700 dark:text-zinc-300 flex-1 truncate">{f.path}</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", cfg.bg, cfg.color)}>{cfg.label}</span>
                      {f.status === "modified" && (
                        <span className="text-zinc-400 tabular-nums">{formatSize(f.target_size)} → {formatSize(f.source_size)}</span>
                      )}
                    </div>

                    {isExpanded && hasHunks && (
                      <div className="overflow-x-auto">
                        <div className="grid grid-cols-2 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-medium text-zinc-400">
                          <div className="px-3 py-1 border-r border-zinc-200 dark:border-zinc-800 bg-red-50/50 dark:bg-red-900/10">{leftLabel}</div>
                          <div className="px-3 py-1 bg-emerald-50/50 dark:bg-emerald-900/10">{rightLabel}</div>
                        </div>
                        {sideBySide.map((hunkPairs, hi) => (
                          <div key={hi}>
                            {hi > 0 && (
                              <div className="grid grid-cols-2 border-t border-zinc-200 dark:border-zinc-800">
                                <div className="px-3 py-0.5 text-[10px] text-zinc-300 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-800/50 border-r border-zinc-200 dark:border-zinc-800">···</div>
                                <div className="px-3 py-0.5 text-[10px] text-zinc-300 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-800/50">···</div>
                              </div>
                            )}
                            {hunkPairs.map((pair, pi) => (
                              <div key={pi} className="grid grid-cols-2 text-[11px] font-mono leading-relaxed">
                                <div className={cn(
                                  "px-3 py-0.5 whitespace-pre-wrap break-all border-r border-zinc-200 dark:border-zinc-800 min-h-[1.5em]",
                                  pair.left?.kind === "remove" && "bg-red-50 dark:bg-red-900/15 text-red-800 dark:text-red-300",
                                  pair.left?.kind === "context" && "text-zinc-500 dark:text-zinc-400",
                                  !pair.left && "bg-zinc-50 dark:bg-zinc-800/30"
                                )}>
                                  {pair.left ? pair.left.content : ""}
                                </div>
                                <div className={cn(
                                  "px-3 py-0.5 whitespace-pre-wrap break-all min-h-[1.5em]",
                                  pair.right?.kind === "add" && "bg-emerald-50 dark:bg-emerald-900/15 text-emerald-800 dark:text-emerald-300",
                                  pair.right?.kind === "context" && "text-zinc-500 dark:text-zinc-400",
                                  !pair.right && "bg-zinc-50 dark:bg-zinc-800/30"
                                )}>
                                  {pair.right ? pair.right.content : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unchanged files toggle */}
              {unchangedFiles.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowUnchanged(!showUnchanged)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    {showUnchanged ? "Hide" : "Show"} {unchangedFiles.length} unchanged {unchangedFiles.length === 1 ? "file" : "files"}
                  </button>
                  {showUnchanged && (
                    <div className="space-y-1 mt-1">
                      {unchangedFiles.map((f) => (
                        <div key={f.path} className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400">
                          <File size={12} />
                          <span className="font-mono truncate">{f.path}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[240px]" title={targetPath}>{targetPath}</span>
          <div className="flex items-center gap-2">
            {diffResult && changedFiles.length > 0 && (
              <button
                onClick={handleAiSummary}
                disabled={aiLoading || !!aiSummary}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all",
                  aiLoading || aiSummary
                    ? "border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed"
                    : "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                )}
              >
                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {aiSummary ? "Summarized" : "Summarize"}
              </button>
            )}
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
              Close
            </button>
            <button
              onClick={handleSync}
              disabled={syncing || !diffResult || changedFiles.length === 0}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                syncing || !diffResult || changedFiles.length === 0
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-600 text-white"
              )}
            >
              {syncing ? (
                <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Syncing...</span>
              ) : (
                "Sync from source"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
