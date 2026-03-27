// src/modules/skills/SkillDetailPanel.tsx
// Right panel — tree sidebar + content viewer (replaces tabbed layout)

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  X, FileText, FolderOpen, ArrowDownToLine, ArrowUpFromLine,
  CheckCircle2, AlertTriangle, Circle, Loader2, ExternalLink,
  Send, Bot, Boxes, ChevronDown, Microscope,
  Tag, Terminal, Globe, PenTool, Eye, Copy, GitBranch, History,
  AppWindow,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";
import { useFileTree, useReadFile, type TreeNode } from "../../hooks/useFiles";
import { useKnowledgePaths, useFolderConfig } from "../../hooks/useKnowledgePaths";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { ExcalidrawViewer } from "../library/viewers/ExcalidrawViewer";
import {
  type SkillEntry,
  type SkillRegistry,
  type SkillDriftStatus,
  useSkillDistribute,
  useSkillPull,
  useSkillDistributeTo,
  useSkillListBots,
  useSkillInspect,
} from "./useSkillRegistry";
import { useJobsStore } from "../../stores/jobsStore";
import { toast } from "../../stores/toastStore";
import { useUpdateSkill } from "../../hooks/skills/useSkills";
import { useSkillActivityLog } from "../../hooks/skills/useSkillActivity";
import { SKILL_STATUS_CONFIG, type SkillStatus } from "../../playground/botPlaygroundTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SkillDetailPanelProps {
  slug: string;
  skill: SkillEntry;
  registry: SkillRegistry;
  driftStatuses: SkillDriftStatus[];
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

const driftStatusConfig: Record<string, { icon: typeof CheckCircle2; label: string; color: string }> = {
  in_sync: { icon: CheckCircle2, label: "In sync", color: "text-emerald-500" },
  drifted: { icon: AlertTriangle, label: "Drifted", color: "text-amber-500" },
  not_distributed: { icon: Circle, label: "Not distributed", color: "text-zinc-400" },
  missing: { icon: Circle, label: "Missing", color: "text-red-400" },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function SkillDetailPanel({ slug, skill, driftStatuses, onClose, onOpenFile }: SkillDetailPanelProps) {
  const paths = useKnowledgePaths();
  const folderConfig = useFolderConfig();
  const skillPath = paths ? `${paths.skills}/${slug}` : undefined;
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDistPanel, setShowDistPanel] = useState(false);
  const [showActivityView, setShowActivityView] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const updateSkill = useUpdateSkill();
  const { data: activityLog, isLoading: activityLoading } = useSkillActivityLog(showActivityView ? slug : undefined);
  const inspectMutation = useSkillInspect();
  const queryClient = useQueryClient();
  const { addJob, updateJob } = useJobsStore();
  const inspectJobId = useRef<string | null>(null);

  const handleInspect = useCallback(() => {
    const jobId = `inspect-${slug}-${Date.now()}`;
    inspectJobId.current = jobId;

    // Register in jobs store (shows in status bar)
    addJob({ id: jobId, name: `Inspect: ${slug}`, status: "running", message: "Claude is analyzing..." });

    // Show loading toast
    const toastId = toast.loading(`Inspecting ${slug}...`);

    inspectMutation.mutate(
      { slug },
      {
        onSuccess: (result) => {
          if (result.success && result.output_path) {
            updateJob(jobId, { status: "completed", message: "Report generated" });
            toast.update(toastId, { type: "success", message: `Inspection complete — ${slug}`, duration: 4000 });
            // Refresh file tree and auto-select the report
            queryClient.invalidateQueries({ queryKey: ["fileTree"] }).then(() => {
              setSelectedPath(result.output_path);
            });
          } else {
            updateJob(jobId, { status: "failed", message: result.error || "Report not generated" });
            toast.update(toastId, { type: "error", message: result.error || "Inspection failed", duration: 5000 });
          }
        },
        onError: (err) => {
          updateJob(jobId, { status: "failed", message: String(err) });
          toast.update(toastId, { type: "error", message: `Inspection failed: ${err}`, duration: 5000 });
        },
      }
    );
  }, [slug, inspectMutation, queryClient, addJob, updateJob]);

  // Read recursive file tree
  const { data: tree } = useFileTree(skillPath, 3);

  // Flatten tree for counting
  const allFiles = useMemo(() => {
    if (!tree?.children) return [];
    return flattenTree(tree.children);
  }, [tree]);

  // Auto-select SKILL.md (or README.md) on mount
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!skillPath || !tree?.children || selectedPath) return;
    const skillMd = tree.children.find(f => f.name === "SKILL.md");
    const readmeMd = tree.children.find(f => f.name === "README.md");
    const target = skillMd || readmeMd || tree.children.find(f => !f.is_directory);
    if (target) setSelectedPath(target.path);
  }, [skillPath, tree, selectedPath]);

  // Read selected file content
  const { data: fileContent } = useReadFile(selectedPath ?? undefined);

  // Selected file node
  const selectedNode = useMemo(() => {
    if (!selectedPath) return null;
    return allFiles.find(f => f.path === selectedPath) ?? null;
  }, [allFiles, selectedPath]);

  // Mentioned count (distributions that are in bots)
  const safeDistributions = Array.isArray(skill.distributions) ? skill.distributions : [];

  const mentionedCount = safeDistributions.filter(d => d.type === "bot").length;

  const handleStatusChange = (newStatus: SkillStatus) => {
    updateSkill.mutate({ slug, updates: { status: newStatus } });
    setShowStatusMenu(false);
  };

  const currentStatus = skill.status as SkillStatus;
  const statusCfg = SKILL_STATUS_CONFIG[currentStatus] ?? SKILL_STATUS_CONFIG.active;

  // Relative filename for breadcrumb
  const selectedRelPath = useMemo(() => {
    if (!selectedPath || !skillPath) return selectedNode?.name ?? "";
    return selectedPath.replace(skillPath + "/", "");
  }, [selectedPath, skillPath, selectedNode]);

  // File tree context menu
  const [fileCtxMenu, setFileCtxMenu] = useState<{ x: number; y: number; path: string; isDirectory: boolean } | null>(null);

  // Sidebar width (resizable)
  const [sidebarWidth, setSidebarWidth] = useState(180);
  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      setSidebarWidth(Math.max(120, Math.min(300, startWidth + delta)));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }, [sidebarWidth]);

  return (
    <div className="h-full flex flex-col">
      {/* ── Header: name + slug + status + actions ── */}
      <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {skill.name}
            </span>
            <span
              className="text-xs text-zinc-400 font-mono flex-shrink-0 cursor-pointer hover:text-teal-500 transition-colors"
              title="Click to copy path"
              onClick={() => {
                navigator.clipboard.writeText(`${folderConfig.skills}/${slug}/SKILL.md`);
                setCopiedSlug(true);
                setTimeout(() => setCopiedSlug(false), 1500);
              }}
            >
              {copiedSlug ? "Copied!" : slug}
            </span>
            {/* Status badge */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors",
                  statusCfg.badge,
                  statusCfg.text,
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
                {statusCfg.label}
                <ChevronDown size={8} />
              </button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50">
                    {(["active", "test", "review", "draft", "inactive", "deprecated"] as SkillStatus[]).map((s) => {
                      const cfg = SKILL_STATUS_CONFIG[s];
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={cn(
                            "w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700",
                            s === currentStatus && "bg-zinc-50 dark:bg-zinc-700"
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                          <span className="text-zinc-700 dark:text-zinc-300">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Mentioned count */}
            {mentionedCount > 0 && (
              <span className="text-xs text-teal-600 dark:text-teal-400 flex-shrink-0">
                {mentionedCount} mentioned
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              title={inspectMutation.isPending ? "Inspecting... (Claude is running)" : "Inspect skill"}
              onClick={inspectMutation.isPending ? undefined : handleInspect}
              disabled={inspectMutation.isPending}
              className={cn(
                "p-1 rounded transition-colors",
                inspectMutation.isPending
                  ? "text-teal-500 cursor-wait"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              )}
            >
              {inspectMutation.isPending
                ? <Loader2 size={16} className="animate-spin" />
                : <Microscope size={16} />
              }
            </button>
            <IconButton
              icon={GitBranch}
              label="Distribution"
              onClick={() => setShowDistPanel(!showDistPanel)}
              className={showDistPanel ? "text-teal-600 bg-teal-50 dark:bg-teal-900/30" : ""}
            />
            <IconButton
              icon={History}
              label="Activity log"
              onClick={() => setShowActivityView(!showActivityView)}
              className={showActivityView ? "text-teal-600 bg-teal-50 dark:bg-teal-900/30" : ""}
            />
            {onOpenFile && selectedPath && (
              <IconButton icon={ExternalLink} label="Open in editor" onClick={() => onOpenFile(selectedPath)} />
            )}
            <IconButton icon={X} label="Close" onClick={onClose} />
          </div>
        </div>

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <MetaChip icon={Tag} label={skill.category} />
          <MetaChip icon={skill.target === "bot" ? Bot : Boxes} label={skill.target} />
          {skill.command && <MetaChip icon={Terminal} label={skill.command} mono />}
          {skill.domain && <MetaChip icon={Globe} label={skill.domain} />}
          {skill.verified && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <CheckCircle2 size={10} />
              verified{skill.rating != null && ` · ${skill.rating}/10`}
            </span>
          )}
        </div>
      </div>

      {/* ── Distribution panel (collapsible) ── */}
      {showDistPanel && (
        <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50 max-h-[300px] overflow-y-auto">
          <DistributionPanel
            slug={slug}
            skill={skill}
            driftStatuses={driftStatuses}
          />
        </div>
      )}

      {/* ── Body ── */}
      {showActivityView ? (
        /* ── Activity log view (replaces file tree + content) ── */
        <div className="flex-1 overflow-auto">
          <ActivityView activities={activityLog ?? []} isLoading={activityLoading} />
        </div>
      ) : (
        /* ── File tree + content pane ── */
        <div className="flex-1 flex overflow-hidden">
          {/* Left: file tree */}
          <div
            className="flex-shrink-0 overflow-y-auto border-r border-zinc-100 dark:border-zinc-800/50 py-1"
            style={{ width: sidebarWidth }}
          >
            {tree?.children ? (
              tree.children.map((node) => (
                <FileTreeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  skillPath={skillPath}
                  selectedPath={selectedPath ?? undefined}
                  onSelect={(file) => setSelectedPath(file.path)}
                  onContextMenu={(e, path, isDirectory) => {
                    e.preventDefault();
                    setFileCtxMenu({ x: e.clientX, y: e.clientY, path, isDirectory });
                  }}
                />
              ))
            ) : (
              <SectionLoading className="py-4" />
            )}
            {fileCtxMenu && (
              <FileTreeContextMenu
                x={fileCtxMenu.x}
                y={fileCtxMenu.y}
                path={fileCtxMenu.path}
                isDirectory={fileCtxMenu.isDirectory}
                onClose={() => setFileCtxMenu(null)}
              />
            )}
          </div>

          {/* Resize handle */}
          <div
            onPointerDown={handleResizePointerDown}
            className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors touch-none"
          />

          {/* Right: content viewer */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Breadcrumb bar */}
            {selectedNode && (
              <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">
                  {selectedRelPath}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {selectedPath && (
                    <>
                      {onOpenFile && (
                        <>
                          <IconButton icon={Eye} label="Preview" size={14} onClick={() => {}} className="text-zinc-400" />
                          <IconButton icon={PenTool} label="Edit" size={14} onClick={() => onOpenFile(selectedPath)} className="text-zinc-400" />
                        </>
                      )}
                      <IconButton
                        icon={AppWindow}
                        label="Open with default app"
                        size={14}
                        onClick={() => invoke("open_with_default_app", { path: selectedPath })}
                        className="text-zinc-400"
                      />
                      <IconButton
                        icon={Copy}
                        label="Copy path"
                        size={14}
                        onClick={() => navigator.clipboard.writeText(selectedPath)}
                        className="text-zinc-400"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-auto flex flex-col">
              {!selectedNode && (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  Select a file to preview
                </div>
              )}

              {selectedNode && !fileContent && (
                <SectionLoading className="py-6" />
              )}

              {selectedNode && fileContent && (
                <FileContentViewer
                  node={selectedNode}
                  content={fileContent}
                  basePath={skillPath}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── File Content Viewer ──────────────────────────────────────────────────────

function FileContentViewer({ node, content, basePath }: {
  node: TreeNode;
  content: string;
  basePath: string | undefined;
}) {
  const name = node.name;

  // HTML files
  const iframeSrcDoc = useMemo(() => {
    if (!name.endsWith(".html")) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (content.includes("</head>")) {
      return content.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + content;
  }, [content, name]);

  const [iframeHeight, setIframeHeight] = useState<number | undefined>(undefined);
  const iframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const h = doc.body.scrollHeight + 20;
          // Only set explicit height if content is taller than a reasonable min
          // (pages using 100vh will report the iframe viewport height — keep them flex-filled)
          if (h > 600) setIframeHeight(h);
        }
      } catch { /* cross-origin safety */ }
    };
    iframe.addEventListener("load", handleLoad);
  }, []);

  if (name.endsWith(".html")) {
    return (
      <iframe
        ref={iframeRef}
        srcDoc={iframeSrcDoc}
        className="w-full border-0 flex-1"
        sandbox="allow-same-origin allow-scripts"
        title={name}
        style={iframeHeight ? { height: iframeHeight, flex: "none" } : { minHeight: 500 }}
      />
    );
  }

  if (name.endsWith(".md")) {
    return (
      <div className="px-4 py-3">
        <MarkdownViewer content={content} basePath={basePath} />
      </div>
    );
  }

  if (name.endsWith(".excalidraw")) {
    return <ExcalidrawViewer content={content} filename={name} />;
  }

  // Raw text: .sh, .sql, .json, .yaml, etc.
  return (
    <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap overflow-auto">
      {content}
    </pre>
  );
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function MetaChip({ icon: Icon, label, mono }: { icon: typeof Tag; label: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
      <Icon size={10} className="flex-shrink-0" />
      <span className={mono ? "font-mono" : ""}>{label}</span>
    </span>
  );
}

// ─── File Tree ───────────────────────────────────────────────────────────────

function FileTreeRow({ node, depth, skillPath, selectedPath, onSelect, onContextMenu }: {
  node: TreeNode;
  depth: number;
  skillPath: string | undefined;
  selectedPath?: string;
  onSelect: (file: TreeNode) => void;
  onContextMenu?: (e: React.MouseEvent, path: string, isDirectory: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.is_directory && node.children && node.children.length > 0;
  const isSelected = !node.is_directory && selectedPath === node.path;

  return (
    <>
      <button
        onClick={() => {
          if (node.is_directory) setExpanded(!expanded);
          else onSelect(node);
        }}
        onContextMenu={(e) => onContextMenu?.(e, node.path, node.is_directory)}
        className={cn(
          "w-full flex items-center gap-1.5 py-1 text-left transition-colors",
          isSelected
            ? "bg-teal-50 dark:bg-teal-900/30"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        )}
        style={{ paddingLeft: `${12 + depth * 14}px`, paddingRight: 8 }}
      >
        {node.is_directory ? (
          <>
            <ChevronDown
              size={10}
              className={cn(
                "text-zinc-400 flex-shrink-0 transition-transform",
                !expanded && "-rotate-90"
              )}
            />
            <FolderOpen size={13} className="text-amber-500 flex-shrink-0" />
          </>
        ) : (
          <>
            <span className="w-2.5 flex-shrink-0" />
            <FileIcon name={node.name} isSelected={isSelected} />
          </>
        )}
        <span className={cn(
          "text-xs truncate",
          isSelected ? "text-teal-700 dark:text-teal-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
        )}>
          {node.name.endsWith(".excalidraw") ? node.name.replace(".excalidraw", "") + "..." : node.name}
        </span>
      </button>
      {expanded && hasChildren && node.children!.map((child) => (
        <FileTreeRow key={child.path} node={child} depth={depth + 1} skillPath={skillPath} selectedPath={selectedPath} onSelect={onSelect} onContextMenu={onContextMenu} />
      ))}
    </>
  );
}

// ─── File Tree Context Menu ──────────────────────────────────────────────────

function FileTreeContextMenu({ x, y, path, isDirectory, onClose }: {
  x: number;
  y: number;
  path: string;
  isDirectory: boolean;
  onClose: () => void;
}) {
  const handleOpenWithDefault = async () => {
    try { await invoke("open_with_default_app", { path }); } catch (err) { console.error("Failed to open:", err); }
    onClose();
  };
  const handleShowInFinder = async () => {
    try { await invoke("open_in_finder", { path }); } catch (err) { console.error("Failed to show in Finder:", err); }
    onClose();
  };
  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(path);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        {!isDirectory && (
          <button
            onClick={handleOpenWithDefault}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <AppWindow size={14} />
            Open with Default App
          </button>
        )}
        <button
          onClick={handleShowInFinder}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <FolderOpen size={14} />
          Show in Finder
        </button>
        <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
        <button
          onClick={handleCopyPath}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Copy size={14} />
          Copy Path
        </button>
      </div>
    </>
  );
}

function FileIcon({ name, isSelected }: { name: string; isSelected: boolean }) {
  if (name.endsWith(".excalidraw")) {
    return <PenTool size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-violet-400")} />;
  }
  if (name.endsWith(".md")) {
    return <FileText size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-blue-400")} />;
  }
  if (name.endsWith(".html")) {
    return <FileText size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-orange-400")} />;
  }
  return <FileText size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-zinc-400")} />;
}

// ─── Distribution Panel ─────────────────────────────────────────────────────

function DistributionPanel({ slug, skill, driftStatuses }: {
  slug: string;
  skill: SkillEntry;
  driftStatuses: SkillDriftStatus[];
}) {
  const { data: bots = [] } = useSkillListBots();
  const distribute = useSkillDistribute();
  const distributeTo = useSkillDistributeTo();
  const pull = useSkillPull();
  const [actionSlug, setActionSlug] = useState<string | null>(null);
  const [showDistributeMenu, setShowDistributeMenu] = useState(false);

  const handleDistributeAll = async () => {
    setActionSlug("distribute");
    try { await distribute.mutateAsync(slug); } finally { setActionSlug(null); }
  };

  const handleDistributeToBot = async (botSkillsPath: string) => {
    setActionSlug("distribute-to");
    setShowDistributeMenu(false);
    try { await distributeTo.mutateAsync({ slug, targetPath: botSkillsPath, distType: "bot" }); } finally { setActionSlug(null); }
  };

  const handlePull = async (targetPath: string) => {
    setActionSlug(`pull:${targetPath}`);
    try { await pull.mutateAsync({ slug, targetPath }); } finally { setActionSlug(null); }
  };

  const handlePush = async (targetPath: string, distType: "bot" | "platform") => {
    setActionSlug(`push:${targetPath}`);
    try { await distributeTo.mutateAsync({ slug, targetPath, distType }); } finally { setActionSlug(null); }
  };

  const safeDistributions = Array.isArray(skill.distributions) ? skill.distributions : [];

  const registeredPaths = new Set(safeDistributions.map((d: { path: string }) => d.path));
  const discoveredDrifts = driftStatuses.filter(
    d => d.slug === slug && !registeredPaths.has(d.distribution_path)
  );

  const allDistributions = useMemo(() => {
    const registered = safeDistributions.map((d: { path: string; type: string }) => ({
      path: d.path,
      type: d.type,
      isRegistered: true,
    }));
    const discovered = discoveredDrifts.map(d => ({
      path: d.distribution_path,
      type: d.distribution_path.startsWith("_team/") ? "bot" : "platform",
      isRegistered: false,
    }));
    return [...registered, ...discovered];
  }, [safeDistributions, discoveredDrifts]);

  const distributedBotPaths = new Set(
    allDistributions
      .filter(d => d.type === "bot")
      .map(d => { const p = d.path.split("/"); p.pop(); return p.join("/"); })
  );

  return (
    <div className="px-4 py-2">
      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {allDistributions.filter(d => d.isRegistered).length > 0 && (
          <Button
            size="sm"
            onClick={handleDistributeAll}
            disabled={actionSlug !== null}
            loading={actionSlug === "distribute"}
            icon={ArrowDownToLine}
          >
            Distribute All
          </Button>
        )}
        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowDistributeMenu(!showDistributeMenu)}
            disabled={actionSlug !== null}
            loading={actionSlug === "distribute-to"}
            icon={Send}
            iconRight={ChevronDown}
          >
            Distribute to...
          </Button>
          {showDistributeMenu && (
            <DistributeMenu
              bots={bots}
              distributedBotPaths={distributedBotPaths}
              onSelectBot={handleDistributeToBot}
              onClose={() => setShowDistributeMenu(false)}
            />
          )}
        </div>
      </div>

      {/* Distribution targets */}
      {allDistributions.length > 0 ? (
        <div className="space-y-1.5">
          {allDistributions.map((dist) => {
            const drift = driftStatuses.find(d => d.distribution_path === dist.path);
            const cfg = driftStatusConfig[drift?.status || "not_distributed"];
            const StatusIcon = cfg.icon;
            const distType = dist.type === "platform" ? "platform" as const : "bot" as const;
            const isPushing = actionSlug === `push:${dist.path}`;
            const isPulling = actionSlug === `pull:${dist.path}`;
            const isBusy = actionSlug !== null;
            const notInSync = drift?.status && drift.status !== "in_sync";

            return (
              <div key={dist.path} className="flex items-center gap-2 text-xs">
                <StatusIcon size={12} className={cfg.color} />
                <span className="text-zinc-400 font-mono truncate flex-1">{dist.path}</span>
                <span className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px]">
                  {dist.type}
                </span>
                {!dist.isRegistered && (
                  <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                    discovered
                  </span>
                )}
                <button
                  onClick={() => handlePush(dist.path, distType)}
                  disabled={isBusy}
                  className={cn("disabled:opacity-50", notInSync ? "text-teal-600" : "text-zinc-400 hover:text-zinc-600")}
                  title="Push to target"
                >
                  {isPushing ? <Loader2 size={11} className="animate-spin" /> : <ArrowDownToLine size={11} />}
                </button>
                <button
                  onClick={() => handlePull(dist.path)}
                  disabled={isBusy}
                  className={cn("disabled:opacity-50", drift?.status === "drifted" ? "text-amber-600" : "text-zinc-400 hover:text-zinc-600")}
                  title="Pull to source"
                >
                  {isPulling ? <Loader2 size={11} className="animate-spin" /> : <ArrowUpFromLine size={11} />}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">No targets. Use "Distribute to..." to push this skill.</p>
      )}
    </div>
  );
}

// ─── Distribute Menu ─────────────────────────────────────────────────────────

function DistributeMenu({
  bots,
  distributedBotPaths,
  onSelectBot,
  onClose,
}: {
  bots: { name: string; label: string; skills_path: string; has_skills_dir: boolean }[];
  distributedBotPaths: Set<string>;
  onSelectBot: (skillsPath: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl py-1">
        <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Bots</div>
        {bots.map((bot) => {
          const alreadyDistributed = distributedBotPaths.has(bot.skills_path);
          return (
            <button
              key={bot.skills_path}
              onClick={() => onSelectBot(bot.skills_path)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left"
            >
              <Bot size={14} className="text-zinc-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-zinc-700 dark:text-zinc-300">{bot.label}</span>
                {!bot.has_skills_dir && <span className="ml-1 text-xs text-zinc-400">(no skills/ yet)</span>}
              </div>
              {alreadyDistributed && <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />}
            </button>
          );
        })}
        {bots.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">No bots found</p>}
      </div>
    </>
  );
}

// ─── Activity View ───────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  file_path: string;
  action: string;
  actor: string | null;
  machine: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

function ActivityView({ activities, isLoading }: { activities: ActivityEntry[]; isLoading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <SectionLoading className="py-6" />;

  if (activities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-zinc-400">
        No changes recorded yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {activities.map((a) => {
        const d = new Date(a.created_at);
        const timeStr = d.toLocaleDateString("en-SG", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false });
        const isExpanded = expandedId === a.id;
        const hasDiff = a.old_value || a.new_value;
        const actionColor = a.action === "create"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";

        return (
          <div key={a.id}>
            <button
              onClick={() => hasDiff && setExpandedId(isExpanded ? null : a.id)}
              className={cn(
                "w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors",
                hasDiff ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : "cursor-default",
              )}
            >
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0", actionColor)}>
                {a.action}
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono truncate flex-1" title={a.file_path}>
                {a.file_path}
              </span>
              <span className="text-xs text-zinc-400 flex-shrink-0">{a.actor ?? "unknown"}</span>
              <span className="text-[11px] text-zinc-300 dark:text-zinc-600 flex-shrink-0 tabular-nums">{timeStr}</span>
              {hasDiff && (
                <ChevronDown size={12} className={cn("text-zinc-400 flex-shrink-0 transition-transform", isExpanded && "rotate-180")} />
              )}
            </button>

            {isExpanded && hasDiff && (
              <div className="px-4 pb-3">
                <DiffView oldValue={a.old_value} newValue={a.new_value} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiffView({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  const oldLines = (oldValue ?? "").split("\n");
  const newLines = (newValue ?? "").split("\n");
  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-mono">
      {/* Header */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="flex-1 px-2 py-1 text-zinc-500 font-medium border-r border-zinc-200 dark:border-zinc-700">Removed</div>
        <div className="flex-1 px-2 py-1 text-zinc-500 font-medium">Added</div>
      </div>
      {/* Side-by-side lines */}
      <div className="flex">
        {/* Left: old */}
        <div className="flex-1 min-w-0 border-r border-zinc-200 dark:border-zinc-700">
          {Array.from({ length: maxLines }, (_, i) => {
            const line = oldLines[i];
            const hasLine = i < oldLines.length && oldValue;
            return (
              <div key={`old-${i}`} className={cn("flex min-h-[20px]", hasLine ? "bg-red-50/60 dark:bg-red-900/10" : "")}>
                <span className="w-6 flex-shrink-0 text-right pr-1 text-red-300 dark:text-red-700 select-none border-r border-zinc-200 dark:border-zinc-700 bg-red-50/40 dark:bg-red-900/15">{hasLine ? "−" : ""}</span>
                <span className="px-2 py-px text-red-700 dark:text-red-400 whitespace-pre-wrap break-all">{line ?? ""}</span>
              </div>
            );
          })}
        </div>
        {/* Right: new */}
        <div className="flex-1 min-w-0">
          {Array.from({ length: maxLines }, (_, i) => {
            const line = newLines[i];
            const hasLine = i < newLines.length && newValue;
            return (
              <div key={`new-${i}`} className={cn("flex min-h-[20px]", hasLine ? "bg-emerald-50/60 dark:bg-emerald-900/10" : "")}>
                <span className="w-6 flex-shrink-0 text-right pr-1 text-emerald-300 dark:text-emerald-700 select-none border-r border-zinc-200 dark:border-zinc-700 bg-emerald-50/40 dark:bg-emerald-900/15">{hasLine ? "+" : ""}</span>
                <span className="px-2 py-px text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap break-all">{line ?? ""}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) result.push(...flattenTree(node.children));
  }
  return result;
}
