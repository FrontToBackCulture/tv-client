// src/modules/workspace/WorkspaceDetailView.tsx
// Workspace detail: artifact tree (left) + file preview / sessions (right)

import { useState, useRef, useCallback } from "react";
import {
  ArrowLeft, FileText, Puzzle, Building2, Code2,
  BarChart3, ListChecks, Globe, FileSpreadsheet, ChevronDown,
  ChevronRight, LucideIcon, Lightbulb, HelpCircle, CheckCircle2,
  AlertCircle, X, Folder, FolderOpen, File, Plus, Loader2, Calendar,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import { useWorkspace, useAddArtifact, useRemoveArtifact } from "../../hooks/workspace";
import { useFileTree, useReadFile, useFolderChildren, type TreeNode } from "../../hooks/useFiles";
import { useTask } from "../../hooks/work/useTasks";
import { useRepository } from "../../stores/repositoryStore";
import type { WorkspaceSession, WorkspaceArtifact } from "../../lib/workspace/types";
import { type StatusType, PriorityLabels, PriorityColors, type Priority } from "../../lib/work/types";
import {
  ARTIFACT_TYPE_LABELS,
  WORKSPACE_STATUS_LABELS,
  WORKSPACE_STATUS_COLORS,
} from "../../lib/workspace/types";

interface Props {
  workspaceId: string;
  onBack: () => void;
  onUpdated: () => void;
}

// Artifact type to icon mapping
const ARTIFACT_ICONS: Record<string, LucideIcon> = {
  skill: Puzzle,
  document: FileText,
  doc: FileText,
  crm_deal: Building2,
  crm_company: Building2,
  task: ListChecks,
  domain: Globe,
  code: Code2,
  report: BarChart3,
  proposal: FileSpreadsheet,
  order_form: FileSpreadsheet,
  other: FileText,
};

// Check if a reference looks like a directory (no file extension)
function isDirectoryRef(ref: string): boolean {
  const last = ref.split("/").pop() || "";
  return !last.includes(".");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-SG", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Resolve a reference path to absolute
function resolveRef(ref: string, basePath: string): string {
  if (ref.startsWith("/")) return ref;
  return `${basePath}/${ref}`.replace(/\/+/g, "/");
}

// Get file icon based on extension
function getFileIcon(name: string): LucideIcon {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown"].includes(ext)) return FileText;
  if (["ts", "tsx", "js", "jsx", "rs", "py"].includes(ext)) return Code2;
  if (["json", "yaml", "yml", "toml"].includes(ext)) return FileSpreadsheet;
  if (["sql"].includes(ext)) return BarChart3;
  if (["html", "htm"].includes(ext)) return Globe;
  return File;
}

// Detect file type for preview
type PreviewType = "markdown" | "code" | "html" | "unknown";
function getPreviewType(path: string): PreviewType {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "html";
  if (["ts", "tsx", "js", "jsx", "rs", "py", "sql", "json", "yaml", "yml", "toml", "css", "sh"].includes(ext)) return "code";
  return "unknown";
}

// ============================================================================
// File Tree Node (recursive, for folder artifacts)
// ============================================================================

function FileTreeNode({
  node,
  depth = 0,
  selectedFile,
  onSelectFile,
}: {
  node: TreeNode;
  depth?: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.is_directory) {
    const children = (node.children || []).filter((c) => !c.name.startsWith("."));
    const sorted = children.sort((a, b) => {
      if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {expanded ? <ChevronDown size={11} className="text-zinc-400" /> : <ChevronRight size={11} className="text-zinc-400" />}
          {expanded ? <FolderOpen size={12} className="text-amber-500" /> : <Folder size={12} className="text-amber-500" />}
          <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{node.name}</span>
        </button>
        {expanded && sorted.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile} onSelectFile={onSelectFile} />
        ))}
      </div>
    );
  }

  // File node
  const Icon = getFileIcon(node.name);
  const isSelected = selectedFile === node.path;

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
      )}
      style={{ paddingLeft: `${depth * 14 + 18}px` }}
    >
      <Icon size={11} className={isSelected ? "text-teal-500" : "text-zinc-400"} />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  );
}

// ============================================================================
// Artifact Tree Item (top-level artifact with optional folder expansion)
// ============================================================================

function ArtifactTreeItem({
  artifact,
  workspaceId,
  basePath,
  selectedFile,
  onSelectFile,
}: {
  artifact: WorkspaceArtifact;
  workspaceId: string;
  basePath: string;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const removeMutation = useRemoveArtifact();

  const Icon = ARTIFACT_ICONS[artifact.type] || FileText;
  const isFolder = isDirectoryRef(artifact.reference);
  const absPath = resolveRef(artifact.reference, basePath);

  // Load file tree for folder artifacts when expanded
  const { data: tree } = useFileTree(
    expanded && isFolder ? absPath : undefined,
    3
  );

  const handleClick = () => {
    if (isFolder) {
      setExpanded(!expanded);
    } else {
      onSelectFile(absPath);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeMutation.mutate({ id: artifact.id, workspaceId });
  };

  const isSelected = !isFolder && selectedFile === absPath;

  return (
    <div className="group/artifact">
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
          isSelected
            ? "bg-teal-50 dark:bg-teal-950/30"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
        )}
      >
        {isFolder ? (
          expanded ? <ChevronDown size={11} className="text-zinc-400" /> : <ChevronRight size={11} className="text-zinc-400" />
        ) : (
          <span className="w-[11px]" />
        )}
        <Icon size={13} className={isSelected ? "text-teal-500" : "text-zinc-400"} />
        <span
          className={cn(
            "text-xs font-medium truncate flex-1",
            isSelected ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"
          )}
          title={artifact.reference}
        >
          {artifact.label}
        </span>
        <button
          onClick={handleRemove}
          className="p-0.5 rounded text-zinc-400 hover:text-red-500 opacity-0 group-hover/artifact:opacity-100 transition-opacity flex-shrink-0"
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>

      {/* Expanded file tree */}
      {expanded && isFolder && tree && (
        <div className="ml-3 border-l border-zinc-200 dark:border-zinc-800">
          {(tree.children || [])
            .filter((c) => !c.name.startsWith("."))
            .sort((a, b) => {
              if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileTreeNode key={child.path} node={child} depth={0} selectedFile={selectedFile} onSelectFile={onSelectFile} />
            ))}
          {(!tree.children || tree.children.filter((c) => !c.name.startsWith(".")).length === 0) && (
            <p className="text-xs text-zinc-400 px-3 py-1">Empty</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Task Artifact Item (live status from Work module)
// ============================================================================

const STATUS_TYPE_COLORS: Record<StatusType, string> = {
  backlog: "#6B7280",
  unstarted: "#6B7280",
  started: "#3B82F6",
  review: "#F59E0B",
  completed: "#10B981",
  canceled: "#EF4444",
};

const STATUS_TYPE_LABELS: Record<StatusType, string> = {
  backlog: "Backlog",
  unstarted: "Todo",
  started: "In Progress",
  review: "In Review",
  completed: "Done",
  canceled: "Canceled",
};

function TaskArtifactItem({
  artifact,
  workspaceId,
  isSelected,
  onSelect,
}: {
  artifact: WorkspaceArtifact;
  workspaceId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { data: task } = useTask(artifact.reference);
  const removeMutation = useRemoveArtifact();
  const statusType = (task?.status?.type as StatusType) ?? null;
  const statusColor = statusType ? STATUS_TYPE_COLORS[statusType] : "#6B7280";
  const statusLabel = statusType ? STATUS_TYPE_LABELS[statusType] : null;
  const taskIdentifier = task?.project
    ? `${task.project.identifier_prefix}-${task.task_number}`
    : null;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeMutation.mutate({ id: artifact.id, workspaceId });
  };

  return (
    <div className="group/artifact">
      <div
        onClick={onSelect}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
          isSelected
            ? "bg-teal-50 dark:bg-teal-950/30"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
        )}
      >
        <span className="w-[11px]" />
        <ListChecks size={13} className={isSelected ? "text-teal-500" : "text-zinc-400"} />
        <span
          className={cn(
            "text-xs font-medium truncate flex-1",
            isSelected ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"
          )}
          title={`Task ID: ${artifact.reference}`}
        >
          {taskIdentifier && <span className="text-zinc-400 mr-1">{taskIdentifier}</span>}
          {artifact.label}
        </span>
        {statusLabel && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
          >
            {statusLabel}
          </span>
        )}
        <button
          onClick={handleRemove}
          className="p-0.5 rounded text-zinc-400 hover:text-red-500 opacity-0 group-hover/artifact:opacity-100 transition-opacity flex-shrink-0"
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// File Preview Panel
// ============================================================================

function FilePreview({ path }: { path: string }) {
  const { data: content, isLoading, isError } = useReadFile(path);
  const filename = path.split("/").pop() || "";
  const previewType = getPreviewType(path);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <FileText size={24} className="animate-pulse" />
      </div>
    );
  }

  if (isError || !content) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto mb-2 text-red-400" />
          <p className="text-xs text-red-400">Failed to load file</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs truncate">{path}</p>
        </div>
      </div>
    );
  }

  if (previewType === "html") {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{filename}</span>
        </div>
        <iframe
          srcDoc={content}
          title={filename}
          className="flex-1 w-full border-0 bg-white"
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{filename}</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600 truncate" title={path}>{path}</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600 ml-auto flex-shrink-0">
          {content.split("\n").length} lines
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// Session Entry
// ============================================================================

function SessionItem({
  session,
  isSelected,
  onSelect,
}: {
  session: WorkspaceSession;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/30"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Calendar size={11} className={isSelected ? "text-teal-500" : "text-zinc-400"} />
        <span className={cn(
          "text-xs font-medium",
          isSelected ? "text-teal-700 dark:text-teal-300" : "text-zinc-500 dark:text-zinc-400"
        )}>
          {formatDate(session.date)}
        </span>
        {session.conversation_id && (
          <span className="text-[10px] text-zinc-400 font-mono ml-auto" title={`claude --resume ${session.conversation_id}`}>
            {session.conversation_id.slice(0, 8)}
          </span>
        )}
      </div>
      {session.summary && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed pl-[17.5px]">
          {session.summary}
        </p>
      )}
    </button>
  );
}

// Full session detail shown in right panel
function SessionDetail({ session, artifacts }: { session: WorkspaceSession; artifacts: WorkspaceArtifact[] }) {
  const sessionArtifacts = artifacts.filter((a) => a.session_id === session.id);
  const decisions = (session.decisions as Array<{ decision: string; rationale: string }>) ?? [];
  const nextSteps = session.next_steps ?? [];
  const openQuestions = session.open_questions ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={14} className="text-teal-500" />
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{formatDate(session.date)}</span>
          {session.conversation_id && (
            <span className="text-xs text-zinc-400 font-mono ml-auto" title={`claude --resume ${session.conversation_id}`}>
              {session.conversation_id.slice(0, 8)}...
            </span>
          )}
        </div>
        {session.summary && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{session.summary}</p>
        )}
      </div>

      <div className="p-6 space-y-5">
        {session.notes && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={12} /> Notes
            </h4>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-table:text-sm prose-th:bg-zinc-100 dark:prose-th:bg-zinc-800 prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 prose-td:border-zinc-200 dark:prose-td:border-zinc-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.notes}</ReactMarkdown>
            </div>
          </div>
        )}

        {decisions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Lightbulb size={12} /> Decisions
            </h4>
            <div className="space-y-1.5">
              {decisions.map((d, i) => (
                <div key={i} className="text-sm bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                  <span className="text-zinc-800 dark:text-zinc-200 font-medium">{d.decision}</span>
                  {d.rationale && <p className="text-zinc-500 mt-1 text-xs">{d.rationale}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {nextSteps.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Next Steps
            </h4>
            <ul className="space-y-1">
              {nextSteps.map((s, i) => (
                <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                  <span className="text-zinc-400 mt-0.5">-</span> {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {openQuestions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <HelpCircle size={12} /> Open Questions
            </h4>
            <ul className="space-y-1">
              {openQuestions.map((q, i) => (
                <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                  <span className="text-zinc-400 mt-0.5">?</span> {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sessionArtifacts.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Artifacts Created</h4>
            <div className="flex flex-wrap gap-1.5">
              {sessionArtifacts.map((a) => {
                const AIcon = ARTIFACT_ICONS[a.type] || FileText;
                return (
                  <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md px-2 py-1">
                    <AIcon size={12} /> {a.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Task Detail (right panel)
// ============================================================================

function TaskDetail({ taskId }: { taskId: string }) {
  const { data: task, isLoading } = useTask(taskId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto mb-2 text-red-400" />
          <p className="text-xs text-red-400">Task not found</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{taskId}</p>
        </div>
      </div>
    );
  }

  const statusType = (task.status?.type as StatusType) ?? "unstarted";
  const statusColor = STATUS_TYPE_COLORS[statusType] || "#6B7280";
  const statusLabel = STATUS_TYPE_LABELS[statusType] || statusType;
  const priorityLabel = PriorityLabels[task.priority as Priority] ?? "None";
  const priorityColor = PriorityColors[task.priority as Priority] ?? "#6B7280";
  const identifier = task.project
    ? `${task.project.identifier_prefix}-${task.task_number}`
    : `#${task.task_number}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-1">
          <ListChecks size={14} className="text-teal-500" />
          <span className="text-xs font-mono text-zinc-400">{identifier}</span>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
          >
            {statusLabel}
          </span>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${priorityColor}18`, color: priorityColor }}
          >
            {priorityLabel}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{task.title}</h3>
      </div>

      <div className="p-6 space-y-5">
        {task.description && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Description</h4>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {task.project && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Project</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.project.color || "#6B7280" }} />
                {task.project.name}
              </span>
            </div>
          )}
          {task.assignee && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Assignee</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{task.assignee.name}</span>
            </div>
          )}
          {task.milestone && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Milestone</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{task.milestone.name}</span>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Created</h4>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatDateTime(task.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// File Picker Modal (for adding artifacts)
// ============================================================================

function PickerNode({
  node,
  level,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  onSelect: (path: string, isDir: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const indent = 12 + level * 16;

  const needsLazy = node.is_directory && node.children === null;
  const { data: lazyChildren, isLoading: lazyLoading } = useFolderChildren(
    node.path,
    expanded && needsLazy
  );

  if (node.is_directory) {
    const children = node.children ?? lazyChildren ?? [];
    return (
      <div>
        <div
          className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          style={{ paddingLeft: `${indent}px` }}
        >
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 flex-1 text-left min-w-0">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? <FolderOpen size={14} className="text-amber-500 flex-shrink-0" /> : <Folder size={14} className="text-amber-500 flex-shrink-0" />}
            <span className="truncate">{node.name}</span>
          </button>
          <button
            onClick={() => onSelect(node.path, true)}
            className="p-0.5 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/30 flex-shrink-0 mr-2"
            title="Add folder"
          >
            <Plus size={12} />
          </button>
        </div>
        {expanded && (
          <div>
            {lazyLoading ? (
              <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${indent + 28}px` }}>
                <Loader2 size={12} className="text-zinc-400 animate-spin" />
              </div>
            ) : children.length > 0 ? (
              children
                .filter((c) => !c.name.startsWith("."))
                .sort((a, b) => {
                  if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((child) => (
                  <PickerNode key={child.path} node={child} level={level + 1} onSelect={onSelect} />
                ))
            ) : (
              <div className="text-xs text-zinc-400 py-1" style={{ paddingLeft: `${indent + 28}px` }}>Empty</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // File node
  const Icon = getFileIcon(node.name);
  return (
    <button
      onClick={() => onSelect(node.path, false)}
      className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
      style={{ paddingLeft: `${indent + 16}px` }}
    >
      <Icon size={14} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function ArtifactPickerModal({
  basePath,
  workspaceId,
  onClose,
}: {
  basePath: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const { data: tree, isLoading: treeLoading } = useFileTree(basePath, 3);
  const addMutation = useAddArtifact();

  const handleSelect = (absPath: string, isDir: boolean) => {
    // Make reference relative to basePath
    const reference = absPath.startsWith(basePath)
      ? absPath.slice(basePath.length).replace(/^\//, "")
      : absPath;

    // Derive label from last path segment
    const label = absPath.split("/").filter(Boolean).pop() || reference;

    // Infer type
    let type = "other";
    if (isDir) {
      if (reference.includes("_skills") || reference.includes("skills/")) type = "skill";
      else if (reference.includes("src/") || reference.includes("src-tauri/")) type = "code";
      else type = "doc";
    } else {
      const ext = absPath.split(".").pop()?.toLowerCase() || "";
      if (["ts", "tsx", "js", "jsx", "rs", "py", "sql"].includes(ext)) type = "code";
      else if (["html", "htm"].includes(ext)) type = "report";
      else type = "doc";
    }

    addMutation.mutate(
      { workspace_id: workspaceId, label, reference, type },
      { onSuccess: onClose }
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add Artifact</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {treeLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="text-zinc-400 animate-spin" />
              </div>
            ) : tree?.children ? (
              tree.children
                .filter((c) => !c.name.startsWith("."))
                .sort((a, b) => {
                  if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((node) => (
                  <PickerNode key={node.path} node={node} level={0} onSelect={handleSelect} />
                ))
            ) : (
              <p className="text-sm text-zinc-400 text-center py-8">No files found</p>
            )}
          </div>
          {addMutation.isPending && (
            <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 size={12} className="animate-spin" /> Adding...
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Main Detail View
// ============================================================================

export function WorkspaceDetailView({ workspaceId, onBack, onUpdated: _onUpdated }: Props) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId);
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";
  const [selection, setSelection] = useState<{ type: "file"; path: string } | { type: "session"; id: string } | { type: "task"; id: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newW = Math.min(600, Math.max(200, startW + ev.clientX - startX));
      setSidebarWidth(newW);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-zinc-400">Loading...</div>;
  }

  if (!workspace) {
    return <div className="h-full flex items-center justify-center text-zinc-400">Workspace not found</div>;
  }

  const statusColor = WORKSPACE_STATUS_COLORS[workspace.status] || "#6B7280";
  const sessions = workspace.sessions ?? [];
  const artifacts = workspace.artifacts ?? [];
  const context = workspace.context;

  const selectedFile = selection?.type === "file" ? selection.path : null;
  const selectedSession = selection?.type === "session"
    ? sessions.find((s) => s.id === selection.id) ?? null
    : null;

  // Group artifacts by type
  const artifactsByType = artifacts.reduce<Record<string, WorkspaceArtifact[]>>((acc, a) => {
    if (!acc[a.type]) acc[a.type] = [];
    acc[a.type].push(a);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {workspace.title}
              </h1>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                {WORKSPACE_STATUS_LABELS[workspace.status] || workspace.status}
              </span>
            </div>
            {workspace.description && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{workspace.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400 flex-shrink-0">
            <span>{workspace.owner}</span>
            <span>{formatDateTime(workspace.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Body: artifacts left, preview/sessions right */}
      <div className="flex-1 overflow-hidden flex">
        {/* LEFT: Artifacts tree */}
        <div className="flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800/50 overflow-y-auto relative" style={{ width: sidebarWidth }}>
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Artifacts ({artifacts.length})
              </h3>
              <button
                onClick={() => setShowPicker(true)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-teal-500 transition-colors"
                title="Add artifact"
              >
                <Plus size={13} />
              </button>
            </div>

            {artifacts.length === 0 ? (
              <p className="text-xs text-zinc-400">No artifacts linked yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(artifactsByType).map(([type, typeArtifacts]) => (
                  <div key={type}>
                    <h4 className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 flex items-center gap-1">
                      {(() => { const TIcon = ARTIFACT_ICONS[type] || FileText; return <TIcon size={11} />; })()}
                      {ARTIFACT_TYPE_LABELS[type] || type}
                      <span className="text-zinc-300 dark:text-zinc-600">({typeArtifacts.length})</span>
                    </h4>
                    <div className="space-y-0.5">
                      {typeArtifacts.map((artifact) =>
                        artifact.type === "task" ? (
                          <TaskArtifactItem
                            key={artifact.id}
                            artifact={artifact}
                            workspaceId={workspaceId}
                            isSelected={selection?.type === "task" && selection.id === artifact.reference}
                            onSelect={() => setSelection({ type: "task", id: artifact.reference })}
                          />
                        ) : (
                          <ArtifactTreeItem
                            key={artifact.id}
                            artifact={artifact}
                            workspaceId={workspaceId}
                            basePath={basePath}
                            selectedFile={selectedFile}
                            onSelectFile={(path) => setSelection({ type: "file", path })}
                          />
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sessions below artifacts */}
            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
              <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                Sessions ({sessions.length})
              </h3>
              {sessions.length === 0 ? (
                <p className="text-xs text-zinc-400">No sessions yet</p>
              ) : (
                <div>
                  {sessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isSelected={selection?.type === "session" && selection.id === session.id}
                      onSelect={() => setSelection({ type: "session", id: session.id })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
        />

        {/* RIGHT: File preview, session detail, task detail, or context */}
        <div className="flex-1 overflow-hidden">
          {selectedFile ? (
            <FilePreview path={selectedFile} />
          ) : selectedSession ? (
            <SessionDetail session={selectedSession} artifacts={artifacts} />
          ) : selection?.type === "task" ? (
            <TaskDetail taskId={selection.id} />
          ) : (
            <div className="h-full overflow-y-auto p-6">
              {/* Context */}
              {context?.current_state && (
                <div className="mb-6 p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50 rounded-lg">
                  <h3 className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Current State
                  </h3>
                  <p className="text-sm text-teal-800 dark:text-teal-300">{context.current_state}</p>
                </div>
              )}

              {context?.context_summary && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Context</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{context.context_summary}</p>
                </div>
              )}

              {!context?.current_state && !context?.context_summary && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <FileText size={32} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-sm text-zinc-400">Select a file to preview</p>
                    <p className="text-xs text-zinc-400 mt-1">or expand a folder in the artifact tree</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File picker modal */}
      {showPicker && (
        <ArtifactPickerModal
          basePath={basePath}
          workspaceId={workspaceId}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
