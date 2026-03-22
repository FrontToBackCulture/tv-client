// src/modules/workspace/WorkspaceDetailView.tsx
// Workspace detail: artifact tree (left) + file preview / sessions (right)

import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowLeft, FileText, Puzzle, Building2, Code2,
  BarChart3, ListChecks, Globe, FileSpreadsheet, ChevronDown,
  ChevronRight, LucideIcon, Lightbulb, HelpCircle, CheckCircle2,
  AlertCircle, X, Folder, FolderOpen, File, Plus, Loader2, Calendar,
  Circle, XCircle, PenTool, Trash2, Milestone as MilestoneIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { ExcalidrawEditor } from "../gallery/ExcalidrawEditor";
import { ImageEditor } from "../gallery/ImageEditor";
import type { GalleryItem } from "../gallery/useGallery";
import {
  PDFViewer, ImageViewer, CSVViewer, JSONViewer, SQLViewer,
  HTMLViewer, ExcalidrawViewer,
} from "../library/viewers";
import { useWorkspace, useUpdateWorkspace, useAddArtifact, useRemoveArtifact } from "../../hooks/workspace";
import { useFileTree, useReadFile, useFolderChildren, type TreeNode } from "../../hooks/useFiles";
import { useTask, useAllTasks, useUpdateTask } from "../../hooks/work/useTasks";
import { useMilestones, useCreateMilestone, useDeleteMilestone } from "../../hooks/work/useMilestones";
import { useStatuses } from "../../hooks/work/useStatuses";
import { useUsers } from "../../hooks/work/useUsers";
import { useProjects } from "../../hooks/work/useProjects";
import { TaskDetailPanel } from "../work/TaskDetailPanel";
import { getFieldDefsForType, useProjectFieldsStore } from "../../stores/projectFieldsStore";
import { useDeal } from "../../hooks/crm/useDeals";
import { useCompany, useCompanies } from "../../hooks/crm/useCompanies";
import { useContacts } from "../../hooks/crm/useContacts";
import { useActivities } from "../../hooks/crm/useActivities";
import { ACTIVITY_TYPES } from "../../lib/crm/types";
import { DEAL_STAGES, DEAL_SOLUTIONS, COMPANY_STAGES } from "../../lib/crm/types";
import { useRepository } from "../../stores/repositoryStore";
import { toast } from "../../stores/toastStore";
import type { WorkspaceSession, WorkspaceArtifact } from "../../lib/workspace/types";
import { MilestoneTaskGroups } from "./MilestoneTaskGroups";

/** Unescape literal \n sequences that arrive from MCP JSON serialization */
const unescapeNewlines = (s: string) => s.replace(/\\n/g, "\n");
import { type StatusType, PriorityLabels, PriorityColors, Priority, getTaskIdentifier } from "../../lib/work/types";
import {
  ARTIFACT_TYPE_LABELS,
  WORKSPACE_STATUS_LABELS,
  WORKSPACE_STATUS_COLORS,
} from "../../lib/workspace/types";

interface Props {
  workspaceId: string;
  onBack: () => void;
  onUpdated: () => void;
  onCreateTask?: () => void;
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
// If the reference starts with a known repository name (e.g. "tv-client/..."),
// resolve it relative to that repository's parent directory instead of basePath.
function resolveRef(ref: string, basePath: string, allRepoPaths?: string[]): string {
  if (ref.startsWith("/")) return ref;
  // Check if ref starts with a known repository folder name
  if (allRepoPaths?.length) {
    const firstSegment = ref.split("/")[0];
    for (const repoPath of allRepoPaths) {
      const repoName = repoPath.split("/").filter(Boolean).pop() || "";
      if (repoName && repoName === firstSegment) {
        // Resolve from this repo's parent: e.g. "tv-client/src/foo" → "/path/to/SkyNet/tv-client/src/foo"
        const parentDir = repoPath.substring(0, repoPath.lastIndexOf("/"));
        return `${parentDir}/${ref}`.replace(/\/+/g, "/");
      }
    }
  }
  return `${basePath}/${ref}`.replace(/\/+/g, "/");
}

// Get file icon based on extension
function getFileIcon(name: string): LucideIcon {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown"].includes(ext)) return FileText;
  if (["ts", "tsx", "js", "jsx", "rs", "py", "sh", "css"].includes(ext)) return Code2;
  if (["json", "yaml", "yml", "toml", "csv", "tsv"].includes(ext)) return FileSpreadsheet;
  if (["sql"].includes(ext)) return BarChart3;
  if (["html", "htm"].includes(ext)) return Globe;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"].includes(ext)) return File;
  if (["pdf"].includes(ext)) return FileText;
  return File;
}

// Detect file type for preview
type PreviewType = "markdown" | "code" | "html" | "pdf" | "image" | "csv" | "json" | "sql" | "excalidraw" | "unknown";
function getPreviewType(path: string): PreviewType {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "html";
  if (["pdf"].includes(ext)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"].includes(ext)) return "image";
  if (["csv", "tsv"].includes(ext)) return "csv";
  if (["json"].includes(ext)) return "json";
  if (["sql"].includes(ext)) return "sql";
  if (["excalidraw"].includes(ext)) return "excalidraw";
  if (["ts", "tsx", "js", "jsx", "rs", "py", "yaml", "yml", "toml", "css", "sh", "env", "txt", "log"].includes(ext)) return "code";
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
  allRepoPaths,
  selectedFile,
  onSelectFile,
  pathPrefix,
}: {
  artifact: WorkspaceArtifact;
  workspaceId: string;
  basePath: string;
  allRepoPaths?: string[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  pathPrefix?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const removeMutation = useRemoveArtifact();

  const Icon = ARTIFACT_ICONS[artifact.type] || FileText;
  const isFolder = isDirectoryRef(artifact.reference);
  const absPath = resolveRef(artifact.reference, basePath, allRepoPaths);

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
          {pathPrefix ? <><span className="text-zinc-400 dark:text-zinc-500">{pathPrefix}/</span>{artifact.label}</> : artifact.label}
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
        {/* Status icon: filled circle for done/canceled, half for started/review, empty for todo/backlog */}
        <span className="flex-shrink-0" title={statusLabel ?? undefined}>
          {statusType === "completed" ? (
            <CheckCircle2 size={13} style={{ color: statusColor }} />
          ) : statusType === "canceled" ? (
            <XCircle size={13} style={{ color: statusColor }} />
          ) : statusType === "started" || statusType === "review" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" className="flex-shrink-0">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke={statusColor} strokeWidth="1.5" />
              <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" fill={statusColor} />
            </svg>
          ) : (
            <Circle size={13} style={{ color: statusColor }} />
          )}
        </span>
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
// CRM Deal Artifact Item (live data from CRM)
// ============================================================================

function CrmDealArtifactItem({
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
  const { data: deal } = useDeal(artifact.reference);
  const removeMutation = useRemoveArtifact();
  const stage = DEAL_STAGES.find((s) => s.value === deal?.stage);

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
        <Building2 size={13} className={isSelected ? "text-teal-500" : "text-zinc-400"} />
        <span
          className={cn(
            "text-xs font-medium truncate flex-1",
            isSelected ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"
          )}
          title={`Deal ID: ${artifact.reference}`}
        >
          {artifact.label}
        </span>
        {stage && (
          <span className="text-[10px] text-zinc-400 flex-shrink-0">{stage.label}</span>
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
// CRM Company Artifact Item (live data from CRM)
// ============================================================================

function CrmCompanyArtifactItem({
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
  const { data: company } = useCompany(artifact.reference);
  const removeMutation = useRemoveArtifact();
  const stage = COMPANY_STAGES.find((s) => s.value === company?.stage);

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
        <Building2 size={13} className={isSelected ? "text-teal-500" : "text-zinc-400"} />
        <span
          className={cn(
            "text-xs font-medium truncate flex-1",
            isSelected ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"
          )}
          title={`Company ID: ${artifact.reference}`}
        >
          {artifact.label}
        </span>
        {stage && (
          <span className="text-[10px] text-zinc-400 flex-shrink-0">{stage.label}</span>
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
// CRM Deal Detail (right panel)
// ============================================================================

function DealDetail({ dealId }: { dealId: string }) {
  const { data: deal, isLoading } = useDeal(dealId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto mb-2 text-red-400" />
          <p className="text-xs text-red-400">Deal not found</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{dealId}</p>
        </div>
      </div>
    );
  }

  const stage = DEAL_STAGES.find((s) => s.value === deal.stage);
  const stageColor = stage?.color || "zinc";
  const colorMap: Record<string, string> = {
    zinc: "#71717A", gray: "#6B7280", blue: "#3B82F6", purple: "#8B5CF6",
    cyan: "#06B6D4", yellow: "#EAB308", green: "#10B981", red: "#EF4444",
  };
  const color = colorMap[stageColor] || "#6B7280";

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={14} className="text-teal-500" />
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}18`, color }}
          >
            {stage?.label || deal.stage}
          </span>
          {deal.value != null && (
            <span className="text-xs text-zinc-400 ml-auto">
              ${Number(deal.value).toLocaleString()}
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{deal.name}</h3>
      </div>

      <div className="p-6 space-y-5">
        {deal.notes && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Notes</h4>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{deal.notes}</ReactMarkdown>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {deal.solution && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Solution</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">{deal.solution.replace(/_/g, " ")}</span>
            </div>
          )}
          {deal.expected_close_date && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Expected Close</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatDate(deal.expected_close_date)}</span>
            </div>
          )}
          {deal.currency && deal.value != null && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Value</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {deal.currency} ${Number(deal.value).toLocaleString()}
              </span>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Created</h4>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatDateTime(deal.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CRM Company Detail (right panel)
// ============================================================================

function CompanyDetail({ companyId }: { companyId: string }) {
  const { data: company, isLoading } = useCompany(companyId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto mb-2 text-red-400" />
          <p className="text-xs text-red-400">Company not found</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{companyId}</p>
        </div>
      </div>
    );
  }

  const stage = COMPANY_STAGES.find((s) => s.value === company.stage);
  const colorMap: Record<string, string> = {
    gray: "#6B7280", blue: "#3B82F6", green: "#10B981", red: "#EF4444", purple: "#8B5CF6",
  };
  const color = colorMap[stage?.color || "gray"] || "#6B7280";

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={14} className="text-teal-500" />
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}18`, color }}
          >
            {stage?.label || company.stage}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{company.name}</h3>
      </div>

      <div className="p-6 space-y-5">
        {company.notes && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Notes</h4>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{company.notes}</ReactMarkdown>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {company.industry && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Industry</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{company.industry}</span>
            </div>
          )}
          {company.website && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Website</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{company.website}</span>
            </div>
          )}
          {company.source && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Source</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">{company.source}</span>
            </div>
          )}
          {company.domain_id && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Domain</h4>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{company.domain_id}</span>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Created</h4>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatDateTime(company.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// File Preview Panel
// ============================================================================

function FilePreview({ path }: { path: string }) {
  const filename = path.split("/").pop() || "";
  const previewType = getPreviewType(path);
  const basePath = path.substring(0, path.lastIndexOf("/"));
  const [editing, setEditing] = useState(false);

  // PDF and Image viewers use Tauri's convertFileSrc — they don't need file content
  const skipContent = previewType === "pdf" || previewType === "image";
  const { data: content, isLoading, isError, refetch } = useReadFile(skipContent ? "" : path);

  const canEdit = previewType === "excalidraw" || previewType === "image";

  // Build a GalleryItem adapter for the editors
  const galleryItem = canEdit ? {
    file_name: filename,
    file_path: path,
    relative_path: path,
    folder: basePath,
    extension: filename.split(".").pop() || "",
    size_bytes: 0,
    modified: "",
    gallery_type: (previewType === "excalidraw" ? "excalidraw" : "image") as "excalidraw" | "image" | "video",
  } satisfies GalleryItem : null;

  // Edit mode — render full editor
  const handleEditorBack = useCallback(() => {
    setEditing(false);
    // Invalidate cached file content so preview shows saved changes
    refetch();
  }, [refetch]);

  if (editing && galleryItem) {
    if (previewType === "excalidraw") {
      return <ExcalidrawEditor item={galleryItem} onBack={handleEditorBack} />;
    }
    if (previewType === "image") {
      return <ImageEditor item={galleryItem} onBack={handleEditorBack} />;
    }
  }

  if (!skipContent && isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <FileText size={24} className="animate-pulse" />
      </div>
    );
  }

  if (!skipContent && (isError || !content)) {
    // Check if this looks like an unresolved cross-repo reference
    const segments = path.split("/");
    const knowledgeIdx = segments.indexOf("tv-knowledge");
    const afterKnowledge = knowledgeIdx >= 0 ? segments[knowledgeIdx + 1] : null;
    const isCrossRepo = afterKnowledge && /^(tv-|val)/.test(afterKnowledge);

    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle size={24} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
          {isCrossRepo ? (
            <>
              <p className="text-xs text-zinc-500 font-medium">Cannot preview — file is in a different repository</p>
              <p className="text-xs text-zinc-400 mt-1">
                This artifact references <span className="font-mono text-zinc-500">{afterKnowledge}/</span> which is not in the current knowledge base.
              </p>
              <p className="text-xs text-zinc-400 mt-2">Add the repository in Settings to enable preview.</p>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-500">File not found</p>
              <p className="text-xs text-zinc-400 mt-1 truncate" title={path}>{path}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Path bar with optional Edit button
  const pathBar = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex-shrink-0">
      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate select-all flex-1" title={path}>{path}</span>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors flex-shrink-0"
        >
          <PenTool size={11} />
          Edit
        </button>
      )}
    </div>
  );

  // Viewers that manage their own full layout (h-full flex containers)
  switch (previewType) {
    case "pdf":
      return (
        <div className="h-full flex flex-col">
          {pathBar}
          <div className="flex-1 min-h-0">
            <PDFViewer path={path} filename={filename} />
          </div>
        </div>
      );
    case "image":
      return (
        <div className="h-full flex flex-col">
          {pathBar}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ImageViewer path={path} filename={filename} />
          </div>
        </div>
      );
    case "html":
      return (
        <div className="h-full flex flex-col">
          {pathBar}
          <div className="flex-1 min-h-0">
            <HTMLViewer content={content!} filename={filename} />
          </div>
        </div>
      );
    case "csv":
      return (
        <div className="h-full flex flex-col">
          {pathBar}
          <div className="flex-1 min-h-0">
            <CSVViewer content={content!} filename={filename} />
          </div>
        </div>
      );
    default:
      break;
  }

  // Viewers that need a scroll + padding wrapper
  return (
    <div className="h-full flex flex-col">
      {pathBar}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {previewType === "markdown" ? (
          <MarkdownViewer content={content!} filename={filename} basePath={basePath} />
        ) : previewType === "json" ? (
          <JSONViewer content={content!} filename={filename} />
        ) : previewType === "sql" ? (
          <SQLViewer content={content!} filename={filename} />
        ) : previewType === "excalidraw" ? (
          <ExcalidrawViewer content={content!} filename={filename} />
        ) : (
          /* Code and unknown — plain text with line count */
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{filename}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-600 ml-auto flex-shrink-0">
                {content!.split("\n").length} lines
              </span>
            </div>
            <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {content}
            </pre>
          </div>
        )}
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
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={onSelect}
      className={cn(
        "block w-full text-left px-2.5 py-2 rounded-lg border transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/50"
          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700/50"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Calendar size={11} className={cn("flex-shrink-0", isSelected ? "text-teal-500" : "text-zinc-400")} />
        <span className={cn(
          "text-xs font-medium",
          isSelected ? "text-teal-700 dark:text-teal-300" : "text-zinc-600 dark:text-zinc-400"
        )}>
          {formatDate(session.date)}
        </span>
        {session.conversation_id && (
          <span
            className={cn(
              "text-[10px] font-mono ml-auto flex-shrink-0 cursor-pointer transition-colors",
              copied ? "text-teal-500" : "text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400"
            )}
            title={`Click to copy: claude --resume ${session.conversation_id}`}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(`claude --resume ${session.conversation_id}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied!" : session.conversation_id.slice(0, 7)}
          </span>
        )}
      </div>
      {session.summary && (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2 leading-snug pl-[17.5px]">
          {session.summary}
        </p>
      )}
    </button>
  );
}

// Full session detail shown in right panel
function SessionDetail({ session, artifacts }: { session: WorkspaceSession; artifacts: WorkspaceArtifact[] }) {
  const [copiedId, setCopiedId] = useState(false);
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
            <span
              className={cn(
                "text-xs font-mono ml-auto cursor-pointer transition-colors",
                copiedId ? "text-teal-500" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              )}
              title={`Click to copy: claude --resume ${session.conversation_id}`}
              onClick={() => {
                navigator.clipboard.writeText(`claude --resume ${session.conversation_id}`);
                setCopiedId(true);
                setTimeout(() => setCopiedId(false), 2000);
              }}
            >
              {copiedId ? "Copied!" : session.conversation_id}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{unescapeNewlines(session.notes)}</ReactMarkdown>
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
      { project_id: workspaceId, label, reference, type },
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

// Contact detail shown in right panel
function ContactDetailPanel({ contact }: { contact: any | null }) {
  if (!contact) return <div className="h-full flex items-center justify-center text-zinc-400 text-sm">Contact not found</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{contact.name}</h2>
        {contact.role && <p className="text-sm text-zinc-500 mt-0.5">{contact.role}</p>}
        {contact.department && <p className="text-xs text-zinc-400">{contact.department}</p>}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Email</h3>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{contact.email}</p>
        </div>

        {contact.phone && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Phone</h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{contact.phone}</p>
          </div>
        )}

        {contact.linkedin_url && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">LinkedIn</h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 break-all">{contact.linkedin_url}</p>
          </div>
        )}

        {contact.notes && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Notes</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          {contact.is_primary && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-medium">Primary Contact</span>
          )}
          {contact.is_active === false && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">Inactive</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Activity detail shown in right panel
function ActivityDetailPanel({ activity }: { activity: any | null }) {
  if (!activity) return <div className="h-full flex items-center justify-center text-zinc-400 text-sm">Activity not found</div>;

  const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.type);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
            {typeInfo?.label || activity.type}
          </span>
          <span className="text-xs text-zinc-400">{formatDateTime(activity.activity_date)}</span>
        </div>
        {activity.subject && (
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mt-2">{activity.subject}</h2>
        )}
      </div>

      {activity.content && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Content</h3>
          <div className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">{activity.content}</div>
        </div>
      )}

      {activity.type === "stage_change" && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Stage Change</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">{activity.old_value}</span>
            <span className="text-zinc-400">→</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{activity.new_value}</span>
          </div>
        </div>
      )}

      {activity.created_by && (
        <div className="text-xs text-zinc-400 mt-4">By: {activity.created_by}</div>
      )}
    </div>
  );
}

// Inline editable field
function EditableField({ value, onSave, type = "text", options, displayValue }: {
  value: string | number | null | undefined;
  onSave: (val: string) => void;
  type?: "text" | "number" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[];
  displayValue?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (type === "select") {
        // Auto-save on select change
      }
    }
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft !== String(value ?? "")) onSave(draft);
  };

  if (!editing) {
    const display = displayValue || (value != null && value !== "" ? String(value) : null);
    return (
      <button
        onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
        className="text-left w-full min-h-[20px] cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded px-1.5 py-0.5 -mx-1 transition-colors border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
      >
        {display ? (
          <span className="text-zinc-700 dark:text-zinc-300">{display}</span>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </button>
    );
  }

  if (type === "select" && options) {
    return (
      <select
        ref={inputRef as any}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none w-full"
      >
        <option value="">—</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  if (type === "textarea") {
    return (
      <textarea
        ref={inputRef as any}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); } }}
        rows={3}
        className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none w-full resize-none"
      />
    );
  }

  return (
    <input
      ref={inputRef as any}
      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none w-full"
    />
  );
}

export function WorkspaceDetailView({ workspaceId, onBack, onUpdated: _onUpdated, onCreateTask }: Props) {
  const { data: workspace, isLoading, refetch: refetchWorkspace } = useWorkspace(workspaceId);
  const updateWorkspace = useUpdateWorkspace();
  const { activeRepository, repositories } = useRepository();
  const basePath = activeRepository?.path ?? "";
  const [selection, setSelection] = useState<{ type: "file"; path: string } | { type: "session"; id: string } | { type: "task"; id: string } | { type: "crm_deal"; id: string } | { type: "crm_company"; id: string } | { type: "activity"; id: string } | { type: "contact"; id: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [taskContextMenu, setTaskContextMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [taskProjectSearch, setTaskProjectSearch] = useState("");
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ context: true, details: true, activities: true });
  const [contextMenuTab, setContextMenuTab] = useState<"milestone" | "project">("milestone");
  const [newMilestoneName, setNewMilestoneName] = useState("");

  // Direct project update via Supabase
  const updateProjectField = useCallback(async (field: string, value: any) => {
    const { supabase } = await import("../../lib/supabase");
    await supabase.from("projects").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", workspaceId);
    refetchWorkspace();
  }, [workspaceId, refetchWorkspace]);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [contactsExpanded, setContactsExpanded] = useState(false);
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

  // Fetch additional data based on project type
  const ws = workspace as any;
  const isDeal = ws?.project_type === "deal";
  const companyId = isDeal ? ws?.company_id : null;

  // Contacts for deal's company
  const { data: contacts = [] } = useContacts(companyId ? { companyId } : undefined);

  // Activities for this project/deal — query by projectId for all project types
  const { data: activities = [] } = useActivities(
    isDeal && companyId
      ? { companyId, projectId: workspaceId, limit: 20 }
      : { projectId: workspaceId, limit: 20 }
  );

  // Tasks for this project
  const { data: allTasks = [] } = useAllTasks();
  // All projects for task reassignment
  const { data: allProjectsList = [] } = useProjects("all");
  // Task inline editing hooks
  const updateTaskMutation = useUpdateTask();
  const { data: taskStatuses = [] } = useStatuses(workspaceId);
  const { data: taskUsers = [] } = useUsers();
  const { data: allCompanies = [] } = useCompanies();
  const { data: allContacts = [] } = useContacts();
  const { data: milestones = [] } = useMilestones(workspaceId);
  const createMilestoneMutation = useCreateMilestone();
  const deleteMilestoneMutation = useDeleteMilestone();
  const reassignTask = useCallback(async (taskId: string, newProjectId: string) => {
    const { supabase } = await import("../../lib/supabase");
    await supabase.from("tasks").update({ project_id: newProjectId }).eq("id", taskId);
    refetchWorkspace();
  }, [refetchWorkspace]);

  const deleteProject = useCallback(async () => {
    if (!confirm("Delete this project and all its tasks? This cannot be undone.")) return;
    const { supabase } = await import("../../lib/supabase");

    // Delete tasks one by one (they may have FK refs from task_labels etc)
    const { data: tasks } = await supabase.from("tasks").select("id").eq("project_id", workspaceId);
    if (tasks) {
      for (const t of tasks) {
        await supabase.from("task_labels").delete().eq("task_id", t.id);
        await supabase.from("task_activity").delete().eq("task_id", t.id);
        await supabase.from("tasks").delete().eq("id", t.id);
      }
    }
    // Delete task statuses
    await supabase.from("task_statuses").delete().eq("project_id", workspaceId);
    // Delete project children
    await supabase.from("project_sessions").delete().eq("project_id", workspaceId);
    await supabase.from("project_artifacts").delete().eq("project_id", workspaceId);
    await supabase.from("project_context").delete().eq("project_id", workspaceId);
    // Delete activities
    await supabase.from("crm_activities").delete().eq("project_id", workspaceId);
    // Delete initiative links
    await supabase.from("initiative_projects").delete().eq("project_id", workspaceId);
    // Delete project updates
    await supabase.from("project_updates").delete().eq("project_id", workspaceId);
    // Delete the project
    const { error } = await supabase.from("projects").delete().eq("id", workspaceId);
    if (error) {
      alert(`Failed to delete: ${error.message}`);
      return;
    }
    _onUpdated();
    onBack();
  }, [workspaceId, onBack, _onUpdated]);

  const projectTasks = allTasks.filter(t => t.project_id === workspaceId);
  const completedTasks = projectTasks.filter(t => t.status?.type === "completed").length;

  // Config-driven project fields — subscribe to store so changes in settings trigger re-render
  const enabledProjectFields = useProjectFieldsStore((s) => s.getEnabledFields((workspace as any)?.project_type || "work"));
  const dealFieldKeys = new Set(["deal_stage", "deal_value", "deal_currency", "deal_solution", "deal_expected_close", "deal_actual_close", "deal_proposal_path", "deal_order_form_path", "deal_lost_reason", "deal_won_notes", "deal_notes"]);
  const configuredFields = getFieldDefsForType((workspace as any)?.project_type || "work")
    .filter(f => enabledProjectFields.includes(f.key))
    .filter(f => !(!companyId && dealFieldKeys.has(f.key))); // Hide deal fields for projects without a company

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-zinc-400">Loading...</div>;
  }

  if (!workspace) {
    return <div className="h-full flex items-center justify-center text-zinc-400">Project not found</div>;
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
                <EditableField value={workspace.title} onSave={(v) => updateProjectField("name", v)} />
              </h1>
              {(() => {
                const projectType = (workspace as any).project_type;
                if (!projectType) return null;
                return (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex-shrink-0",
                    projectType === "deal" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                  )}>
                    {projectType}
                  </span>
                );
              })()}
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu((v) => !v)}
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:ring-1 hover:ring-offset-1 transition-shadow"
                  style={{ backgroundColor: `${statusColor}18`, color: statusColor, ['--tw-ring-color' as string]: statusColor }}
                >
                  {WORKSPACE_STATUS_LABELS[workspace.status] || workspace.status}
                </button>
                {showStatusMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[120px]">
                      {Object.entries(WORKSPACE_STATUS_LABELS).map(([key, label]) => {
                        const c = WORKSPACE_STATUS_COLORS[key] || "#6B7280";
                        const isActive = workspace.status === key;
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (!isActive) {
                                updateWorkspace.mutate({ id: workspaceId, updates: { status: key } });
                              }
                              setShowStatusMenu(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors",
                              isActive
                                ? "bg-zinc-50 dark:bg-zinc-800"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                            )}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                            <span className="font-medium" style={{ color: isActive ? c : undefined }}>
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              <EditableField value={workspace.description} onSave={(v) => updateProjectField("description", v)} />
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400 flex-shrink-0">
            {workspace.owner && <span>{workspace.owner}</span>}
            <button
              onClick={() => { navigator.clipboard.writeText(workspaceId); toast.success("Project ID copied"); }}
              className="font-mono text-zinc-300 dark:text-zinc-600 hover:text-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer"
              title={workspaceId}
            >
              {workspaceId.slice(0, 8)}
            </button>
            <span>{formatDateTime(workspace.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Body: artifacts left, preview/sessions right */}
      <div className="flex-1 overflow-hidden flex">
        {/* LEFT: Artifacts tree */}
        <div className="flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800/50 flex flex-col" style={{ width: sidebarWidth }}>
          {/* Overview button */}
          <button
            onClick={() => setSelection(null)}
            className={cn(
              "flex-shrink-0 w-full text-left px-3 py-2 text-xs font-medium border-b transition-colors",
              !selection
                ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/50"
                : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800/50"
            )}
          >
            Project Details
          </button>
          {/* Sticky header */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 pt-3 pb-2">
            <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Artifacts ({artifacts.length})
            </h3>
            <button
              onClick={() => setShowPicker(true)}
              className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-zinc-500 hover:text-teal-500 transition-colors flex-shrink-0"
              title="Add artifact from library"
            >
              <Plus size={13} />
            </button>
          </div>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
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
                      {(() => {
                        // Compute minimum unique path prefixes for duplicate labels
                        const prefixMap = new Map<string, string>();
                        const labelGroups = new Map<string, typeof typeArtifacts>();
                        for (const a of typeArtifacts) {
                          const group = labelGroups.get(a.label) || [];
                          group.push(a);
                          labelGroups.set(a.label, group);
                        }
                        for (const [, group] of labelGroups) {
                          if (group.length <= 1) continue;
                          // Walk up path segments until all are unique
                          const refs = group.map(a => a.reference?.replace(/\/$/, "").split("/") || []);
                          for (let depth = 1; depth <= 10; depth++) {
                            const prefixes = refs.map(parts => {
                              const start = Math.max(0, parts.length - 1 - depth);
                              return parts.slice(start, parts.length - 1).join("/");
                            });
                            const unique = new Set(prefixes);
                            if (unique.size === group.length || depth === 10) {
                              group.forEach((a, i) => prefixMap.set(a.id, prefixes[i]));
                              break;
                            }
                          }
                        }
                        return typeArtifacts.map((artifact) =>
                          artifact.type === "task" ? (
                            <TaskArtifactItem
                              key={artifact.id}
                              artifact={artifact}
                              workspaceId={workspaceId}
                              isSelected={taskDetailId === artifact.reference}
                              onSelect={() => setTaskDetailId(artifact.reference)}
                            />
                          ) : artifact.type === "crm_deal" ? (
                            <CrmDealArtifactItem
                              key={artifact.id}
                              artifact={artifact}
                              workspaceId={workspaceId}
                              isSelected={selection?.type === "crm_deal" && selection.id === artifact.reference}
                              onSelect={() => setSelection({ type: "crm_deal", id: artifact.reference })}
                            />
                          ) : artifact.type === "crm_company" ? (
                            <CrmCompanyArtifactItem
                              key={artifact.id}
                              artifact={artifact}
                              workspaceId={workspaceId}
                              isSelected={selection?.type === "crm_company" && selection.id === artifact.reference}
                              onSelect={() => setSelection({ type: "crm_company", id: artifact.reference })}
                            />
                          ) : (
                            <ArtifactTreeItem
                              key={artifact.id}
                              artifact={artifact}
                              workspaceId={workspaceId}
                              basePath={basePath}
                              allRepoPaths={repositories.map(r => r.path)}
                              selectedFile={selectedFile}
                              onSelectFile={(path) => setSelection({ type: "file", path })}
                              pathPrefix={prefixMap.get(artifact.id)}
                            />
                          )
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sessions below artifacts */}
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
              <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                Sessions ({sessions.length})
              </h3>
              {sessions.length === 0 ? (
                <p className="text-xs text-zinc-400">No sessions yet</p>
              ) : (
                <div className="space-y-1">
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

            {/* Deal metadata — hidden from project details pane, managed via CRM */}
            {false && isDeal && companyId && (
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                  Deal Info
                </h3>
                <div className="space-y-0.5 text-xs">
                  {([
                    { label: "Stage", field: "deal_stage", type: "select" as const, options: DEAL_STAGES.map(s => ({ value: s.value, label: s.label })), displayValue: DEAL_STAGES.find(s => s.value === ws.deal_stage)?.label },
                    { label: "Value", field: "deal_value", type: "number" as const, displayValue: ws.deal_value ? `${ws.deal_currency || "SGD"} ${Number(ws.deal_value).toLocaleString()}` : undefined },
                    { label: "Currency", field: "deal_currency", type: "text" as const },
                    { label: "Solution", field: "deal_solution", type: "select" as const, options: DEAL_SOLUTIONS.map(s => ({ value: s.value, label: s.label })), displayValue: DEAL_SOLUTIONS.find(s => s.value === ws.deal_solution)?.label },
                    { label: "Expected Close", field: "deal_expected_close", type: "date" as const },
                    { label: "Actual Close", field: "deal_actual_close", type: "date" as const },
                    { label: "Proposal", field: "deal_proposal_path", type: "text" as const },
                    { label: "Order Form", field: "deal_order_form_path", type: "text" as const },
                    { label: "Lost Reason", field: "deal_lost_reason", type: "text" as const },
                    { label: "Won Notes", field: "deal_won_notes", type: "text" as const },
                    { label: "Notes", field: "deal_notes", type: "textarea" as const },
                  ] as any[]).map(({ label, field, type, options: opts, displayValue: dv }: any) => (
                    <div key={field} className="grid grid-cols-[90px,1fr] gap-1 items-start">
                      <span className="text-zinc-400 py-0.5">{label}</span>
                      <EditableField
                        value={ws[field]}
                        type={type}
                        options={opts}
                        displayValue={dv}
                        onSave={(v) => updateProjectField(field, type === "number" ? (parseFloat(v) || null) : (v || null))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts (for deals with a company) */}
            {isDeal && companyId && contacts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                <button
                  onClick={() => setContactsExpanded(!contactsExpanded)}
                  className="flex items-center gap-1 w-full text-left mb-1.5"
                >
                  {contactsExpanded ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
                  <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Contacts ({contacts.length})
                  </h3>
                </button>
                {contactsExpanded && (
                  <div className="space-y-0.5">
                    {contacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => setSelection({ type: "contact", id: contact.id })}
                        className={cn(
                          "block w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                          selection?.type === "contact" && selection.id === contact.id
                            ? "bg-teal-50 dark:bg-teal-950/30"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">{contact.name}</span>
                          {contact.is_primary && (
                            <span className="text-[9px] px-1 py-0 rounded bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">Primary</span>
                          )}
                        </div>
                        {contact.role && <div className="text-zinc-400 text-[11px]">{contact.role}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Activities moved to body pane (right side) */}
          </div>
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
        />

        {/* RIGHT: File preview, session detail, task detail, or context */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Close bar — shown when viewing a file/session/entity so user can return to project details */}
          {selection && (
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/80 dark:bg-zinc-900/50">
              <button
                onClick={() => setSelection(null)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft size={12} />
                Project Details
              </button>
              <button
                onClick={() => setSelection(null)}
                className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {selectedFile ? (
            <FilePreview path={selectedFile} />
          ) : selectedSession ? (
            <SessionDetail session={selectedSession} artifacts={artifacts} />
          ) : selection?.type === "crm_deal" ? (
            <DealDetail dealId={selection.id} />
          ) : selection?.type === "crm_company" ? (
            <CompanyDetail companyId={selection.id} />
          ) : selection?.type === "contact" ? (
            <ContactDetailPanel contact={contacts.find(c => c.id === selection.id) || null} />
          ) : selection?.type === "activity" ? (
            <ActivityDetailPanel activity={activities.find(a => a.id === selection.id) || null} />
          ) : (
            <div className="h-full overflow-y-auto p-6">
              {/* Current State */}
              <div className="mb-6 p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50 rounded-lg">
                <h3 className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertCircle size={12} /> Current State
                </h3>
                {context?.current_state ? (
                  <p className="text-sm text-teal-800 dark:text-teal-300">{context.current_state}</p>
                ) : (
                  <p className="text-xs text-teal-600/50 dark:text-teal-500/50 italic">No current state set</p>
                )}
              </div>

              {/* Context */}
              <div className="mb-6">
                <button onClick={() => setCollapsedSections(s => ({ ...s, context: !s.context }))} className="flex items-center gap-1.5 mb-2 group">
                  {collapsedSections.context ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Context</h3>
                </button>
                {!collapsedSections.context && (
                  context?.context_summary ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap pl-5">{unescapeNewlines(context.context_summary)}</p>
                  ) : (
                    <p className="text-xs text-zinc-400 italic pl-5">No context summary yet</p>
                  )
                )}
              </div>

              {/* Project Details — editable fields */}
              <div className="mb-6">
                <button onClick={() => setCollapsedSections(s => ({ ...s, details: !s.details }))} className="flex items-center gap-1.5 mb-3 group">
                  {collapsedSections.details ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Project Details</h3>
                </button>
                {!collapsedSections.details && <div className="space-y-1 text-xs pl-5">
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Name</span>
                    <EditableField value={workspace.title} onSave={(v) => updateProjectField("name", v)} />
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Description</span>
                    <EditableField value={workspace.description} type="textarea" onSave={(v) => updateProjectField("description", v || null)} />
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Owner</span>
                    <EditableField
                      value={ws.lead_id || ""}
                      type="select"
                      options={[{ value: "", label: "—" }, ...taskUsers.map(u => ({ value: u.id, label: u.name }))]}
                      displayValue={taskUsers.find(u => u.id === ws.lead_id)?.name || ws.owner || undefined}
                      onSave={(v) => {
                        const user = taskUsers.find(u => u.id === v);
                        updateProjectField("lead_id", v || null);
                        updateProjectField("owner", user?.name || null);
                      }}
                    />
                  </div>

                  {/* Company (for deals) */}
                  {isDeal && (
                    <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                      <span className="text-zinc-400 py-1">Company</span>
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 py-1">
                        {ws.company?.display_name || ws.company?.name || "—"}
                        {ws.company?.stage && <span className="text-zinc-400 ml-1">({ws.company.stage})</span>}
                      </span>
                    </div>
                  )}

                  {/* Configurable fields (driven by Settings > Project Fields) */}
                  {configuredFields.length > 0 && (
                    <>
                      <div className="border-t border-zinc-100 dark:border-zinc-800 my-2" />
                      {configuredFields.map((field) => {
                        let displayValue: string | undefined;
                        if (field.options) {
                          displayValue = field.options.find((o: { value: string; label: string }) => o.value === String(ws[field.key] ?? ""))?.label;
                        } else if (field.key === "deal_value" && ws[field.key]) {
                          displayValue = `${ws.deal_currency || "SGD"} ${Number(ws[field.key]).toLocaleString()}`;
                        }
                        return (
                          <div key={field.key} className="grid grid-cols-[120px,1fr] gap-2 items-start">
                            <span className="text-zinc-400 py-1">{field.label}</span>
                            <EditableField
                              value={ws[field.key]}
                              type={field.type}
                              options={field.options}
                              displayValue={displayValue}
                              onSave={(v) => updateProjectField(field.key, field.type === "number" ? (parseFloat(v) || null) : (v || null))}
                            />
                          </div>
                        );
                      })}
                    </>
                  )}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 mt-3 pt-3">
                    <button
                      onClick={deleteProject}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded px-2 py-1.5 transition-colors"
                    >
                      <Trash2 size={12} />
                      Delete Project
                    </button>
                  </div>
                </div>}
              </div>

              {/* Tasks table — grouped by milestone when milestones exist */}
              <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setCollapsedSections(s => ({ ...s, tasks: !s.tasks }))} className="flex items-center gap-1.5 group">
                    {collapsedSections.tasks ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Tasks ({projectTasks.length})
                    </h3>
                  </button>
                    <div className="flex items-center gap-3">
                      {onCreateTask && (
                        <button
                          onClick={onCreateTask}
                          className="flex items-center gap-1 text-[10px] font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors"
                        >
                          <Plus size={10} /> New Task
                        </button>
                      )}
                      {showMilestoneInput ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (newMilestoneName.trim()) {
                              createMilestoneMutation.mutate({ project_id: workspaceId, name: newMilestoneName.trim() });
                            }
                            setNewMilestoneName("");
                            setShowMilestoneInput(false);
                          }}
                        >
                          <input
                            autoFocus
                            value={newMilestoneName}
                            onChange={(e) => setNewMilestoneName(e.target.value)}
                            onBlur={() => { setNewMilestoneName(""); setShowMilestoneInput(false); }}
                            onKeyDown={(e) => { if (e.key === "Escape") { setNewMilestoneName(""); setShowMilestoneInput(false); } }}
                            placeholder="Milestone name..."
                            className="text-[11px] border border-teal-400 rounded px-1.5 py-0.5 bg-white dark:bg-zinc-900 outline-none w-36"
                          />
                        </form>
                      ) : (
                        <button
                          onClick={() => setShowMilestoneInput(true)}
                          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                        >
                          <Plus size={10} /> Milestone
                        </button>
                      )}
                      <div className="flex items-center gap-2 w-40">
                        <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all"
                            style={{ width: `${projectTasks.length ? (completedTasks / projectTasks.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-400">{completedTasks}/{projectTasks.length}</span>
                      </div>
                    </div>
                  </div>
                  {collapsedSections.tasks ? null : projectTasks.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic pl-5">No tasks yet</p>
                  ) : milestones.length > 0 ? (
                    <MilestoneTaskGroups
                      milestones={milestones}
                      tasks={projectTasks}
                      taskStatuses={taskStatuses}
                      taskUsers={taskUsers}
                      taskDetailId={taskDetailId}
                      onSelectTask={setTaskDetailId}
                      onContextMenu={(taskId, x, y) => { setTaskContextMenu({ taskId, x, y }); setTaskProjectSearch(""); }}
                      onUpdateTask={(id, updates) => updateTaskMutation.mutate({ id, updates })}
                      onDeleteMilestone={(id) => deleteMilestoneMutation.mutate(id)}
                    />
                  ) : (
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left px-3 py-2 font-medium text-zinc-400 w-8"></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-16">ID</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400">Title</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-20">Type</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400">Company</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400">Contact</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-16">Days</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-24">Priority</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-28">Assignee</th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-28">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks
                          .sort((a, b) => {
                            const order: Record<string, number> = { started: 0, review: 0, unstarted: 1, backlog: 2, completed: 3, canceled: 4 };
                            const statusDiff = (order[a.status?.type || ""] ?? 5) - (order[b.status?.type || ""] ?? 5);
                            if (statusDiff !== 0) return statusDiff;
                            return (a.task_number ?? 0) - (b.task_number ?? 0);
                          })
                          .map((task) => {
                            const statusType = (task.status?.type as StatusType) ?? "unstarted";
                            const statusColor = STATUS_TYPE_COLORS[statusType] || "#6B7280";
                            const identifier = getTaskIdentifier(task);
                            const priorityColor = PriorityColors[task.priority as Priority] ?? "#6B7280";

                            return (
                              <tr
                                key={task.id}
                                onClick={() => setTaskDetailId(task.id)}
                                onContextMenu={(e) => { e.preventDefault(); setTaskContextMenu({ taskId: task.id, x: e.clientX, y: e.clientY }); setTaskProjectSearch(""); }}
                                className={cn(
                                  "border-b border-zinc-100 dark:border-zinc-800/50 cursor-pointer transition-colors group",
                                  taskDetailId === task.id
                                    ? "bg-teal-50/50 dark:bg-teal-950/20"
                                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                                )}
                              >
                                {/* Status */}
                                <td className="px-3 py-1.5 relative" onClick={(e) => e.stopPropagation()}>
                                  <div className="relative w-5 h-5">
                                    {/* Visual icon */}
                                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                      {statusType === "completed" ? (
                                        <CheckCircle2 size={14} style={{ color: statusColor }} />
                                      ) : statusType === "canceled" ? (
                                        <XCircle size={14} style={{ color: statusColor }} />
                                      ) : statusType === "started" || statusType === "review" ? (
                                        <svg width="14" height="14" viewBox="0 0 16 16">
                                          <circle cx="8" cy="8" r="6.5" fill="none" stroke={statusColor} strokeWidth="1.5" />
                                          <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" fill={statusColor} />
                                        </svg>
                                      ) : (
                                        <Circle size={14} style={{ color: statusColor }} />
                                      )}
                                    </span>
                                    {/* Invisible select on top */}
                                    <select
                                      value={task.status_id || ""}
                                      onChange={(e) => {
                                        updateTaskMutation.mutate({ id: task.id, updates: { status_id: e.target.value } });
                                      }}
                                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      title={STATUS_TYPE_LABELS[statusType]}
                                    >
                                      {taskStatuses.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                                {/* ID */}
                                <td className="px-2 py-1.5 text-zinc-400 font-mono text-[11px] whitespace-nowrap">{identifier}</td>
                                {/* Title */}
                                <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium truncate max-w-0">
                                  <span className="truncate block">{task.title}</span>
                                </td>
                                {/* Type */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={task.task_type || "general"}
                                    onChange={(e) => {
                                      updateTaskMutation.mutate({ id: task.id, updates: { task_type: e.target.value } });
                                    }}
                                    className={`appearance-none text-[10px] px-1.5 py-0.5 rounded font-medium cursor-pointer border-0 outline-none ${
                                      task.task_type === "target" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                      task.task_type === "prospect" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                      task.task_type === "follow_up" ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" :
                                      "bg-transparent text-zinc-400"
                                    }`}
                                  >
                                    <option value="general">—</option>
                                    <option value="target">Target</option>
                                    <option value="prospect">Prospect</option>
                                    <option value="follow_up">Follow Up</option>
                                  </select>
                                </td>
                                {/* Company */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={(task as any).company_id || ""}
                                    onChange={(e) => {
                                      updateTaskMutation.mutate({ id: task.id, updates: { company_id: e.target.value || null, contact_id: null } });
                                    }}
                                    className="appearance-none bg-transparent text-[11px] cursor-pointer border-0 outline-none text-zinc-500"
                                  >
                                    <option value="">—</option>
                                    {allCompanies.map((c) => (
                                      <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* Contact */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={(task as any).contact_id || ""}
                                    onChange={(e) => {
                                      updateTaskMutation.mutate({ id: task.id, updates: { contact_id: e.target.value || null } });
                                    }}
                                    className="appearance-none bg-transparent text-[11px] cursor-pointer border-0 outline-none text-zinc-500"
                                  >
                                    <option value="">—</option>
                                    {allContacts
                                      .filter((c) => !(task as any).company_id || c.company_id === (task as any).company_id)
                                      .map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                  </select>
                                </td>
                                {/* Days in Stage */}
                                <td className="px-2 py-1.5">
                                  {task.task_type_changed_at && task.task_type && task.task_type !== "general" && (() => {
                                    const days = Math.floor((Date.now() - new Date(task.task_type_changed_at!).getTime()) / (1000 * 60 * 60 * 24));
                                    const color = days > 30 ? "text-red-500" : days > 14 ? "text-amber-500" : "text-zinc-400";
                                    return <span className={`text-[11px] ${color}`}>{days}d</span>;
                                  })()}
                                </td>
                                {/* Priority */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={task.priority ?? Priority.None}
                                    onChange={(e) => {
                                      updateTaskMutation.mutate({ id: task.id, updates: { priority: parseInt(e.target.value) } });
                                    }}
                                    className="appearance-none bg-transparent text-xs cursor-pointer border-0 outline-none px-1.5 py-0.5 rounded-full font-medium"
                                    style={{ backgroundColor: `${priorityColor}15`, color: priorityColor }}
                                  >
                                    {Object.entries(PriorityLabels).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* Assignee */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={task.assignee_id || ""}
                                    onChange={(e) => {
                                      updateTaskMutation.mutate({ id: task.id, updates: { assignee_id: e.target.value || null } });
                                    }}
                                    className="appearance-none bg-transparent text-xs cursor-pointer border-0 outline-none text-zinc-600 dark:text-zinc-400 w-full truncate"
                                  >
                                    <option value="">—</option>
                                    {taskUsers.map((u) => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* Due Date */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="date"
                                      value={task.due_date?.split("T")[0] || ""}
                                      onChange={(e) => {
                                        updateTaskMutation.mutate({ id: task.id, updates: { due_date: e.target.value ? `${e.target.value}T00:00:00Z` : null } });
                                      }}
                                      className="bg-transparent text-xs cursor-pointer border-0 outline-none text-zinc-600 dark:text-zinc-400 flex-1 min-w-0"
                                    />
                                    {task.due_date && (
                                      <button
                                        onClick={() => updateTaskMutation.mutate({ id: task.id, updates: { due_date: null } })}
                                        className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-300 group-hover:text-zinc-400 hover:!text-red-500 transition-colors"
                                        title="Clear due date"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  )}
              </div>

              {/* Activities timeline */}
              <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button onClick={() => setCollapsedSections(s => ({ ...s, activities: !s.activities }))} className="flex items-center gap-1.5 mb-3 group">
                  {collapsedSections.activities ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Activities ({activities.length})
                  </h3>
                </button>
                {collapsedSections.activities ? null : activities.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic pl-5">No activities yet</p>
                ) : (
                <div className="space-y-3 pl-5">
                  {activities.slice(0, 20).map((activity) => {
                      const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.type);
                      const date = new Date(activity.activity_date);
                      const dateStr = date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
                      const timeStr = date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div key={activity.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold",
                              activity.type === "note" ? "bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400" :
                              activity.type === "meeting" ? "bg-purple-50 text-purple-500 dark:bg-purple-950/30 dark:text-purple-400" :
                              activity.type === "call" ? "bg-green-50 text-green-500 dark:bg-green-950/30 dark:text-green-400" :
                              activity.type === "email" ? "bg-orange-50 text-orange-500 dark:bg-orange-950/30 dark:text-orange-400" :
                              "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            )}>
                              {(typeInfo?.label || activity.type).charAt(0).toUpperCase()}
                            </div>
                            <div className="w-px flex-1 bg-zinc-100 dark:bg-zinc-800 mt-1" />
                          </div>
                          <div className="flex-1 min-w-0 pb-3">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">
                                {typeInfo?.label || activity.type}
                              </span>
                              <span className="text-[10px] text-zinc-400">{dateStr} {timeStr}</span>
                            </div>
                            {activity.subject && (
                              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-0.5">{activity.subject}</div>
                            )}
                            {activity.content && (
                              <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{activity.content}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* File picker modal */}
      {/* Task right-click context menu — reassign to project */}
      {taskContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setTaskContextMenu(null); setContextMenuTab("milestone"); }} onContextMenu={(e) => { e.preventDefault(); setTaskContextMenu(null); setContextMenuTab("milestone"); }} />
          <div
            className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[260px] max-h-[340px] flex flex-col overflow-hidden"
            style={{ left: taskContextMenu.x, top: Math.min(taskContextMenu.y, window.innerHeight - 360) }}
          >
            {/* Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-700">
              {milestones.length > 0 && (
                <button
                  onClick={() => setContextMenuTab("milestone")}
                  className={cn(
                    "flex-1 px-3 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5",
                    contextMenuTab === "milestone"
                      ? "text-teal-600 border-b-2 border-teal-500 -mb-px"
                      : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <MilestoneIcon size={12} /> Milestone
                </button>
              )}
              <button
                onClick={() => setContextMenuTab("project")}
                className={cn(
                  "flex-1 px-3 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5",
                  contextMenuTab === "project" || milestones.length === 0
                    ? "text-teal-600 border-b-2 border-teal-500 -mb-px"
                    : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <Folder size={12} /> Project
              </button>
            </div>

            {/* Milestone tab */}
            {contextMenuTab === "milestone" && milestones.length > 0 && (
              <div className="overflow-y-auto flex-1 py-1">
                <button
                  onClick={() => {
                    updateTaskMutation.mutate({ id: taskContextMenu.taskId, updates: { milestone_id: null } });
                    setTaskContextMenu(null); setContextMenuTab("milestone");
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-400 italic"
                >
                  No milestone
                </button>
                {milestones.map(m => {
                  const task = projectTasks.find(t => t.id === taskContextMenu.taskId);
                  const isCurrent = task?.milestone_id === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        updateTaskMutation.mutate({ id: taskContextMenu.taskId, updates: { milestone_id: m.id } });
                        setTaskContextMenu(null); setContextMenuTab("milestone");
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${isCurrent ? "bg-teal-50 dark:bg-teal-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                    >
                      <MilestoneIcon size={12} className={isCurrent ? "text-teal-500" : "text-zinc-400"} />
                      <span className={isCurrent ? "font-medium text-teal-600" : ""}>{m.name}</span>
                      {isCurrent && <CheckCircle2 size={12} className="ml-auto text-teal-500" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Project tab */}
            {(contextMenuTab === "project" || milestones.length === 0) && contextMenuTab !== "milestone" && (
              <>
                <div className="px-2 py-2">
                  <input
                    type="text"
                    value={taskProjectSearch}
                    onChange={(e) => setTaskProjectSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="text-xs w-full border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 outline-none"
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  {allProjectsList
                    .filter(p => !taskProjectSearch || p.name.toLowerCase().includes(taskProjectSearch.toLowerCase()))
                    .slice(0, 20)
                    .map(p => {
                      const isCurrent = p.id === workspaceId;
                      return (
                        <button
                          key={p.id}
                          onClick={async () => {
                            await reassignTask(taskContextMenu.taskId, p.id);
                            setTaskContextMenu(null); setContextMenuTab("milestone");
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${isCurrent ? "bg-zinc-50 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                        >
                          <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                          <span className={`truncate ${isCurrent ? "font-medium text-teal-600" : ""}`}>{p.name}</span>
                          <span className={`text-[8px] px-1 rounded-full uppercase ml-auto flex-shrink-0 ${
                            p.project_type === "deal" ? "bg-blue-50 text-blue-500" : "bg-zinc-100 text-zinc-400"
                          }`}>{p.project_type || "work"}</span>
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showPicker && (
        <ArtifactPickerModal
          basePath={basePath}
          workspaceId={workspaceId}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Task detail slide-out panel */}
      {taskDetailId && (
        <>
          <div className="fixed inset-0 z-30 bg-black/10" onClick={() => setTaskDetailId(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-[560px] shadow-xl border-l border-zinc-200 dark:border-zinc-800">
            <TaskDetailPanel
              taskId={taskDetailId}
              onClose={() => setTaskDetailId(null)}
              onUpdated={() => refetchWorkspace()}
              onDeleted={() => { setTaskDetailId(null); refetchWorkspace(); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
