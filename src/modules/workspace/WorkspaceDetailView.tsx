// src/modules/workspace/WorkspaceDetailView.tsx
// Workspace detail: artifact tree (left) + file preview / sessions (right)

import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, FileText, Puzzle, Building2, Code2,
  BarChart3, ListChecks, Globe, FileSpreadsheet, ChevronDown,
  ChevronRight, LucideIcon, Lightbulb, HelpCircle, CheckCircle2, Check,
  AlertCircle, X, Folder, FolderOpen, File, Plus, Loader2, Calendar,
  Circle, PenTool, Trash2, Milestone as MilestoneIcon, ArrowUpRight, Mail,
  MessageSquare, Maximize2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { FolderPickerField } from "../../components/ui/FolderPickerField";
import { ExcalidrawEditor } from "../gallery/ExcalidrawEditor";
import { ImageEditor } from "../gallery/ImageEditor";
import type { GalleryItem } from "../gallery/useGallery";
import {
  PDFViewer, ImageViewer, CSVViewer, JSONViewer, SQLViewer,
  HTMLViewer, ExcalidrawViewer,
} from "../library/viewers";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace, useUpdateWorkspace, useAddArtifact, useRemoveArtifact } from "../../hooks/workspace";
import { useFileTree, useReadFile, useFolderChildren, type TreeNode } from "../../hooks/useFiles";
import { useTask, useTasks, useUpdateTask } from "../../hooks/work/useTasks";
import { workKeys } from "../../hooks/work/keys";
import { useMilestones, useCreateMilestone, useDeleteMilestone } from "../../hooks/work/useMilestones";
import { useStatuses } from "../../hooks/work/useStatuses";
import { useUsers } from "../../hooks/work/useUsers";
import { useProjects } from "../../hooks/work/useProjects";
import { TaskDetailPanel } from "../work/TaskDetailPanel";
import { IconButton } from "../../components/ui";
import { getFieldDefsForType, useProjectFieldsStore } from "../../stores/projectFieldsStore";
import { useDeal, useCreateDeal } from "../../hooks/crm/useDeals";
import { useCompany, useCompanies } from "../../hooks/crm/useCompanies";
import { useContacts } from "../../hooks/crm/useContacts";
import { useActivities } from "../../hooks/crm/useActivities";
import { ACTIVITY_TYPES } from "../../lib/crm/types";
import { DEAL_STAGES, COMPANY_STAGES } from "../../lib/crm/types";
import { useRepository } from "../../stores/repositoryStore";
import { toast } from "../../stores/toastStore";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount, useBotChatSessions } from "../../hooks/useDiscussions";
import { ProjectChatPopup } from "../chat/entityRefs/ProjectChatPopup";
import { Brain } from "lucide-react";
import { useTaskFieldsStore } from "../../stores/taskFieldsStore";
import type { WorkspaceSession, WorkspaceArtifact } from "../../lib/workspace/types";
import { MilestoneTaskGroups } from "./MilestoneTaskGroups";
import { Sparkles } from "lucide-react";
import { AutoAssignCompanyModal } from "../work/AutoAssignCompanyModal";
import { AutoAssignProjectModal } from "../work/AutoAssignProjectModal";
import { useInitiatives } from "../../hooks/work/useInitiatives";
import { useInitiativeProjects, initials } from "../work/workViewsShared";
import { PriorityBars } from "../work/StatusIcon";
import { EmailsPanel } from "../../components/emails/EmailsPanel";
import { useLinkedEmailCount } from "../../hooks/email/useEntityEmails";
import { EventsPanel } from "../../components/events/EventsPanel";
import { useLinkedEventCount } from "../../hooks/useEntityEvents";

/** Unescape literal \n sequences that arrive from MCP JSON serialization */
const unescapeNewlines = (s: string) => s.replace(/\\n/g, "\n");
import { type StatusType, PriorityLabels, Priority, getTaskIdentifier } from "../../lib/work/types";
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
  onNavigateToProject?: (projectId: string) => void;
  onExpandProject?: (projectId: string) => void;
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
          className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
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
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
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
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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
  todo: "#9CA3AF",
  in_progress: "#F59E0B",
  complete: "#10B981",
};

const STATUS_TYPE_LABELS: Record<StatusType, string> = {
  todo: "To-do",
  in_progress: "In Progress",
  complete: "Complete",
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
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        )}
      >
        <span className="w-[11px]" />
        {/* Status icon: filled circle for complete, half for in_progress, empty for todo */}
        <span className="flex-shrink-0" title={statusLabel ?? undefined}>
          {statusType === "complete" ? (
            <CheckCircle2 size={13} style={{ color: statusColor }} />
          ) : statusType === "in_progress" ? (
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
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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

// @ts-expect-error — SessionItem kept for legacy code paths, sessions feature removed from UI
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
          className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
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
      className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
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
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add Artifact</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-400">
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
  type?: "text" | "number" | "date" | "select" | "multiselect" | "textarea";
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
    let display: React.ReactNode = null;
    if (type === "multiselect" && options && value) {
      const selected = String(value).split(",").filter(Boolean);
      const labels = selected.map(v => options.find(o => o.value === v)?.label || v);
      display = labels.length > 0 ? labels.join(", ") : null;
    } else {
      display = displayValue || (value != null && value !== "" ? String(value) : null);
    }
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

  if (type === "multiselect" && options) {
    const selected = new Set(String(value ?? "").split(",").filter(Boolean));
    const toggle = (v: string) => {
      const next = new Set(selected);
      if (next.has(v)) next.delete(v); else next.add(v);
      const csv = [...next].join(",");
      onSave(csv);
    };
    return (
      <div className="flex flex-wrap gap-1 py-0.5">
        {options.map(o => {
          const isSelected = selected.has(o.value);
          return (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                isSelected
                  ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 ring-1 ring-teal-300 dark:ring-teal-700"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        <button
          onClick={() => setEditing(false)}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300"
        >
          Done
        </button>
      </div>
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

function SearchableFilter({ label, selected, options, onToggle, onClear }: {
  label: string;
  selected: Set<string>;
  options: { value: string; label: string; count?: number }[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => { if (open) { setSearch(""); inputRef.current?.focus(); } }, [open]);

  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`text-[11px] px-2 py-1 rounded-lg border outline-none cursor-pointer transition-colors flex items-center gap-1 ${
          selected.size > 0
            ? "border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
            : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-500"
        }`}
      >
        {label}{selected.size > 0 ? ` (${selected.size})` : ""}
        <ChevronDown size={10} className="text-zinc-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg min-w-[220px] max-h-[280px] flex flex-col overflow-hidden">
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full text-xs px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-teal-500/30"
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {selected.size > 0 && (
              <button onClick={() => { onClear(); }} className="w-full text-left px-3 py-1 text-[10px] text-teal-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 font-medium">
                Clear all
              </button>
            )}
            {filtered.map(o => {
              const isSelected = selected.has(String(o.value));
              return (
                <button
                  key={o.value}
                  onClick={() => onToggle(String(o.value))}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center gap-2"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "border-teal-500 bg-teal-500" : "border-zinc-300 dark:border-zinc-600"}`}>
                    {isSelected && <Check size={10} className="text-white" />}
                  </span>
                  <span className={isSelected ? "text-teal-600 font-medium" : "text-zinc-700 dark:text-zinc-300"}>{o.label}</span>
                  {o.count != null && <span className="ml-auto text-[10px] text-zinc-400">{o.count}</span>}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-3 py-2 text-[10px] text-zinc-400 italic">No matches</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableCell({ value, displayValue, options, onChange, placeholder = "—", renderTrigger }: {
  value: string | null;
  displayValue?: string;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
  placeholder?: string;
  renderTrigger?: (displayValue: string | undefined, onClick: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    setSearch("");
    const anchor = triggerRef.current || wrapperRef.current;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 220) });
    }
    setTimeout(() => inputRef.current?.focus(), 0);
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          !(wrapperRef.current?.contains(e.target as Node))) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;
  const toggle = () => setOpen(v => !v);

  return (
    <div ref={wrapperRef}>
      {renderTrigger ? renderTrigger(displayValue, toggle) : (
        <button
          ref={triggerRef}
          onClick={toggle}
          className="text-[11px] text-zinc-500 hover:text-teal-500 dark:hover:text-teal-400 transition-colors truncate w-full text-left"
        >
          {displayValue || placeholder}
        </button>
      )}
      {open && createPortal(
        <div ref={menuRef} className="fixed z-[9999] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg min-w-[200px] max-h-[260px] flex flex-col overflow-hidden" style={{ top: pos.top, left: pos.left }}>
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-teal-500/30"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${!value ? "text-teal-600 font-medium" : "text-zinc-400"}`}
            >
              {placeholder}
            </button>
            {filtered.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors truncate ${o.value === value ? "text-teal-600 font-medium bg-teal-50/50 dark:bg-teal-950/20" : "text-zinc-700 dark:text-zinc-300"}`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-[10px] text-zinc-400 italic">No matches</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function WorkspaceDetailView({ workspaceId, onBack, onUpdated: _onUpdated, onCreateTask, onNavigateToProject, onExpandProject }: Props) {
  const queryClient = useQueryClient();
  const { data: workspace, isLoading, refetch: refetchWorkspace } = useWorkspace(workspaceId);
  const updateWorkspace = useUpdateWorkspace();
  const { activeRepository, repositories } = useRepository();
  const basePath = activeRepository?.path ?? "";
  const [selection, setSelection] = useState<
    | { type: "file"; path: string }
    | { type: "session"; id: string }
    | { type: "task"; id: string }
    | { type: "crm_deal"; id: string }
    | { type: "crm_company"; id: string }
    | { type: "activity"; id: string }
    | { type: "contact"; id: string }
    | { type: "discussion" }
    | { type: "emails" }
    | { type: "events" }
    | { type: "bot-chat"; sessionId: string }
    | null
  >(null);
  const [projectChatPopupSession, setProjectChatPopupSession] = useState<string | null>(null);
  const { data: discussionCount } = useDiscussionCount("project", workspaceId);
  const botChatPrefix = `project-chat:${workspaceId}`;
  const { data: botChatSessions = [] } = useBotChatSessions(botChatPrefix);
  const [showPicker, setShowPicker] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [taskContextMenu, setTaskContextMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [taskProjectSearch, setTaskProjectSearch] = useState("");
  const [contextMenuLoading, setContextMenuLoading] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const selectedTaskIdsArray = useMemo(() => Array.from(selectedTaskIds), [selectedTaskIds]);
  const [bulkProjectMenu, setBulkProjectMenu] = useState<{ x: number; y: number } | null>(null);
  const [bulkProjectSearch, setBulkProjectSearch] = useState("");
  const [bulkMoving] = useState(false);
  const [bulkCompanyMenu, setBulkCompanyMenu] = useState<{ x: number; y: number } | null>(null);
  const [bulkCompanySearch, setBulkCompanySearch] = useState("");
  const [autoAssignCompanyOpen, setAutoAssignCompanyOpen] = useState(false);
  const [autoAssignProjectOpen, setAutoAssignProjectOpen] = useState(false);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskPageSize, setTaskPageSize] = useState(50);
  const TASK_PAGE_INCREMENT = 50;
  const [filterAssignee, setFilterAssignee] = useState<Set<string>>(new Set());
  const [filterCompany, setFilterCompany] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterDueDate, setFilterDueDate] = useState<Set<string>>(new Set());
  const [filterPriority, setFilterPriority] = useState<Set<string>>(new Set()); // "overdue" | "this_week" | "has_date" | "no_date"
  const [sortColumn, setSortColumn] = useState<string | null>(null); // column key
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ details: true, artifacts: false, emails: true, events: true });
  const [statusGroupOverrides, setStatusGroupOverrides] = useState<Map<string, boolean>>(new Map());
  const DEFAULT_HIDDEN_STATUSES = ["Backlog", "Done", "Won't Do", "Monitor", "Archived"];
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN_STATUSES));
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [contextMenuTab, setContextMenuTab] = useState<"milestone" | "project" | "convert">("milestone");
  const [newMilestoneName, setNewMilestoneName] = useState("");

  // Direct project update via Supabase — fire-and-forget for speed, toast on result
  const updateProjectField = useCallback((field: string, value: any) => {
    import("../../lib/supabase").then(({ supabase }) => {
      supabase.from("projects").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", workspaceId).then(({ error }) => {
        if (error) { toast.error(`Failed to update ${field}: ${error.message}`); }
        else { toast.success("Saved"); refetchWorkspace(); }
      });
    });
  }, [workspaceId, refetchWorkspace]);
  const [contactsExpanded, setContactsExpanded] = useState(false);

  // Fetch additional data based on project type
  const ws = workspace as any;
  const isDeal = ws?.project_type === "deal";
  const companyId = isDeal ? ws?.company_id : null;
  const enabledTaskFields = useTaskFieldsStore((s) => s.getEnabledFields(ws?.project_type || "work"));

  // Contacts for deal's company
  const { data: contacts = [] } = useContacts(companyId ? { companyId } : undefined);

  // Email count for badge
  const { data: _emailCount } = useLinkedEmailCount("project", workspaceId);

  // Event count for badge
  const { data: _eventCount } = useLinkedEventCount("project", workspaceId);

  // Activities for this project/deal — query by projectId for all project types
  const { data: activities = [] } = useActivities(
    isDeal && companyId
      ? { companyId, projectId: workspaceId, limit: 20 }
      : { projectId: workspaceId, limit: 20 }
  );

  // Tasks for this project
  const { data: projectTasks = [], refetch: refetchTasks } = useTasks(workspaceId);
  // All projects for task reassignment
  const { data: allProjectsList = [] } = useProjects("all");
  // Initiatives for project labels
  const { data: allInitiatives = [] } = useInitiatives();
  const { data: allInitiativeLinks = [] } = useInitiativeProjects();
  const projectInitiativeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of allInitiativeLinks) {
      const init = allInitiatives.find(i => i.id === link.initiative_id);
      if (init) map.set(link.project_id, init.name);
    }
    return map;
  }, [allInitiativeLinks, allInitiatives]);
  // Task inline editing hooks
  const updateTaskMutation = useUpdateTask();
  const { data: taskStatuses = [] } = useStatuses();
  const { data: taskUsers = [] } = useUsers();
  const { data: allCompanies = [] } = useCompanies();
  const { data: allContacts = [] } = useContacts();
  const partnerCompanyIds = new Set(allCompanies.filter(c => c.stage === "partner").map(c => c.id));
  const referralContactNames = useMemo(() => {
    const names = new Set<string>();
    // Partner company contacts
    allContacts.filter(c => c.company_id && partnerCompanyIds.has(c.company_id)).forEach(c => names.add(c.name));
    // Existing referred_by values from all companies (so previous referrals stay selectable)
    allCompanies.forEach(c => { if ((c as any).referred_by) names.add((c as any).referred_by); });
    return [...names].sort();
  }, [allContacts, allCompanies, partnerCompanyIds]);
  const { data: milestones = [] } = useMilestones(workspaceId);
  const createMilestoneMutation = useCreateMilestone();
  const deleteMilestoneMutation = useDeleteMilestone();
  const createDealMutation = useCreateDeal();
  const [, setIsDescribing] = useState(false);

  // @ts-expect-error — describeCurrentState is wired up but not yet called from the UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const describeCurrentState = useCallback(async () => {
    setIsDescribing(true);
    try {
      const apiKey = await invoke<string | null>("settings_get_anthropic_key");
      if (!apiKey) { toast.error("No Anthropic API key configured. Add it in Settings."); return; }

      // Gather project context
      const tasks = projectTasks;
      const taskSummary = tasks.map(t => {
        const statusLabel = t.status?.name || "Unknown";
        const company = allCompanies.find(c => c.id === t.company_id);
        return `- [${statusLabel}] ${t.title}${company ? ` (${company.display_name || company.name})` : ""}${t.due_date ? ` due ${t.due_date}` : ""}`;
      }).join("\n");

      const projectInfo = [
        `Project: ${ws?.name || "Unknown"}`,
        `Type: ${ws?.project_type || "work"}`,
        ws?.deal_stage ? `Deal Stage: ${ws.deal_stage}` : null,
        ws?.deal_solution ? `Solution: ${ws.deal_solution}` : null,
        ws?.deal_value ? `Value: ${ws.deal_currency || "SGD"} ${ws.deal_value}` : null,
        ws?.description ? `Description: ${ws.description}` : null,
        `Status: ${ws?.status || "active"}`,
      ].filter(Boolean).join("\n");

      const activitySummary = activities.slice(0, 10).map(a =>
        `- [${a.type}] ${a.subject || a.content || ""}${a.created_at ? ` (${new Date(a.created_at).toLocaleDateString()})` : ""}`
      ).join("\n");

      const prompt = `You are summarizing the current state of a project for a project manager. Be concise — 1-3 sentences max. Focus on what's happening right now: progress, blockers, next steps.

${projectInfo}

Tasks (${tasks.length} total):
${taskSummary || "No tasks yet"}

Recent Activities:
${activitySummary || "No activities yet"}

${workspace?.context?.context_summary ? `Context: ${workspace.context.context_summary}` : ""}

Write a brief current state summary. No bullet points, just a natural sentence or two.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error: ${response.status} ${err}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error("Empty response");

      // Save to project_context
      const { supabase } = await import("../../lib/supabase");
      const { data: existing } = await supabase
        .from("project_context")
        .select("id")
        .eq("project_id", workspaceId)
        .maybeSingle();

      if (existing) {
        await supabase.from("project_context").update({ current_state: text, updated_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await supabase.from("project_context").insert({ project_id: workspaceId, current_state: text });
      }

      refetchWorkspace();
      toast.success("Current state updated");
    } catch (err: any) {
      toast.error(`Failed to describe state: ${err.message}`);
    } finally {
      setIsDescribing(false);
    }
  }, [workspaceId, projectTasks, allCompanies, activities, ws, workspace, refetchWorkspace]);

  const reassignTask = useCallback(async (taskId: string, newProjectId: string) => {
    const { supabase } = await import("../../lib/supabase");
    await supabase.from("tasks").update({ project_id: newProjectId }).eq("id", taskId);
    refetchTasks();
    _onUpdated();
  }, [refetchTasks, _onUpdated]);

  const reassignTasks = useCallback(async (taskIds: string[], newProjectId: string) => {
    const idSet = new Set(taskIds);

    // Optimistically remove moved tasks from the current project's cache
    queryClient.setQueryData(workKeys.tasksByProject(workspaceId), (old: any[] | undefined) =>
      old?.filter(t => !idSet.has(t.id))
    );
    // Optimistically add moved tasks to the target project's cache
    queryClient.setQueryData(workKeys.tasksByProject(newProjectId), (old: any[] | undefined) => {
      if (!old) return old;
      // Grab the full task objects from before the filter (use global cache)
      const allTasks: any[] = queryClient.getQueryData(workKeys.tasks()) ?? [];
      const movedTasks = allTasks.filter(t => idSet.has(t.id)).map(t => ({ ...t, project_id: newProjectId }));
      return [...old, ...movedTasks];
    });
    setSelectedTaskIds(new Set());

    // Persist to Supabase — batch in chunks of 200 to avoid URI-too-long
    const { supabase } = await import("../../lib/supabase");
    const CHUNK = 200;
    for (let i = 0; i < taskIds.length; i += CHUNK) {
      const chunk = taskIds.slice(i, i + CHUNK);
      const { error } = await supabase.from("tasks").update({ project_id: newProjectId }).in("id", chunk);
      if (error) {
        // Rollback: refetch to restore correct state
        queryClient.invalidateQueries({ queryKey: workKeys.tasksByProject(workspaceId) });
        queryClient.invalidateQueries({ queryKey: workKeys.tasksByProject(newProjectId) });
        throw new Error(error.message);
      }
    }

    // Background refetch to sync — don't block on it
    queryClient.invalidateQueries({ queryKey: workKeys.tasksByProject(workspaceId) });
    queryClient.invalidateQueries({ queryKey: workKeys.tasksByProject(newProjectId) });
    queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
    _onUpdated();
  }, [queryClient, workspaceId, _onUpdated]);

  const deleteProject = useCallback(async () => {
    if (!confirm("Delete this project and all its tasks? This cannot be undone.")) return;
    const { supabase } = await import("../../lib/supabase");

    try {
      // 1. Get all task IDs in this project
      const { data: tasks } = await supabase.from("tasks").select("id").eq("project_id", workspaceId);
      const taskIds = (tasks || []).map(t => t.id);

      // 2. Delete task children in bulk
      if (taskIds.length > 0) {
        await supabase.from("task_labels").delete().in("task_id", taskIds);
        await supabase.from("task_activity").delete().in("task_id", taskIds);
        await supabase.from("product_task_links").delete().in("task_id", taskIds);
        await supabase.from("discussions").delete().eq("entity_type", "task").in("entity_id", taskIds);
      }
      // Delete all tasks in bulk
      await supabase.from("tasks").delete().eq("project_id", workspaceId);

      // Statuses are global — no per-project cleanup needed

      // 4. Delete all project children
      await supabase.from("milestones").delete().eq("project_id", workspaceId);
      await supabase.from("project_sessions").delete().eq("project_id", workspaceId);
      await supabase.from("project_artifacts").delete().eq("project_id", workspaceId);
      await supabase.from("project_context").delete().eq("project_id", workspaceId);
      await supabase.from("project_updates").delete().eq("project_id", workspaceId);
      await supabase.from("crm_activities").delete().eq("project_id", workspaceId);
      await supabase.from("initiative_projects").delete().eq("project_id", workspaceId);
      await supabase.from("notion_sync_configs").delete().eq("target_project_id", workspaceId);

      // 5. Delete the project
      const { error } = await supabase.from("projects").delete().eq("id", workspaceId);
      if (error) throw error;

      toast.success("Project deleted");
      _onUpdated();
      onBack();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  }, [workspaceId, onBack, _onUpdated]);

  const completedTasks = projectTasks.filter(t => t.status?.type === "complete").length;

  // Filter + paginate tasks for large projects
  const hasColumnFilters = filterStatus.size > 0 || filterPriority.size > 0 || filterAssignee.size > 0 || filterCompany.size > 0 || filterDueDate.size > 0;
  const filteredTasks = useMemo(() => {
    let tasks = projectTasks;
    if (taskSearch) {
      const q = taskSearch.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q)
        || (t.description || "").toLowerCase().includes(q)
        || (t.company as any)?.name?.toLowerCase().includes(q)
        || (t.company as any)?.display_name?.toLowerCase().includes(q)
      );
    }
    if (filterStatus.size > 0) tasks = tasks.filter(t => filterStatus.has(t.status_id || ""));
    if (filterPriority.size > 0) tasks = tasks.filter(t => filterPriority.has(String(t.priority ?? 0)));
    if (filterAssignee.size > 0) {
      tasks = tasks.filter(t => {
        if (filterAssignee.has("__none__") && (!t.assignees || t.assignees.length === 0)) return true;
        return (t.assignees || []).some(a => filterAssignee.has(a.user?.id || ""));
      });
    }
    if (filterCompany.size > 0) {
      tasks = tasks.filter(t => {
        if (filterCompany.has("__none__") && !t.company_id) return true;
        return filterCompany.has(t.company_id || "");
      });
    }
    if (filterDueDate.size > 0) {
      const now = new Date();
      tasks = tasks.filter(t => {
        if (filterDueDate.has("no_date") && !t.due_date) return true;
        if (filterDueDate.has("has_date") && t.due_date) return true;
        if (filterDueDate.has("overdue") && t.due_date && new Date(t.due_date) < now && t.status?.type !== "complete") return true;
        if (filterDueDate.has("this_week") && t.due_date) {
          const d = new Date(t.due_date);
          const end = new Date(now); end.setDate(end.getDate() + 7);
          if (d >= now && d <= end) return true;
        }
        return false;
      });
    }
    return tasks;
  }, [projectTasks, taskSearch, filterStatus, filterPriority, filterAssignee, filterCompany, filterDueDate]);
  const hiddenTaskCount = useMemo(() => projectTasks.filter(t => hiddenStatuses.has(t.status?.name || "")).length, [projectTasks, hiddenStatuses]);
  const displayFilteredTasks = useMemo(() =>
    hiddenStatuses.size === 0 ? filteredTasks : filteredTasks.filter(t => !hiddenStatuses.has(t.status?.name || "")),
  [filteredTasks, hiddenStatuses]);
  const isLargeProject = displayFilteredTasks.length > 100;
  const visibleTasks = isLargeProject ? displayFilteredTasks.slice(0, taskPageSize) : displayFilteredTasks;
  const hasMoreTasks = isLargeProject && displayFilteredTasks.length > taskPageSize;

  const sortedStatusGroups = useMemo(() => {
    const sorted = [...visibleTasks].sort((a, b) => {
      if (sortColumn) {
        const dir = sortDir === "asc" ? 1 : -1;
        let cmp = 0;
        switch (sortColumn) {
          case "id": cmp = (a.task_number ?? 0) - (b.task_number ?? 0); break;
          case "title": cmp = (a.title || "").localeCompare(b.title || ""); break;
          case "task_type": cmp = (a.task_type || "").localeCompare(b.task_type || ""); break;
          case "company": cmp = ((a.company as any)?.display_name || (a.company as any)?.name || "").localeCompare((b.company as any)?.display_name || (b.company as any)?.name || ""); break;
          case "contact": cmp = ((a.contact as any)?.name || "").localeCompare((b.contact as any)?.name || ""); break;
          case "priority": cmp = (a.priority ?? 99) - (b.priority ?? 99); break;
          case "assignee": cmp = (a.assignees?.[0]?.user?.name || "").localeCompare(b.assignees?.[0]?.user?.name || ""); break;
          case "due_date": cmp = (a.due_date || "9999").localeCompare(b.due_date || "9999"); break;
          case "created": cmp = (a.created_at || "").localeCompare(b.created_at || ""); break;
          case "updated": cmp = (a.updated_at || "").localeCompare(b.updated_at || ""); break;
          case "days_in_stage": {
            const daysA = a.task_type_changed_at ? Math.floor((Date.now() - new Date(a.task_type_changed_at).getTime()) / 86400000) : -1;
            const daysB = b.task_type_changed_at ? Math.floor((Date.now() - new Date(b.task_type_changed_at).getTime()) / 86400000) : -1;
            cmp = daysA - daysB; break;
          }
        }
        if (cmp !== 0) return cmp * dir;
      }
      const order: Record<string, number> = { in_progress: 0, todo: 1, complete: 2 };
      const statusDiff = (order[a.status?.type || ""] ?? 5) - (order[b.status?.type || ""] ?? 5);
      if (statusDiff !== 0) return statusDiff;
      return (a.task_number ?? 0) - (b.task_number ?? 0);
    });
    const groups = new Map<string, { label: string; color: string; statusType: string; tasks: typeof sorted }>();
    for (const t of sorted) {
      const key = t.status?.id || "none";
      const group = groups.get(key) || { label: t.status?.name || "No Status", color: t.status?.color || "#6B7280", statusType: t.status?.type || "", tasks: [] };
      group.tasks.push(t);
      groups.set(key, group);
    }
    const STATUS_SORT: Record<string, number> = {
      "Ready to Deploy": 0, "Blocked": 1, "Waiting": 2, "Ready for Test": 3,
      "In Review": 4, "In Progress": 5, "Up Next": 6, "On Hold": 7, "New": 8,
      "Backlog": 9, "Done": 10, "Won't Do": 11, "Monitor": 12, "Archived": 13,
    };
    return [...groups.entries()]
      .filter(([, g]) => !hiddenStatuses.has(g.label))
      .sort((a, b) => (STATUS_SORT[a[1].label] ?? 99) - (STATUS_SORT[b[1].label] ?? 99));
  }, [visibleTasks, sortColumn, sortDir, hiddenStatuses]);

  // Derive filter options from all project tasks
  const priorityFilterOptions = useMemo(() => {
    const counts = new Map<number, number>();
    for (const t of projectTasks) { const p = t.priority ?? 0; counts.set(p, (counts.get(p) || 0) + 1); }
    return [1, 2, 3, 4, 0].filter(p => counts.has(p)).map(p => ({ value: String(p), label: PriorityLabels[p as Priority], count: counts.get(p)! }));
  }, [projectTasks]);

  const assigneeFilterOptions = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const t of projectTasks) {
      if (!t.assignees || t.assignees.length === 0) {
        const e = counts.get("__none__") || { name: "Unassigned", count: 0 }; e.count++; counts.set("__none__", e);
      } else {
        for (const a of t.assignees) {
          const id = a.user?.id || "__none__";
          const name = a.user?.name || "Unassigned";
          const e = counts.get(id) || { name, count: 0 }; e.count++; counts.set(id, e);
        }
      }
    }
    return Array.from(counts.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, v]) => ({ value: id, label: v.name, count: v.count }));
  }, [projectTasks]);

  const companyFilterOptions = useMemo(() => {
    const taskCounts = new Map<string, number>();
    for (const t of projectTasks) {
      if (t.company_id) taskCounts.set(t.company_id, (taskCounts.get(t.company_id) || 0) + 1);
    }
    return allCompanies
      .filter(c => taskCounts.has(c.id))
      .map(c => ({ value: c.id, label: (c as any).display_name || c.name, count: taskCounts.get(c.id)! }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [projectTasks, allCompanies]);

  const statusFilterOptions = useMemo(() => {
    const counts = new Map<string, { name: string; sortOrder: number; count: number }>();
    for (const t of projectTasks) {
      if (!t.status_id || !t.status) continue;
      const e = counts.get(t.status_id) || { name: t.status.name, sortOrder: t.status.sort_order ?? 0, count: 0 };
      e.count++;
      counts.set(t.status_id, e);
    }
    return Array.from(counts.entries()).sort((a, b) => a[1].sortOrder - b[1].sortOrder).map(([id, v]) => ({ value: id, label: v.name, count: v.count }));
  }, [projectTasks]);

  // Sort handler
  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };
  const SortIndicator = ({ col }: { col: string }) => sortColumn === col ? <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span> : null;

  // Config-driven project fields — subscribe to store so changes in settings trigger re-render
  const enabledProjectFields = useProjectFieldsStore((s) => s.getEnabledFields((workspace as any)?.project_type || "work"));
  const dealFieldKeys = new Set(["deal_stage", "deal_value", "deal_currency", "deal_solution", "deal_expected_close", "deal_actual_close", "deal_lost_reason", "deal_won_notes", "deal_notes"]);
  const projectType = (workspace as any)?.project_type || "work";
  const hardcodedFieldKeys = new Set(["lead"]);
  const configuredFields = getFieldDefsForType(projectType)
    .filter(f => enabledProjectFields.includes(f.key))
    .filter(f => !hardcodedFieldKeys.has(f.key))
    .filter(f => !(projectType !== "deal" && dealFieldKeys.has(f.key)));

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-zinc-400">Loading...</div>;
  }

  if (!workspace) {
    return <div className="h-full flex items-center justify-center text-zinc-400">Project not found</div>;
  }

  const statusColor = WORKSPACE_STATUS_COLORS[workspace.status] || "#6B7280";
  const sessions = workspace.sessions ?? [];
  const artifacts = workspace.artifacts ?? [];
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

  const initiativeName = projectInitiativeMap.get(workspaceId);
  const identPrefix = (ws as any).identifier_prefix;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header — compact identifier row, matches TaskDetailPanel style */}
      <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {/* Status circle (click to change) */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              className="w-5 h-5 rounded-full border-2 hover:ring-2 hover:ring-offset-1 transition-all"
              style={{ borderColor: statusColor, ['--tw-ring-color' as string]: statusColor }}
              title={WORKSPACE_STATUS_LABELS[workspace.status] || workspace.status}
            >
              <span className="block w-full h-full rounded-full" style={{ backgroundColor: `${statusColor}30` }} />
            </button>
            {showStatusMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[120px]">
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
                          isActive ? "bg-zinc-50 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                        )}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                        <span className="font-medium" style={{ color: isActive ? c : undefined }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Identifier prefix (e.g. CKP) */}
          {identPrefix && (
            <span className="text-sm text-zinc-500 font-mono">{identPrefix}</span>
          )}

          {/* Short id — click to copy */}
          <button
            onClick={() => { navigator.clipboard.writeText(workspaceId); toast.success("Project ID copied"); }}
            className="text-[10px] text-zinc-300 dark:text-zinc-600 font-mono cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
            title={workspaceId}
          >
            {workspaceId.slice(0, 8)}
          </button>

          {/* Project-type pill (DEAL / PROJECT) */}
          {projectType && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex-shrink-0",
              projectType === "deal"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
            )}>
              {projectType}
            </span>
          )}

          {/* Initiative / pipeline pill */}
          {initiativeName && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {initiativeName}
            </span>
          )}

          {/* Breadcrumb chevron */}
          {initiativeName && (
            <span className="text-zinc-300 dark:text-zinc-600 text-xs">›</span>
          )}

          {/* Project name as the trailing breadcrumb pill */}
          <span
            className="px-2 py-0.5 rounded text-xs font-medium truncate max-w-[320px]"
            style={{
              backgroundColor: `${workspace.color || "#6B7280"}20`,
              color: workspace.color || "#6B7280",
            }}
            title={workspace.title}
          >
            {workspace.title}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400 flex-shrink-0">
          <span title={`Created: ${formatDateTime(workspace.created_at)}\nUpdated: ${formatDateTime(workspace.updated_at)}`}>
            {formatDateTime(workspace.updated_at)}
          </span>
          {onExpandProject && (
            <IconButton
              icon={Maximize2}
              size={16}
              label="Open in project view"
              onClick={() => onExpandProject(workspaceId)}
            />
          )}
          <IconButton icon={X} size={18} label="Close" onClick={onBack} />
        </div>
      </div>

      {/* Tab bar — replaces sidebar navigation */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-x-auto">
        {([
          { key: null, label: "Overview", icon: null },
          { key: "discussion", label: "Discussion", icon: MessageSquare, badge: discussionCount },
          { key: "emails", label: "Emails", icon: Mail },
          { key: "events", label: "Events", icon: Calendar },
        ] as { key: string | null; label: string; icon: LucideIcon | null; badge?: number | null }[]).map((tab) => {
          const isActive = tab.key === null ? !selection || selection.type === "file" || selection.type === "contact" : selection?.type === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key ?? "overview"}
              onClick={() => tab.key === null ? setSelection(null) : setSelection({ type: tab.key } as any)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              )}
            >
              {TabIcon && <TabIcon size={13} />}
              {tab.label}
              {(tab.badge ?? 0) > 0 && (
                <span className="text-[10px] font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body — single panel, no sidebar */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
          {/* Close bar — shown when viewing a file/session/entity */}
          {selection && !["discussion", "emails", "events"].includes(selection.type) && (
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50">
              <button
                onClick={() => setSelection(null)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft size={12} />
                Overview
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
          ) : selection?.type === "discussion" ? (
            <DiscussionPanel entityType="project" entityId={workspaceId} onClose={() => setSelection(null)} />
          ) : selection?.type === "emails" ? (
            <EmailsPanel entityType="project" entityId={workspaceId} />
          ) : selection?.type === "events" ? (
            <EventsPanel entityType="project" entityId={workspaceId} />
          ) : (
            <div className="h-full overflow-y-auto px-4 py-5">
              {/* Title + description — matches TaskDetailPanel's content layout */}
              <div className="mb-6">
                <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  <EditableField value={workspace.title} onSave={(v) => updateProjectField("name", v)} />
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  <EditableField value={workspace.description} onSave={(v) => updateProjectField("description", v)} />
                </p>
              </div>

              {/* Artifacts + Chat to Update — side by side at top */}
              <div className="mb-6">
                <button onClick={() => setCollapsedSections(s => ({ ...s, sidebar: !s.sidebar }))} className="flex items-center gap-1.5 mb-3 group">
                  {collapsedSections.sidebar ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Quick Access</h3>
                </button>
              {!collapsedSections.sidebar && (
              <div className="grid grid-cols-2 gap-4">
                {/* Artifacts */}
                <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Puzzle size={12} />
                      Artifacts ({artifacts.length})
                    </h3>
                    <button
                      onClick={() => setShowPicker(true)}
                      className="p-1 rounded hover:bg-teal-50 dark:hover:bg-teal-900/30 text-zinc-400 hover:text-teal-500 transition-colors"
                      title="Add artifact"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {artifacts.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No artifacts linked yet</p>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {Object.entries(artifactsByType).map(([type, typeArtifacts]) => (
                        <div key={type}>
                          <h4 className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-0.5 flex items-center gap-1">
                            {(() => { const TIcon = ARTIFACT_ICONS[type] || FileText; return <TIcon size={10} />; })()}
                            {ARTIFACT_TYPE_LABELS[type] || type}
                            <span className="text-zinc-300 dark:text-zinc-600">({typeArtifacts.length})</span>
                          </h4>
                          <div className="space-y-0.5">
                            {(() => {
                              const prefixMap = new Map<string, string>();
                              const labelGroups = new Map<string, typeof typeArtifacts>();
                              for (const a of typeArtifacts) {
                                const group = labelGroups.get(a.label) || [];
                                group.push(a);
                                labelGroups.set(a.label, group);
                              }
                              for (const [, group] of labelGroups) {
                                if (group.length <= 1) continue;
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
                                  <TaskArtifactItem key={artifact.id} artifact={artifact} workspaceId={workspaceId} isSelected={taskDetailId === artifact.reference} onSelect={() => setTaskDetailId(artifact.reference)} />
                                ) : artifact.type === "crm_deal" ? (
                                  <CrmDealArtifactItem key={artifact.id} artifact={artifact} workspaceId={workspaceId} isSelected={false} onSelect={() => setSelection({ type: "crm_deal", id: artifact.reference })} />
                                ) : artifact.type === "crm_company" ? (
                                  <CrmCompanyArtifactItem key={artifact.id} artifact={artifact} workspaceId={workspaceId} isSelected={false} onSelect={() => setSelection({ type: "crm_company", id: artifact.reference })} />
                                ) : (
                                  <ArtifactTreeItem key={artifact.id} artifact={artifact} workspaceId={workspaceId} basePath={basePath} allRepoPaths={repositories.map(r => r.path)} selectedFile={selectedFile} onSelectFile={(path) => setSelection({ type: "file", path })} pathPrefix={prefixMap.get(artifact.id)} />
                                )
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chat to Update */}
                <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Brain size={12} className="text-purple-500" />
                      Chat{botChatSessions.length > 0 ? ` (${botChatSessions.length})` : ""}
                    </h3>
                    <button
                      onClick={() => {
                        const newId = `${botChatPrefix}:${Date.now()}`;
                        setProjectChatPopupSession(newId);
                      }}
                      className="p-1 rounded hover:bg-purple-50 dark:hover:bg-purple-950/30 text-zinc-400 hover:text-purple-500 transition-colors"
                      title="New chat"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                    {botChatSessions.length === 0 ? (
                      <button
                        onClick={() => setProjectChatPopupSession(`${botChatPrefix}:${Date.now()}`)}
                        className="text-xs text-zinc-400 italic hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
                      >
                        + Start a chat to update this project
                      </button>
                    ) : (
                      botChatSessions.map((s) => (
                        <button
                          key={s.entity_id}
                          onClick={() => setProjectChatPopupSession(s.entity_id)}
                          className="w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                          title={s.title ?? s.sample_body}
                        >
                          <Brain size={10} className="text-purple-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                              {formatBotChatLabel(s)}
                            </div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-600">
                              {s.message_count} msg · {formatRelativeTime(s.last_activity_at)}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
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
                    <EditableField value={ws.raw_name || workspace.title} onSave={(v) => updateProjectField("name", v)} />
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Prefix</span>
                    <EditableField value={ws.identifier_prefix || ""} onSave={(v) => updateProjectField("identifier_prefix", v?.toUpperCase().slice(0, 6) || null)} />
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
                      displayValue={taskUsers.find(u => u.id === ws.lead_id)?.name || ws.lead || undefined}
                      onSave={(v) => {
                        const user = taskUsers.find(u => u.id === v);
                        import("../../lib/supabase").then(({ supabase }) => {
                          supabase.from("projects").update({
                            lead_id: v || null,
                            lead: user?.name || null,
                            updated_at: new Date().toISOString(),
                          }).eq("id", workspaceId).then(({ error }) => {
                            if (error) { toast.error(`Failed to update owner: ${error.message}`); }
                            else { toast.success("Saved"); refetchWorkspace(); }
                          });
                        });
                      }}
                    />
                  </div>

                  {/* Created / Updated */}
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Created</span>
                    <span className="text-xs text-zinc-500 py-1">{formatDateTime(workspace.created_at)}</span>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Updated</span>
                    <span className="text-xs text-zinc-500 py-1">{formatDateTime(workspace.updated_at)}</span>
                  </div>

                  {/* Company */}
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Company</span>
                    <EditableField
                      value={ws.company_id || ""}
                      type="select"
                      options={[{ value: "", label: "—" }, ...allCompanies.map(c => ({ value: c.id, label: c.display_name || c.name }))]}
                      displayValue={ws.company?.display_name || ws.company?.name || undefined}
                      onSave={(v) => updateProjectField("company_id", v || null)}
                    />
                  </div>

                  {/* Initiative */}
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Initiative</span>
                    <EditableField
                      value={allInitiativeLinks.find(l => l.project_id === workspaceId)?.initiative_id || ""}
                      type="select"
                      options={[{ value: "", label: "—" }, ...allInitiatives.map(i => ({ value: i.id, label: i.name }))]}
                      displayValue={projectInitiativeMap.get(workspaceId) || undefined}
                      onSave={async (v) => {
                        const { supabase } = await import("../../lib/supabase");
                        await supabase.from("initiative_projects").delete().eq("project_id", workspaceId);
                        if (v) {
                          await supabase.from("initiative_projects").insert({ initiative_id: v, project_id: workspaceId, sort_order: 999 });
                        }
                        refetchWorkspace();
                      }}
                    />
                  </div>
                  {/* Referral (for deals with company) */}
                  {isDeal && ws.company && (
                    <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                      <span className="text-zinc-400 py-1">Referral</span>
                      <EditableField
                        value={ws.company?.referred_by || ""}
                        type="select"
                        options={[{ value: "", label: "—" }, ...referralContactNames.map(n => ({ value: n, label: n }))]}
                        displayValue={ws.company?.referred_by || undefined}
                        onSave={(v) => {
                          import("../../lib/supabase").then(({ supabase }) => {
                            supabase.from("crm_companies").update({ referred_by: v || null }).eq("id", ws.company_id).then(({ error }) => {
                              if (error) toast.error(`Failed to update referral: ${error.message}`);
                              else { toast.success("Saved"); refetchWorkspace(); }
                            });
                          });
                        }}
                      />
                    </div>
                  )}

                  {/* Folder Path — where this project's files/task attachments are stored */}
                  <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
                    <span className="text-zinc-400 py-1">Folder Path</span>
                    <FolderPickerField
                      value={(ws as any).folder_path || ""}
                      placeholder="Click to browse folders"
                      onSave={(v) => updateProjectField("folder_path", v || null)}
                    />
                  </div>

                  {/* Configurable fields (driven by Settings > Project Fields) */}
                  {configuredFields.length > 0 && (
                    <>
                      <div className="border-t border-zinc-100 dark:border-zinc-800 my-2" />
                      {configuredFields.map((field) => {
                        let displayValue: string | undefined;
                        if (field.type === "multiselect" && field.options) {
                          // Handled inside EditableField
                        } else if (field.options) {
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

              {/* Contacts (deal projects only) */}
              {isDeal && companyId && contacts.length > 0 && (
                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <button onClick={() => setContactsExpanded(!contactsExpanded)} className="flex items-center gap-1.5 mb-3 group">
                    {contactsExpanded ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Contacts ({contacts.length})
                    </h3>
                  </button>
                  {contactsExpanded && (
                    <div className="space-y-0.5 pl-5">
                      {contacts.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => setSelection({ type: "contact", id: contact.id })}
                          className={cn(
                            "block w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                            false
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

              {/* Tasks table — grouped by milestone when milestones exist */}
              <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setCollapsedSections(s => ({ ...s, tasks: !s.tasks }))} className="flex items-center gap-1.5 group">
                    {collapsedSections.tasks ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Tasks ({projectTasks.length - hiddenTaskCount})
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
                      <div className="relative">
                        <button
                          onClick={() => setShowStatusPicker(v => !v)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                            hiddenStatuses.size > 0
                              ? "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              : "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                          }`}
                        >
                          {hiddenStatuses.size > 0 ? `${hiddenStatuses.size} hidden` : "All visible"}
                        </button>
                        {showStatusPicker && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowStatusPicker(false)} />
                            <div className="absolute right-0 top-full mt-1 z-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[180px]">
                              {taskStatuses.map((s) => {
                                const isHidden = hiddenStatuses.has(s.name);
                                const count = projectTasks.filter(t => t.status?.id === s.id).length;
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => setHiddenStatuses(prev => {
                                      const next = new Set(prev);
                                      next.has(s.name) ? next.delete(s.name) : next.add(s.name);
                                      return next;
                                    })}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                                  >
                                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isHidden ? "border-zinc-300 dark:border-zinc-600" : "border-teal-500 bg-teal-500"}`}>
                                      {!isHidden && <Check size={10} className="text-white" />}
                                    </span>
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#6B7280" }} />
                                    <span className={isHidden ? "text-zinc-400" : "text-zinc-700 dark:text-zinc-300"}>{s.name}</span>
                                    <span className="ml-auto text-[10px] text-zinc-400">{count}</span>
                                  </button>
                                );
                              })}
                              <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 px-3 py-1 flex gap-2">
                                <button onClick={() => setHiddenStatuses(new Set())} className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium">Show all</button>
                                <button onClick={() => setHiddenStatuses(new Set(DEFAULT_HIDDEN_STATUSES))} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium">Reset</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {!collapsedSections.tasks && projectTasks.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <input
                        type="text"
                        value={taskSearch}
                        onChange={(e) => { setTaskSearch(e.target.value); setTaskPageSize(TASK_PAGE_INCREMENT); }}
                        placeholder="Search tasks..."
                        className="text-xs border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 outline-none max-w-[200px] focus:ring-2 focus:ring-teal-500/30 transition-colors"
                      />
                      <SearchableFilter label="Status" selected={filterStatus} options={statusFilterOptions} onToggle={(v) => { setFilterStatus(prev => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; }); setTaskPageSize(TASK_PAGE_INCREMENT); }} onClear={() => setFilterStatus(new Set())} />
                      <SearchableFilter label="Priority" selected={filterPriority} options={priorityFilterOptions} onToggle={(v) => { setFilterPriority(prev => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; }); setTaskPageSize(TASK_PAGE_INCREMENT); }} onClear={() => setFilterPriority(new Set())} />
                      <SearchableFilter label="Assignee" selected={filterAssignee} options={assigneeFilterOptions} onToggle={(v) => { setFilterAssignee(prev => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; }); setTaskPageSize(TASK_PAGE_INCREMENT); }} onClear={() => setFilterAssignee(new Set())} />
                      <SearchableFilter label="Company" selected={filterCompany} options={companyFilterOptions} onToggle={(v) => { setFilterCompany(prev => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; }); setTaskPageSize(TASK_PAGE_INCREMENT); }} onClear={() => setFilterCompany(new Set())} />
                      <SearchableFilter label="Due Date" selected={filterDueDate} options={[
                        { value: "overdue", label: "Overdue" },
                        { value: "this_week", label: "This week" },
                        { value: "has_date", label: "Has date" },
                        { value: "no_date", label: "No date" },
                      ]} onToggle={(v) => { setFilterDueDate(prev => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; }); setTaskPageSize(TASK_PAGE_INCREMENT); }} onClear={() => setFilterDueDate(new Set())} />
                      {(taskSearch || hasColumnFilters) && (
                        <button
                          onClick={() => { setTaskSearch(""); setFilterStatus(new Set()); setFilterPriority(new Set()); setFilterAssignee(new Set()); setFilterCompany(new Set()); setFilterDueDate(new Set()); }}
                          className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5"
                        >
                          <X size={10} /> Clear
                        </button>
                      )}
                      {(taskSearch || hasColumnFilters) && (
                        <span className="text-[10px] text-zinc-400">{displayFilteredTasks.length}/{projectTasks.length - hiddenTaskCount}</span>
                      )}
                    </div>
                  )}
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
                      onUpdateTask={(id, updates, assignee_ids) => updateTaskMutation.mutate({ id, updates, assignee_ids })}
                      onDeleteMilestone={(id) => deleteMilestoneMutation.mutate(id)}
                    />
                  ) : (
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                          <th className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.size > 0 && visibleTasks.every(t => selectedTaskIds.has(t.id))}
                              ref={(el) => { if (el) el.indeterminate = selectedTaskIds.size > 0 && !visibleTasks.every(t => selectedTaskIds.has(t.id)); }}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTaskIds(new Set(visibleTasks.map(t => t.id)));
                                } else {
                                  setSelectedTaskIds(new Set());
                                }
                              }}
                              className="w-3.5 h-3.5 rounded border-zinc-200 dark:border-zinc-800 text-teal-600 cursor-pointer"
                            />
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-zinc-400 w-8"></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-16 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("id")}>ID<SortIndicator col="id" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("title")}>Title<SortIndicator col="title" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-20 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("priority")}>Priority<SortIndicator col="priority" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-20 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("assignee")}>Assignee<SortIndicator col="assignee" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-20 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("due_date")}>Due Date<SortIndicator col="due_date" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-20 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("company")}>Company<SortIndicator col="company" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-16 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("created")}>Created<SortIndicator col="created" /></th>
                          <th className="text-left px-2 py-2 font-medium text-zinc-400 w-16 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("updated")}>Updated<SortIndicator col="updated" /></th>
                          {enabledTaskFields.includes("task_type") && <th className="text-left px-2 py-2 font-medium text-zinc-400 w-20 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("task_type")}>Type<SortIndicator col="task_type" /></th>}
                          {enabledTaskFields.includes("contact") && <th className="text-left px-2 py-2 font-medium text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("contact")}>Contact<SortIndicator col="contact" /></th>}
                          {enabledTaskFields.includes("referral") && <th className="text-left px-2 py-2 font-medium text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("referral")}>Referral<SortIndicator col="referral" /></th>}
                          {enabledTaskFields.includes("days_in_stage") && <th className="text-left px-2 py-2 font-medium text-zinc-400 w-16 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none" onClick={() => handleSort("days_in_stage")}>Days<SortIndicator col="days_in_stage" /></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStatusGroups.map(([groupKey, group]) => {
                          const isGroupCollapsed = statusGroupOverrides.get(groupKey) ?? false;
                          const colCount = 10 + (enabledTaskFields.includes("task_type") ? 1 : 0) + (enabledTaskFields.includes("contact") ? 1 : 0) + (enabledTaskFields.includes("referral") ? 1 : 0) + (enabledTaskFields.includes("days_in_stage") ? 1 : 0);
                          return (<Fragment key={groupKey}>
                          <tr
                            onClick={() => setStatusGroupOverrides(prev => {
                              const next = new Map(prev);
                              next.set(groupKey, !isGroupCollapsed);
                              return next;
                            })}
                            className="bg-zinc-50/90 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90 transition-colors"
                          >
                            <td colSpan={colCount} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {isGroupCollapsed ? <ChevronRight size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                                {group.statusType === "complete" ? (
                                  <CheckCircle2 size={13} style={{ color: group.color }} />
                                ) : group.statusType === "in_progress" ? (
                                  <svg width="13" height="13" viewBox="0 0 16 16">
                                    <circle cx="8" cy="8" r="6.5" fill="none" stroke={group.color} strokeWidth="1.5" />
                                    <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5" fill={group.color} />
                                  </svg>
                                ) : (
                                  <Circle size={13} style={{ color: group.color }} />
                                )}
                                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{group.label}</span>
                                <span className="text-[10px] text-zinc-400 tabular-nums">{group.tasks.length}</span>
                              </div>
                            </td>
                          </tr>
                          {!isGroupCollapsed && group.tasks.map((task) => {
                            const identifier = getTaskIdentifier(task);

                            return (
                              <tr
                                key={task.id}
                                onClick={() => setTaskDetailId(task.id)}
                                onContextMenu={(e) => { e.preventDefault(); setTaskContextMenu({ taskId: task.id, x: e.clientX, y: e.clientY }); setTaskProjectSearch(""); }}
                                className={cn(
                                  "border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors group",
                                  selectedTaskIds.has(task.id)
                                    ? "bg-teal-50 dark:bg-teal-950/20"
                                    : taskDetailId === task.id
                                      ? "bg-teal-50/50 dark:bg-teal-950/20"
                                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                                )}
                              >
                                {/* Checkbox */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedTaskIds.has(task.id)}
                                    onChange={(e) => {
                                      setSelectedTaskIds(prev => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(task.id);
                                        else next.delete(task.id);
                                        return next;
                                      });
                                    }}
                                    className="w-3.5 h-3.5 rounded border-zinc-200 dark:border-zinc-800 text-teal-600 cursor-pointer"
                                  />
                                </td>
                                {/* Status */}
                                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <SearchableCell
                                    value={task.status_id || null}
                                    displayValue={task.status?.name}
                                    placeholder="No status"
                                    options={taskStatuses.map(s => ({ value: s.id, label: s.name }))}
                                    onChange={(val) => { if (val) updateTaskMutation.mutate({ id: task.id, updates: { status_id: val } }); }}
                                  />
                                </td>
                                {/* ID */}
                                <td className="px-2 py-1.5 font-mono text-[11px] whitespace-nowrap">
                                  <span className="text-zinc-400">{identifier}</span>
                                  {task.notion_page_id && (() => {
                                    const notionUrl = `https://www.notion.so/thinkval/${task.notion_page_id!.replace(/-/g, "")}`;
                                    return (
                                      <span className="ml-1.5 inline-flex items-center gap-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(notionUrl);
                                            toast.success("Notion URL copied");
                                          }}
                                          className="text-[10px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 dark:hover:text-teal-400 transition-colors"
                                          title="Copy Notion URL"
                                        >
                                          Copy
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openUrl(notionUrl);
                                          }}
                                          className="text-[10px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 dark:hover:text-blue-400 transition-colors"
                                          title="Open in Notion"
                                        >
                                          Open
                                        </button>
                                      </span>
                                    );
                                  })()}
                                </td>
                                {/* Title */}
                                <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                                  <span className="flex items-center gap-1.5">
                                    {task.notion_page_id && (
                                      <span
                                        className={`flex-shrink-0 ${(task as any).source === "notion" ? "text-zinc-800 dark:text-zinc-200" : "text-teal-500 dark:text-teal-400"}`}
                                        title={(task as any).source === "notion" ? "From Notion" : "Synced to Notion"}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 100 100" fill="currentColor"><path d="M6.6 12.6c5.1 4.1 7 3.8 16.5 3.1l59.7-3.6c2 0 .3-2-.3-2.2L73.2 3.5c-2.7-2.2-6.5-4.6-13.5-4L8 3.2C4 3.5 3.1 5.6 4.8 7.3zm17.1 14.3v62.7c0 3.4 1.7 4.7 5.5 4.5l65.7-3.8c3.8-.2 4.3-2.6 4.3-5.4V22.6c0-2.8-1.1-4.3-3.5-4l-68.6 4c-2.7.2-3.4 1.5-3.4 4.3zM82 29c.4 1.8 0 3.5-1.8 3.7l-3.2.6v46.3c-2.8 1.5-5.3 2.3-7.5 2.3-3.4 0-4.3-1.1-6.8-4.1L42.3 46.2v30.7l6.6 1.5s0 3.5-4.8 3.5l-13.3.8c-.4-.8 0-2.7 1.3-3l3.5-1V38.3l-4.8-.4c-.4-1.8.6-4.4 3.5-4.6l14.3-.9 21.2 32.5V37l-5.5-.6c-.4-2.2 1.2-3.7 3.2-3.9z"/></svg>
                                      </span>
                                    )}
                                    {task.title}
                                  </span>
                                </td>
                                {/* Priority */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <SearchableCell
                                    value={String(task.priority ?? 0)}
                                    displayValue={PriorityLabels[(task.priority ?? 0) as Priority]}
                                    placeholder="None"
                                    options={Object.entries(PriorityLabels).map(([v, l]) => ({ value: v, label: l }))}
                                    onChange={(val) => updateTaskMutation.mutate({ id: task.id, updates: { priority: val ? parseInt(val) : 0 } })}
                                    renderTrigger={(displayVal, onClick) => (
                                      <button onClick={onClick} className="cursor-pointer hover:scale-125 transition-transform" title={displayVal || "No priority"}>
                                        <PriorityBars priority={task.priority || 0} size={11} />
                                      </button>
                                    )}
                                  />
                                </td>
                                {/* Assignee */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <SearchableCell
                                    value={task.assignees?.[0]?.user?.id || null}
                                    displayValue={task.assignees?.[0]?.user?.name}
                                    placeholder="—"
                                    options={taskUsers.map(u => ({ value: u.id, label: u.name }))}
                                    onChange={(val) => updateTaskMutation.mutate({ id: task.id, updates: {}, assignee_ids: val ? [val] : [] })}
                                    renderTrigger={(displayVal, onClick) => (
                                      <button onClick={onClick} className="flex items-center cursor-pointer hover:opacity-80 transition-all" title={displayVal || "Click to assign"}>
                                        {(task.assignees?.length || 0) > 0 ? task.assignees!.slice(0, 3).map((a, i) => (
                                          <div key={a.user?.id || i} className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-white dark:ring-zinc-950" style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i }}>
                                            {a.user?.name ? initials(a.user.name) : "?"}
                                          </div>
                                        )) : (
                                          <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-600 dark:text-zinc-400">?</div>
                                        )}
                                      </button>
                                    )}
                                  />
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
                                {/* Company */}
                                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <SearchableCell
                                    value={task.company_id || null}
                                    displayValue={(task.company as any)?.display_name || (task.company as any)?.name}
                                    options={allCompanies.map(c => ({ value: c.id, label: (c as any).display_name || c.name }))}
                                    onChange={(val) => updateTaskMutation.mutate({ id: task.id, updates: { company_id: val, contact_id: null } })}
                                  />
                                </td>
                                {/* Created */}
                                <td className="px-2 py-1.5">
                                  <span className="text-[10px] text-zinc-400" title={task.created_at ? new Date(task.created_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" }) : ""}>
                                    {task.created_at ? new Date(task.created_at).toLocaleDateString("en-SG", { day: "2-digit", month: "short" }) : ""}
                                  </span>
                                </td>
                                {/* Updated */}
                                <td className="px-2 py-1.5">
                                  <span className="text-[10px] text-zinc-400" title={task.updated_at ? new Date(task.updated_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" }) : ""}>
                                    {task.updated_at ? new Date(task.updated_at).toLocaleDateString("en-SG", { day: "2-digit", month: "short" }) : ""}
                                  </span>
                                </td>
                                {/* Type */}
                                {enabledTaskFields.includes("task_type") && <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  {task.task_type === "converted" ? (() => {
                                    const match = task.description?.match(/→ Converted to deal project: ([a-f0-9-]+)/);
                                    const dealProjectId = match?.[1];
                                    const dealProject = dealProjectId ? allProjectsList.find(p => p.id === dealProjectId) : null;
                                    return (
                                      <button
                                        onClick={() => {
                                          if (dealProjectId && onNavigateToProject) {
                                            onNavigateToProject(dealProjectId);
                                          }
                                        }}
                                        className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center gap-1 hover:bg-emerald-200 dark:hover:bg-emerald-800/40 transition-colors"
                                        title={dealProject ? `Deal: ${dealProject.name}` : "Converted to deal"}
                                      >
                                        <ArrowUpRight size={9} />
                                        Deal
                                      </button>
                                    );
                                  })() : (
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
                                  )}
                                </td>}
                                {/* Contact */}
                                {enabledTaskFields.includes("contact") && <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={task.contact_id || ""}
                                    onChange={(e) => {
                                      const val = e.target.value || null;
                                      updateTaskMutation.mutate(
                                        { id: task.id, updates: { contact_id: val } },
                                        { onError: (err) => console.error("Contact update failed:", err) }
                                      );
                                    }}
                                    className="appearance-none bg-transparent text-[11px] cursor-pointer border-0 outline-none text-zinc-500"
                                  >
                                    <option value="">—</option>
                                    {allContacts
                                      .filter((c) => !task.company_id || c.company_id === task.company_id)
                                      .map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                  </select>
                                </td>}
                                {/* Referral */}
                                {enabledTaskFields.includes("referral") && <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={(task as any).company?.referred_by || ""}
                                    onChange={(e) => {
                                      const companyId = task.company_id;
                                      if (!companyId) return;
                                      const val = e.target.value || null;
                                      import("../../lib/supabase").then(({ supabase }) => {
                                        supabase.from("crm_companies").update({ referred_by: val }).eq("id", companyId).then(({ error }) => {
                                          if (error) toast.error(`Failed to update referral: ${error.message}`);
                                          else { toast.success("Saved"); refetchWorkspace(); }
                                        });
                                      });
                                    }}
                                    className="appearance-none bg-transparent text-[11px] cursor-pointer border-0 outline-none text-zinc-500"
                                  >
                                    <option value="">—</option>
                                    {referralContactNames.map((name) => (
                                      <option key={name} value={name}>{name}</option>
                                    ))}
                                  </select>
                                </td>}
                                {/* Days in Stage */}
                                {enabledTaskFields.includes("days_in_stage") && <td className="px-2 py-1.5">
                                  {task.task_type_changed_at && task.task_type && task.task_type !== "general" && (() => {
                                    const days = Math.floor((Date.now() - new Date(task.task_type_changed_at!).getTime()) / (1000 * 60 * 60 * 24));
                                    const color = days > 30 ? "text-red-500" : days > 14 ? "text-amber-500" : "text-zinc-400";
                                    return <span className={`text-[11px] ${color}`}>{days}d</span>;
                                  })()}
                                </td>}
                              </tr>
                            );
                          })}
                          </Fragment>);
                        })}
                      </tbody>
                    </table>
                    {hasMoreTasks && (
                      <div className="flex items-center justify-center py-3 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                          onClick={() => setTaskPageSize(s => s + TASK_PAGE_INCREMENT)}
                          className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium"
                        >
                          Load more ({displayFilteredTasks.length - taskPageSize} remaining)
                        </button>
                      </div>
                    )}
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
                              <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed prose prose-xs dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{activity.content}</ReactMarkdown>
                              </div>
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
            className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg min-w-[260px] max-h-[340px] flex flex-col overflow-hidden"
            style={{ left: taskContextMenu.x, top: Math.min(taskContextMenu.y, window.innerHeight - 360) }}
          >
            {/* Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800">
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
                  contextMenuTab === "project"
                    ? "text-teal-600 border-b-2 border-teal-500 -mb-px"
                    : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <Folder size={12} /> Project
              </button>
              {(() => {
                const task = projectTasks.find(t => t.id === taskContextMenu?.taskId);
                return task?.company_id ? (
                  <button
                    onClick={() => setContextMenuTab("convert")}
                    className={cn(
                      "flex-1 px-3 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5",
                      contextMenuTab === "convert"
                        ? "text-blue-600 border-b-2 border-blue-500 -mb-px"
                        : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    <ArrowUpRight size={12} /> Deal
                  </button>
                ) : null;
              })()}
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

            {/* Convert to Deal tab */}
            {contextMenuTab === "convert" && (() => {
              const task = projectTasks.find(t => t.id === taskContextMenu?.taskId);
              if (!task?.company_id) return null;
              const company = allCompanies.find(c => c.id === task.company_id);
              const companyName = company?.display_name || company?.name || "Unknown";
              // Derive deal name from task title, stripping company prefix if present (e.g., "Tori Q — Analytics" → "Analytics")
              const titleParts = task.title.split("—").map((s: string) => s.trim());
              const dealName = titleParts.length > 1 ? titleParts.slice(1).join(" — ") : task.title;

              return (
                <div className="p-3 space-y-3">
                  <div className="text-xs text-zinc-500">
                    Convert <span className="font-medium text-zinc-700 dark:text-zinc-300">{task.title}</span> into a standalone deal project for <span className="font-medium text-zinc-700 dark:text-zinc-300">{companyName}</span>.
                  </div>
                  <div className="text-[10px] text-zinc-400 space-y-1">
                    <div>Stage: <span className="text-zinc-600 dark:text-zinc-300">Lead</span></div>
                    <div>Deal name: <span className="text-zinc-600 dark:text-zinc-300">{dealName}</span></div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const newDeal = await createDealMutation.mutateAsync({
                          company_id: task.company_id!,
                          name: dealName,
                          description: task.description || `Converted from task: ${task.title}`,
                          stage: "lead",
                        });
                        // Mark original task as complete and link to deal
                        const { supabase } = await import("../../lib/supabase");
                        const doneStatus = taskStatuses.find(s => s.type === "complete");
                        const updates: Record<string, any> = {
                          task_type: "converted",
                          description: `${task.description || ""}\n\n→ Converted to deal project: ${newDeal.id}`.trim(),
                          updated_at: new Date().toISOString(),
                        };
                        if (doneStatus) {
                          updates.status_id = doneStatus.id;
                          updates.completed_at = new Date().toISOString();
                        }
                        await supabase.from("tasks").update(updates).eq("id", task.id);
                        // Add source task as artifact on the new deal
                        await supabase.from("project_artifacts").insert({
                          project_id: newDeal.id,
                          type: "task",
                          label: `Source: ${task.title}`,
                          reference: task.id,
                          preview_content: `Converted from pipeline task in ${ws?.name || "project"}`,
                        });
                        // Link new deal to the same initiative as the source project
                        const { data: sourceLink } = await supabase
                          .from("initiative_projects")
                          .select("initiative_id")
                          .eq("project_id", workspaceId)
                          .maybeSingle();
                        if (sourceLink?.initiative_id) {
                          await supabase.from("initiative_projects").insert({
                            initiative_id: sourceLink.initiative_id,
                            project_id: newDeal.id,
                            sort_order: 999,
                          });
                        }
                        toast.success(`Deal project created: ${companyName} — ${dealName}`);
                        setTaskContextMenu(null);
                        setContextMenuTab("milestone");
                        refetchWorkspace();
                      } catch (err: any) {
                        toast.error(`Failed to create deal: ${err.message}`);
                      }
                    }}
                    disabled={createDealMutation.isPending}
                    className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {createDealMutation.isPending ? "Creating..." : "Convert to Deal Project"}
                  </button>
                </div>
              );
            })()}

            {/* Project tab */}
            {(contextMenuTab === "project" || milestones.length === 0) && contextMenuTab !== "milestone" && contextMenuTab !== "convert" && (
              <>
                <div className="px-2 py-2">
                  <input
                    type="text"
                    value={taskProjectSearch}
                    onChange={(e) => setTaskProjectSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="text-xs w-full border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 outline-none"
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  {allProjectsList
                    .filter(p => {
                      if (!taskProjectSearch) return true;
                      const q = taskProjectSearch.toLowerCase();
                      return p.name.toLowerCase().includes(q) || (projectInitiativeMap.get(p.id) || "").toLowerCase().includes(q);
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .slice(0, 20)
                    .map(p => {
                      const isCurrent = p.id === workspaceId;
                      return (
                        <button
                          key={p.id}
                          disabled={contextMenuLoading}
                          onClick={async () => {
                            setContextMenuLoading(true);
                            try {
                              await reassignTask(taskContextMenu.taskId, p.id);
                              toast.success("Task moved");
                              setTaskContextMenu(null); setContextMenuTab("milestone");
                            } catch { toast.error("Failed to move task"); }
                            finally { setContextMenuLoading(false); }
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${contextMenuLoading ? "opacity-50 cursor-wait" : isCurrent ? "bg-zinc-50 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                        >
                          <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                          <span className={`truncate ${isCurrent ? "font-medium text-teal-600" : ""}`}>
                            {p.name}
                            {projectInitiativeMap.has(p.id) && (
                              <span className="text-zinc-400 font-normal"> ({projectInitiativeMap.get(p.id)})</span>
                            )}
                          </span>
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

      {/* Bulk selection action bar */}
      {selectedTaskIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 dark:bg-zinc-800 text-white rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-3 text-xs">
          <span className="font-medium">{selectedTaskIds.size} task{selectedTaskIds.size > 1 ? "s" : ""} selected</span>
          <div className="w-px h-4 bg-zinc-700" />
          <button
            onClick={(e) => { setBulkProjectMenu({ x: e.clientX, y: e.clientY - 300 }); setBulkProjectSearch(""); }}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 transition-colors font-medium flex items-center gap-1.5"
          >
            <Folder size={12} /> Move to Project
          </button>
          <button
            onClick={(e) => { setBulkCompanyMenu({ x: e.clientX, y: e.clientY - 300 }); setBulkCompanySearch(""); }}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors font-medium flex items-center gap-1.5"
          >
            <Building2 size={12} /> Set Company
          </button>
          <button
            onClick={() => setAutoAssignCompanyOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors font-medium flex items-center gap-1.5"
          >
            <Sparkles size={12} /> Auto-assign Company
          </button>
          <button
            onClick={() => setAutoAssignProjectOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors font-medium flex items-center gap-1.5"
          >
            <Sparkles size={12} /> Auto-assign Project
          </button>
          <button
            onClick={() => setSelectedTaskIds(new Set())}
            className="px-2 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bulk move project picker */}
      {bulkProjectMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setBulkProjectMenu(null)} />
          <div
            className="fixed z-[60] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg min-w-[280px] max-h-[320px] flex flex-col overflow-hidden"
            style={{ left: Math.min(bulkProjectMenu.x, window.innerWidth - 300), top: Math.max(40, bulkProjectMenu.y) }}
          >
            <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              <Folder size={12} className="text-teal-600" />
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Move {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? "s" : ""} to...</span>
            </div>
            <div className="px-2 py-2">
              <input
                type="text"
                value={bulkProjectSearch}
                onChange={(e) => setBulkProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className="text-xs w-full border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 bg-zinc-50 dark:bg-zinc-800 outline-none"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {allProjectsList
                .filter(p => {
                  if (!bulkProjectSearch) return true;
                  const q = bulkProjectSearch.toLowerCase();
                  return p.name.toLowerCase().includes(q) || (projectInitiativeMap.get(p.id) || "").toLowerCase().includes(q);
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, 20)
                .map(p => {
                  const isCurrent = p.id === workspaceId;
                  return (
                    <button
                      key={p.id}
                      disabled={bulkMoving}
                      onClick={async () => {
                        const count = selectedTaskIds.size;
                        const ids = Array.from(selectedTaskIds);
                        // Close menu and show feedback immediately (optimistic update handles the rest)
                        setBulkProjectMenu(null);
                        try {
                          await reassignTasks(ids, p.id);
                          toast.success(`Moved ${count} task${count > 1 ? "s" : ""} to ${p.name}`);
                        } catch (err: any) { toast.error(`Failed to move tasks: ${err?.message || err}`); }
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${bulkMoving ? "opacity-50 cursor-wait" : isCurrent ? "bg-zinc-50 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                    >
                      <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color || "#6B7280" }} />
                      <span className={`truncate ${isCurrent ? "font-medium text-teal-600" : ""}`}>
                        {p.name}
                        {projectInitiativeMap.has(p.id) && (
                          <span className="text-zinc-400 font-normal"> ({projectInitiativeMap.get(p.id)})</span>
                        )}
                      </span>
                      <span className={`text-[8px] px-1 rounded-full uppercase ml-auto flex-shrink-0 ${
                        p.project_type === "deal" ? "bg-blue-50 text-blue-500" : "bg-zinc-100 text-zinc-400"
                      }`}>{p.project_type || "work"}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {/* Bulk set company picker */}
      {bulkCompanyMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setBulkCompanyMenu(null)} />
          <div
            className="fixed z-[60] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg min-w-[280px] max-h-[320px] flex flex-col overflow-hidden"
            style={{ left: Math.min(bulkCompanyMenu.x, window.innerWidth - 300), top: Math.max(40, bulkCompanyMenu.y) }}
          >
            <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              <Building2 size={12} className="text-teal-600" />
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Set company for {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? "s" : ""}</span>
            </div>
            <div className="px-2 py-2">
              <input
                type="text"
                value={bulkCompanySearch}
                onChange={(e) => setBulkCompanySearch(e.target.value)}
                placeholder="Search companies..."
                autoFocus
                className="w-full text-xs px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-1 pb-1">
              <button
                onClick={async () => {
                  const { supabase } = await import("../../lib/supabase");
                  await Promise.all(selectedTaskIdsArray.map(id =>
                    supabase.from("tasks").update({ company_id: null, contact_id: null }).eq("id", id)
                  ));
                  setBulkCompanyMenu(null);
                  setSelectedTaskIds(new Set());
                  refetchWorkspace();
                  toast.success("Company cleared");
                }}
                className="w-full text-left px-3 py-1.5 rounded text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                No company
              </button>
              {allCompanies
                .filter(c => !bulkCompanySearch || ((c as any).display_name || c.name).toLowerCase().includes(bulkCompanySearch.toLowerCase()))
                .map(c => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      const { supabase } = await import("../../lib/supabase");
                      await Promise.all(selectedTaskIdsArray.map(id =>
                        supabase.from("tasks").update({ company_id: c.id }).eq("id", id)
                      ));
                      setBulkCompanyMenu(null);
                      setSelectedTaskIds(new Set());
                      refetchWorkspace();
                      toast.success(`Company set to ${(c as any).display_name || c.name}`);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors truncate"
                  >
                    {(c as any).display_name || c.name}
                  </button>
                ))}
            </div>
          </div>
        </>
      )}

      <AutoAssignCompanyModal
        taskIds={selectedTaskIdsArray}
        open={autoAssignCompanyOpen}
        onClose={() => setAutoAssignCompanyOpen(false)}
        onApplied={() => {
          refetchWorkspace();
          setSelectedTaskIds(new Set());
        }}
      />

      <AutoAssignProjectModal
        taskIds={selectedTaskIdsArray}
        currentProjectId={workspaceId}
        open={autoAssignProjectOpen}
        onClose={() => setAutoAssignProjectOpen(false)}
        onApplied={() => {
          refetchWorkspace();
          setSelectedTaskIds(new Set());
        }}
      />

      {showPicker && (
        <ArtifactPickerModal
          basePath={basePath}
          workspaceId={workspaceId}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Project chat-to-update popup — owned here so clicking a session or + opens it */}
      {projectChatPopupSession && ws && (
        <ProjectChatPopup
          projectId={workspaceId}
          projectName={ws.name}
          projectType={(ws.project_type === "deal" ? "deal" : "project") as "project" | "deal"}
          folderPath={(ws as any).folder_path ?? null}
          sessionEntityId={projectChatPopupSession}
          onClose={() => setProjectChatPopupSession(null)}
        />
      )}

      {/* Task detail slide-out panel */}
      {taskDetailId && (
        <>
          <div className="fixed inset-0 z-30 bg-black/10" onClick={() => setTaskDetailId(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-[50vw] shadow-lg border-l border-zinc-200 dark:border-zinc-800">
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

// Bot chat helpers — format a session list entry and a relative time label
function formatBotChatLabel(s: { title: string | null; sample_body: string; created_at: string }): string {
  if (s.title && s.title.trim() && !s.title.startsWith("Project:") && !s.title.startsWith("Deal:")) return s.title;
  const cleaned = s.sample_body
    .replace(/@\S+\s*/g, "")
    .replace(/\[\[[\w]+:[^|\]]+(?:\|[^\]]+)?\]\]/g, "")
    .trim();
  if (cleaned) return cleaned.slice(0, 48);
  return new Date(s.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}
