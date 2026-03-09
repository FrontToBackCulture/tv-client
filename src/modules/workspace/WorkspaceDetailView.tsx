// src/modules/workspace/WorkspaceDetailView.tsx
// Workspace detail: artifact tree (left) + file preview / sessions (right)

import { useState, useRef, useCallback } from "react";
import {
  ArrowLeft, FileText, Puzzle, Building2, Code2,
  BarChart3, ListChecks, Globe, FileSpreadsheet, ChevronDown,
  ChevronRight, LucideIcon, Lightbulb, HelpCircle, CheckCircle2,
  AlertCircle, X, Folder, FolderOpen, File, Plus, Loader2, Calendar,
  Circle, XCircle, PenTool,
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
import { useTask } from "../../hooks/work/useTasks";
import { useDeal } from "../../hooks/crm/useDeals";
import { useCompany } from "../../hooks/crm/useCompanies";
import { DEAL_STAGES, COMPANY_STAGES } from "../../lib/crm/types";
import { useRepository } from "../../stores/repositoryStore";
import type { WorkspaceSession, WorkspaceArtifact } from "../../lib/workspace/types";

/** Unescape literal \n sequences that arrive from MCP JSON serialization */
const unescapeNewlines = (s: string) => s.replace(/\\n/g, "\n");
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
  const { data: content, isLoading, isError } = useReadFile(skipContent ? "" : path);

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
  if (editing && galleryItem) {
    if (previewType === "excalidraw") {
      return <ExcalidrawEditor item={galleryItem} onBack={() => setEditing(false)} />;
    }
    if (previewType === "image") {
      return <ImageEditor item={galleryItem} onBack={() => setEditing(false)} />;
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
  const updateWorkspace = useUpdateWorkspace();
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";
  const [selection, setSelection] = useState<{ type: "file"; path: string } | { type: "session"; id: string } | { type: "task"; id: string } | { type: "crm_deal"; id: string } | { type: "crm_company"; id: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
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
        <div className="flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800/50 flex flex-col" style={{ width: sidebarWidth }}>
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
                      {typeArtifacts.map((artifact) =>
                        artifact.type === "task" ? (
                          <TaskArtifactItem
                            key={artifact.id}
                            artifact={artifact}
                            workspaceId={workspaceId}
                            isSelected={selection?.type === "task" && selection.id === artifact.reference}
                            onSelect={() => setSelection({ type: "task", id: artifact.reference })}
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
          ) : selection?.type === "crm_deal" ? (
            <DealDetail dealId={selection.id} />
          ) : selection?.type === "crm_company" ? (
            <CompanyDetail companyId={selection.id} />
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
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{unescapeNewlines(context.context_summary)}</p>
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
