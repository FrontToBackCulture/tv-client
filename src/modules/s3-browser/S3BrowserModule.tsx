// src/modules/s3-browser/S3BrowserModule.tsx

import { useState, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  Trash2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  X,
  Image as ImageIcon,
  FileCode,
  File,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/PageHeader";
import { ViewTab } from "../../components/ViewTab";
import { Button, IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import {
  useS3BrowseList,
  useS3Delete,
  useS3ListAllKeys,
  useS3Presign,
  useS3GetText,
  type S3BrowseObject,
} from "./useS3Browser";

// ─── Scoped Views ─────────────────────────────────────────────────────────────

interface S3Scope {
  id: string;
  label: string;
  description: string;
  bucket: string;
  rootPrefix: string;
}

const SCOPES: S3Scope[] = [
  {
    id: "solutions",
    label: "Domain Solutions",
    description: "Domain AI skill packages (tv-client → tv-website)",
    bucket: "production.thinkval.static",
    rootPrefix: "solutions/",
  },
  {
    id: "demo-reports",
    label: "Demo Reports",
    description: "Skill demo HTML reports (tv-client → tv-website)",
    bucket: "production.thinkval.static",
    rootPrefix: "demo-reports/",
  },
  {
    id: "email-reports",
    label: "Email Reports",
    description: "EDM campaign report attachments (tv-client)",
    bucket: "production.thinkval.static",
    rootPrefix: "email-reports/",
  },
  {
    id: "scheduler",
    label: "Scheduler Outputs",
    description: "Scheduled job outputs (tv-client)",
    bucket: "signalval",
    rootPrefix: "",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayName(key: string, prefix: string): string {
  const rel = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return rel.replace(/[\\/]$/, "") || key;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["html", "htm"].includes(ext)) return FileCode;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return ImageIcon;
  if (["md", "txt", "json", "csv"].includes(ext)) return FileText;
  return File;
}

// ─── Sidebar constants ────────────────────────────────────────────────────────

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 280;

// ─── Sidebar Folder Node (lazy-loaded) ────────────────────────────────────────

function SidebarFolder({
  name,
  prefix,
  bucket,
  activePrefix,
  depth,
  onNavigate,
  selectedFile,
  onSelectFile,
}: {
  name: string;
  prefix: string;
  bucket: string;
  activePrefix: string;
  depth: number;
  onNavigate: (prefix: string) => void;
  selectedFile: S3BrowseObject | null;
  onSelectFile: (obj: S3BrowseObject) => void;
}) {
  const isActive = activePrefix === prefix;
  const isAncestor = activePrefix.startsWith(prefix) && activePrefix !== prefix;
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? (isActive || isAncestor);

  const { data } = useS3BrowseList(bucket, expanded ? prefix : "");
  const subFolders = data?.folders ?? [];
  const files = data?.objects ?? [];

  return (
    <div>
      {/* Folder row */}
      <button
        onClick={() => {
          onNavigate(prefix);
          setManualExpanded(true);
        }}
        className={cn(
          "w-full flex items-center gap-1 py-1 px-1 text-sm rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group",
          isActive && "bg-zinc-200 dark:bg-zinc-800 font-medium"
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            setManualExpanded(!expanded);
          }}
          className="shrink-0 p-0.5 cursor-pointer"
        >
          {expanded ? (
            <ChevronDown size={12} className="text-zinc-400" />
          ) : (
            <ChevronRight size={12} className="text-zinc-400" />
          )}
        </span>
        {expanded ? (
          <FolderOpen size={14} className="text-amber-500 shrink-0" />
        ) : (
          <Folder size={14} className="text-amber-500 shrink-0" />
        )}
        <span className="truncate ml-0.5">{name}</span>
      </button>

      {/* Children */}
      {expanded && (
        <>
          {subFolders.map((f) => (
            <SidebarFolder
              key={f}
              name={displayName(f, prefix)}
              prefix={f}
              bucket={bucket}
              activePrefix={activePrefix}
              depth={depth + 1}
              onNavigate={onNavigate}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
          {files.map((obj) => {
            const fileName = displayName(obj.key, prefix);
            const Icon = getFileIcon(fileName);
            const isFileSelected = selectedFile?.key === obj.key;
            return (
              <button
                key={obj.key}
                onClick={() => onSelectFile(obj)}
                className={cn(
                  "w-full flex items-center gap-1.5 py-1 px-1 text-sm rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
                  isFileSelected && "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                )}
                style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
              >
                <Icon size={14} className={cn("shrink-0", isFileSelected ? "text-blue-500" : "text-zinc-400")} />
                <span className="truncate">{fileName}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── File Preview (main body) ─────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set(["md", "txt", "json", "csv", "xml", "yaml", "yml", "toml", "sql", "py", "js", "ts", "rs", "sh", "css"]);

function FilePreview({
  object,
  bucket,
}: {
  object: S3BrowseObject;
  bucket: string;
}) {
  const name = object.key.split(/[\\/]/).pop() ?? object.key;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const isHtml = ["html", "htm"].includes(ext);
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);
  const isText = TEXT_EXTENSIONS.has(ext);
  const isMarkdown = ext === "md";
  const Icon = getFileIcon(name);

  // Presigned URL for HTML/image preview
  const { data: presignedUrl, isLoading: presignLoading } = useS3Presign(
    bucket,
    (isHtml || isImage) ? object.key : null
  );

  // Text content fetched via Rust (bypasses CORS)
  const { data: textContent, isLoading: textLoading } = useS3GetText(
    bucket,
    isText ? object.key : null
  );

  // Loading states
  if ((isHtml || isImage) && presignLoading) {
    return <SectionLoading message="Loading preview..." />;
  }
  if (isText && textLoading) {
    return <SectionLoading message="Loading content..." />;
  }

  // HTML preview
  if (isHtml) {
    if (!presignedUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
          <AlertCircle size={32} />
          <p className="text-sm">Failed to load preview</p>
        </div>
      );
    }
    return <iframe src={presignedUrl} className="w-full h-full border-0" title={name} />;
  }

  // Image preview
  if (isImage) {
    if (!presignedUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
          <AlertCircle size={32} />
          <p className="text-sm">Failed to load preview</p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full p-8 bg-zinc-50 dark:bg-zinc-900/50">
        <img src={presignedUrl} alt={name} className="max-w-full max-h-full object-contain rounded shadow-lg" />
      </div>
    );
  }

  // Text/code preview
  if (isText) {
    if (textContent === undefined || textContent === null) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
          <AlertCircle size={32} />
          <p className="text-sm">Failed to load content</p>
        </div>
      );
    }
    if (isMarkdown) {
      return (
        <div className="h-full overflow-auto">
          <div className="max-w-3xl mx-auto px-8 py-6 prose prose-sm dark:prose-invert prose-zinc">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full overflow-auto">
        <pre className="px-6 py-4 text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
          {textContent}
        </pre>
      </div>
    );
  }

  // Non-previewable file — show metadata + download
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
      <Icon size={64} className="text-zinc-300 dark:text-zinc-600" />
      <div className="text-center space-y-1">
        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-300">{name}</p>
        <p className="text-sm">{formatBytes(object.size)}</p>
        <p className="text-xs">{formatDate(object.last_modified)}</p>
      </div>
    </div>
  );
}

// ─── Delete Confirm Bar ───────────────────────────────────────────────────────

function DeleteConfirmBar({
  count,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  count: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800">
      <span className="text-sm text-red-700 dark:text-red-400">
        Delete {count} {count === 1 ? "item" : "items"}?
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isDeleting}>
          <X size={14} />
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────────────────────

export function S3BrowserModule() {
  const [activeScope, setActiveScope] = useState<S3Scope>(SCOPES[0]);
  const [prefix, setPrefix] = useState(SCOPES[0].rootPrefix);
  const [selectedFile, setSelectedFile] = useState<S3BrowseObject | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const { data: rootData, isLoading: rootLoading } = useS3BrowseList(activeScope.bucket, activeScope.rootPrefix);
  const deleteMutation = useS3Delete();
  const listAllKeysMutation = useS3ListAllKeys();

  const rootFolders = rootData?.folders ?? [];
  const rootFiles = rootData?.objects ?? [];

  // Switch scope
  const switchScope = useCallback((scope: S3Scope) => {
    setActiveScope(scope);
    setPrefix(scope.rootPrefix);
    setSelectedFile(null);
    setSelected(new Set());
    setShowDeleteConfirm(false);
  }, []);

  // Navigate to folder
  const navigate = useCallback((newPrefix: string) => {
    setPrefix(newPrefix);
    setSelected(new Set());
    setShowDeleteConfirm(false);
  }, []);

  // Select file for preview
  const handleSelectFile = useCallback((obj: S3BrowseObject) => {
    setSelectedFile(obj);
  }, []);

  // Delete flow
  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;

    const folderPrefixes = Array.from(selected).filter((k) => k.endsWith("/") || k.endsWith("\\"));
    const fileKeys = Array.from(selected).filter((k) => !k.endsWith("/") && !k.endsWith("\\"));

    let allKeysToDelete = [...fileKeys];
    for (const fp of folderPrefixes) {
      const keys = await listAllKeysMutation.mutateAsync({
        bucket: activeScope.bucket,
        prefix: fp,
      });
      allKeysToDelete.push(...keys);
    }

    if (allKeysToDelete.length === 0) return;

    await deleteMutation.mutateAsync({
      bucket: activeScope.bucket,
      keys: allKeysToDelete,
    });

    if (selectedFile && allKeysToDelete.includes(selectedFile.key)) {
      setSelectedFile(null);
    }

    setSelected(new Set());
    setShowDeleteConfirm(false);
  }, [selected, activeScope, deleteMutation, listAllKeysMutation, selectedFile]);

  const isDeleting = deleteMutation.isPending || listAllKeysMutation.isPending;

  // Sidebar resize
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description="Browse and manage files across S3 buckets."
        tabs={<>
          {SCOPES.map((scope) => (
            <ViewTab
              key={scope.id}
              icon={Folder}
              label={scope.label}
              active={activeScope.id === scope.id}
              onClick={() => switchScope(scope)}
            />
          ))}
        </>}
      />

      {/* Body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: folder tree + files */}
        <div
          className="shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 overflow-y-auto overflow-x-hidden"
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar header with actions */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-50 dark:bg-zinc-900/50 z-10">
            <span className="text-[10px] text-zinc-400 font-mono truncate flex-1">{activeScope.bucket}</span>
            {selected.size > 0 && (
              <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={12} />
                {selected.size}
              </Button>
            )}
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => {}} />
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <DeleteConfirmBar
              count={selected.size}
              isDeleting={isDeleting}
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          )}

          {/* Tree */}
          <div className="p-1">
            {rootLoading ? (
              <SectionLoading message="Loading..." />
            ) : (
              <>
                {/* Root folder */}
                <button
                  onClick={() => navigate(activeScope.rootPrefix)}
                  className={cn(
                    "w-full flex items-center gap-1.5 py-1.5 px-2 text-sm font-medium rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
                    prefix === activeScope.rootPrefix && !selectedFile && "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
                  )}
                >
                  <FolderOpen size={14} className="text-amber-500 shrink-0" />
                  <span className="truncate">{activeScope.label}</span>
                </button>

                {/* Sub-folders */}
                {rootFolders.map((f) => (
                  <SidebarFolder
                    key={f}
                    name={displayName(f, activeScope.rootPrefix)}
                    prefix={f}
                    bucket={activeScope.bucket}
                    activePrefix={prefix}
                    depth={1}
                    onNavigate={navigate}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                  />
                ))}

                {/* Root-level files */}
                {rootFiles.map((obj) => {
                  const fileName = displayName(obj.key, activeScope.rootPrefix);
                  const Icon = getFileIcon(fileName);
                  const isFileSelected = selectedFile?.key === obj.key;
                  return (
                    <button
                      key={obj.key}
                      onClick={() => handleSelectFile(obj)}
                      className={cn(
                        "w-full flex items-center gap-1.5 py-1 px-2 text-sm rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
                        isFileSelected && "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      )}
                      style={{ paddingLeft: "18px" }}
                    >
                      <Icon size={14} className={cn("shrink-0", isFileSelected ? "text-blue-500" : "text-zinc-400")} />
                      <span className="truncate">{fileName}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="w-1 cursor-col-resize hover:bg-teal-500/30 transition-colors shrink-0"
        />

        {/* Main body: file preview */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {selectedFile ? (
            <div className="h-full flex flex-col">
              {/* File info bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {selectedFile.key.split(/[\\/]/).pop()}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{formatBytes(selectedFile.size)}</span>
                <span className="text-xs text-zinc-400">{formatDate(selectedFile.last_modified)}</span>
                <span className="text-xs text-zinc-400 font-mono truncate flex-1 text-right">{selectedFile.key}</span>
                <IconButton icon={X} label="Close" onClick={() => setSelectedFile(null)} />
              </div>

              {/* Preview */}
              <div className="flex-1 overflow-hidden">
                <FilePreview object={selectedFile} bucket={activeScope.bucket} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
              <File size={48} className="text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm">Select a file to preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
