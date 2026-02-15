// src/modules/library/FolderView.tsx
// Folder view component - shows folder header, recent files, AI chat, and context actions

import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FileText, FileCode, FileJson, Image, Loader2, FolderOpen, MessageCircle, Files } from "lucide-react";
import { useFolderFiles, useFolderEntries, FolderFile, FolderEntry } from "../../hooks/useFolderFiles";
import { useFavorites } from "../../hooks/useFavorites";
import { Breadcrumbs } from "./Breadcrumbs";
import { FolderChat } from "./FolderChat";
import { FolderActions, FolderActionHandlers } from "./FolderActions";
import { FileActions } from "./FileActions";
import { detectFolderType, type FolderType } from "../../lib/folderTypes";
import { buildDomainUrl, getDomainLinkLabel } from "../../lib/domainUrl";
import { cn } from "../../lib/cn";

interface FolderViewProps {
  path: string;
  basePath: string;
  onNavigate: (path: string) => void;
  onFileSelect: (path: string) => void;
  onFilePinned?: (path: string) => void;
}

type ViewMode = "files" | "chat";

// Get folder name from path
function getFolderName(path: string): string {
  return path.split("/").pop() || path;
}

// Format relative time
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? "Yesterday" : `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// Get file icon based on extension
function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (ext === "md" || ext === "markdown") {
    return <FileText size={20} className="text-blue-400 flex-shrink-0" />;
  }
  if (ext === "json") {
    return <FileJson size={20} className="text-green-400 flex-shrink-0" />;
  }
  if (["ts", "tsx", "js", "jsx", "rs", "py"].includes(ext)) {
    return <FileCode size={20} className="text-yellow-400 flex-shrink-0" />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return <Image size={20} className="text-purple-400 flex-shrink-0" />;
  }

  return <FileText size={20} className="text-zinc-400 flex-shrink-0" />;
}

// File card component
function FileCard({
  file,
  onClick,
  onDoubleClick,
}: {
  file: FolderFile;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="w-full text-left p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:border-teal-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start gap-3">
        <FileIcon filename={file.name} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-2 mb-1">
            {file.title || file.name}
          </h4>
          {file.summary && (
            <p className="text-xs text-zinc-500 line-clamp-2 mb-2">
              {file.summary}
            </p>
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-600">
            {formatRelativeTime(file.modified)}
          </span>
        </div>
      </div>
    </button>
  );
}

// Subdirectory card component
function SubfolderCard({
  entry,
  onClick,
}: {
  entry: FolderEntry;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:border-teal-500/50 hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-center gap-3">
        <FolderOpen size={20} className="text-teal-500 dark:text-teal-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
            {entry.name}
          </h4>
        </div>
      </div>
    </button>
  );
}

// Files view content
function FilesView({
  files,
  directories,
  isLoading,
  isError,
  folderName,
  folderType,
  actionHandlers,
  onFileSelect,
  onFilePinned,
  onNavigate,
}: {
  files: FolderFile[] | undefined;
  directories: FolderEntry[] | undefined;
  isLoading: boolean;
  isError: boolean;
  folderName: string;
  folderType: FolderType;
  actionHandlers: FolderActionHandlers;
  onFileSelect: (path: string) => void;
  onFilePinned?: (path: string) => void;
  onNavigate: (path: string) => void;
}) {
  const subdirs = directories?.filter(d => d.is_directory) || [];
  const hasFiles = files && files.length > 0;
  const hasSubdirs = subdirs.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-24">
        {/* Folder header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-200 dark:bg-zinc-800/50 mb-4">
            <FolderOpen size={32} className="text-teal-500 dark:text-teal-400" />
          </div>
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            {folderName}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-500 mb-4">
            {hasFiles
              ? `${files.length} recent files`
              : hasSubdirs
                ? `${subdirs.length} folders`
                : "Empty folder"}
          </p>

          {/* Context-specific action buttons */}
          <FolderActions
            folderType={folderType}
            handlers={actionHandlers}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-zinc-500 py-8">
            <Loader2 size={20} className="animate-spin" />
            <span>Loading...</span>
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <p className="text-red-400">Failed to load contents</p>
          </div>
        ) : (
          <>
            {/* Subdirectories - only show if NO files (files take priority) */}
            {hasSubdirs && !hasFiles && (
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                  Folders
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {subdirs.map((dir) => (
                    <SubfolderCard
                      key={dir.path}
                      entry={dir}
                      onClick={() => onNavigate(dir.path)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent files - shows direct files OR recursively found files */}
            {hasFiles && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                  Recent files
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {files.slice(0, 8).map((file) => (
                    <FileCard
                      key={file.path}
                      file={file}
                      onClick={() => onFileSelect(file.path)}
                      onDoubleClick={onFilePinned ? () => onFilePinned(file.path) : undefined}
                    />
                  ))}
                </div>
                {files.length > 8 && (
                  <p className="text-center text-sm text-zinc-600 mt-4">
                    + {files.length - 8} more files
                  </p>
                )}
              </div>
            )}

            {/* Empty state */}
            {!hasSubdirs && !hasFiles && (
              <div className="text-center py-8">
                <FolderOpen size={48} className="mx-auto mb-4 text-zinc-400 dark:text-zinc-700" />
                <p className="text-zinc-500">This folder is empty</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Simple toast notification
function showToast(message: string) {
  // For now, just use alert. In a real app, use a toast library
  console.log(`[Action] ${message}`);
  // Could add a proper toast notification here
}

export function FolderView({
  path,
  basePath,
  onNavigate,
  onFileSelect,
  onFilePinned,
}: FolderViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("files");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const folderName = getFolderName(path);
  const { data: files, isLoading, isError } = useFolderFiles(path, 20);
  const { data: entries, isLoading: entriesLoading } = useFolderEntries(path);
  const { isFavorite, toggleFavorite } = useFavorites();

  const favorite = isFavorite(path);

  // Detect folder type for context-specific actions
  const folderType = useMemo(() => detectFolderType(path), [path]);

  // Reset to files view when navigating to a new folder
  useEffect(() => {
    setViewMode("files");
  }, [path]);

  // Handle toast display
  const showToastMessage = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  };

  // Handle favorite toggle for folder
  const handleToggleFavorite = () => {
    toggleFavorite(path, folderName, true);
    showToastMessage(favorite ? "Removed from favorites" : "Added to favorites", "success");
  };

  // Handle delete folder
  const handleDelete = async () => {
    const confirmed = await confirm(`Are you sure you want to delete the folder "${folderName}" and all its contents?`, {
      title: "Delete Folder",
      kind: "warning",
    });

    if (confirmed) {
      try {
        await invoke("delete_file", { path });
        showToastMessage("Folder deleted", "success");
        // Navigate to parent folder
        const parentPath = path.split("/").slice(0, -1).join("/");
        onNavigate(parentPath || basePath);
      } catch (err) {
        showToastMessage(`Failed to delete: ${err}`, "error");
      }
    }
  };

  // Action handlers - placeholder for folder-type-specific actions
  const actionHandlers: FolderActionHandlers = useMemo(() => {
    const createHandler = (actionName: string) => () => {
      showToast(`${actionName} - Coming soon`);
    };

    switch (folderType) {
      case "client":
        return {
          onClientOverview: createHandler("Client Overview"),
          onClientCards: createHandler("Client Cards"),
        };

      case "client-root":
        return {
          onSyncReport: createHandler("Clients Sync Report"),
        };

      case "bot":
        return {
          onBotTasks: createHandler("Bot Tasks"),
        };

      case "email":
        return {
          onEmailOverview: createHandler("Email Overview"),
        };

      case "notion":
        return {
          onNotionOverview: createHandler("Notion Overview"),
        };

      default:
        return {};
    }
  }, [folderType, path, onFileSelect]);

  // Domain URL for "Open in VAL" action
  const domainUrl = useMemo(() => buildDomainUrl(path), [path]);
  const domainLabel = useMemo(() => getDomainLinkLabel(path), [path]);

  return (
    <div className="h-full flex flex-col">
      {/* Header with breadcrumbs and view toggle */}
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
        <div className="px-4 py-2 flex items-center justify-between">
          <Breadcrumbs
            path={path}
            basePath={basePath}
            onNavigate={onNavigate}
            isFile={false}
          />

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-slate-200 dark:bg-zinc-900 rounded-lg p-1">
            <button
              onClick={() => setViewMode("files")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                viewMode === "files"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              )}
            >
              <Files size={14} />
              <span>Files</span>
            </button>
            <button
              onClick={() => setViewMode("chat")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                viewMode === "chat"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              )}
            >
              <MessageCircle size={14} />
              <span>Chat</span>
            </button>

            </div>

            {/* Folder actions menu (favorites, copy path, etc.) */}
            <FileActions
              path={path}
              isDirectory={true}
              isFavorite={favorite}
              onToggleFavorite={handleToggleFavorite}
              onDelete={handleDelete}
              onShowToast={showToastMessage}
              domainUrl={domainUrl}
              domainLabel={domainLabel}
            />
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity ${
            toast.type === "success" ? "bg-teal-600 dark:bg-teal-900 text-white dark:text-teal-100" : "bg-red-600 dark:bg-red-900 text-white dark:text-red-100"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === "files" ? (
        <FilesView
          files={files}
          directories={entries}
          isLoading={isLoading || entriesLoading}
          isError={isError}
          folderName={folderName}
          folderType={folderType}
          actionHandlers={actionHandlers}
          onFileSelect={onFileSelect}
          onFilePinned={onFilePinned}
          onNavigate={onNavigate}
        />
      ) : viewMode === "chat" ? (
        <FolderChat
          folderPath={path}
          folderName={folderName}
          onFileClick={onFileSelect}
        />
      ) : null}
    </div>
  );
}
