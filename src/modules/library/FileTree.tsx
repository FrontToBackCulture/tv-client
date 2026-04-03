// src/modules/library/FileTree.tsx

import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  FileCode,
  FileJson,
  File,
  Loader2,
  Star,
  Copy,
  ExternalLink,
  FolderOpen,
  Image,
  Video,
  Presentation,
  Briefcase,
} from "lucide-react";
import { TreeNode, useFolderChildren } from "../../hooks/useFiles";
import { useFavorites } from "../../hooks/useFavorites";
import { useWorkspaces, useAddArtifact } from "../../hooks/workspace";
import { useRepository } from "../../stores/repositoryStore";
import { useFolderExpansion } from "../../stores/folderExpansionStore";
import { cn } from "../../lib/cn";
import { invoke } from "@tauri-apps/api/core";

interface FileTreeProps {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onPinSelect?: (path: string) => void;
  level: number;
}

// Get icon based on file extension and name
function getFileIcon(name: string) {
  const lowerName = name.toLowerCase();

  // Special file types by full name pattern
  if (lowerName.endsWith(".nanobanana.json")) {
    return <Image size={14} className="text-pink-400" />;
  }
  if (lowerName.endsWith(".gamma.json")) {
    return <Presentation size={14} className="text-purple-400" />;
  }
  if (lowerName.endsWith(".veo.json")) {
    return <Video size={14} className="text-red-400" />;
  }
  if (lowerName.endsWith(".excalidraw") || lowerName.endsWith(".excalidraw.json")) {
    return <Presentation size={14} className="text-indigo-400" />;
  }

  const ext = name.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "md":
    case "markdown":
      return <FileText size={14} className="text-blue-400" />;
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return <FileCode size={14} className="text-yellow-400" />;
    case "json":
      return <FileJson size={14} className="text-green-400" />;
    case "sql":
      return <FileCode size={14} className="text-cyan-400" />;
    case "rs":
      return <FileCode size={14} className="text-orange-400" />;
    case "py":
      return <FileCode size={14} className="text-blue-500" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <Image size={14} className="text-emerald-400" />;
    case "mp4":
    case "webm":
    case "mov":
      return <Video size={14} className="text-red-400" />;
    default:
      return <File size={14} className="text-zinc-500" />;
  }
}

// Context menu component
function ContextMenu({
  x,
  y,
  path,
  isDirectory,
  isFavorite,
  onClose,
  onToggleFavorite,
  onOpenInNewTab,
}: {
  x: number;
  y: number;
  path: string;
  isDirectory: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
  onOpenInNewTab?: () => void;
}) {
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const { data: workspaces } = useWorkspaces({ status: "open" });
  const { data: inProgressWorkspaces } = useWorkspaces({ status: "in_progress" });
  const addArtifact = useAddArtifact();
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";

  const allWorkspaces = [
    ...(workspaces ?? []),
    ...(inProgressWorkspaces ?? []),
  ].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(path);
    onClose();
  };

  const handleShowInFinder = async () => {
    try {
      await invoke("open_in_finder", { path });
    } catch (err) {
      console.error("Failed to open in Finder:", err);
    }
    onClose();
  };

  const handleOpenWithDefault = async () => {
    try {
      await invoke("open_with_default_app", { path });
    } catch (err) {
      console.error("Failed to open:", err);
    }
    onClose();
  };

  const handleAddToWorkspace = (workspaceId: string) => {
    const reference = path.startsWith(basePath)
      ? path.slice(basePath.length).replace(/^\//, "")
      : path;
    const label = path.split("/").filter(Boolean).pop() || reference;

    let type = "other";
    if (isDirectory) {
      if (reference.includes("_skills") || reference.includes("skills/")) type = "skill";
      else if (reference.includes("src/") || reference.includes("src-tauri/")) type = "code";
      else type = "doc";
    } else {
      const ext = path.split(".").pop()?.toLowerCase() || "";
      if (["ts", "tsx", "js", "jsx", "rs", "py", "sql"].includes(ext)) type = "code";
      else if (["html", "htm"].includes(ext)) type = "report";
      else type = "doc";
    }

    addArtifact.mutate(
      { project_id: workspaceId, label, reference, type },
      { onSuccess: onClose }
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        {onOpenInNewTab && (
          <>
            <button
              onClick={() => {
                onOpenInNewTab();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <ExternalLink size={14} />
              Open in New Tab
            </button>
            <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
          </>
        )}
        <button
          onClick={() => {
            onToggleFavorite();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <Star size={14} className={isFavorite ? "text-yellow-500 fill-yellow-500" : ""} />
          {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>

        {/* Add to Workspace */}
        <div className="relative">
          <button
            onClick={() => setShowWorkspaces(!showWorkspaces)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <Briefcase size={14} />
            Add to Workspace
            <ChevronRight size={12} className="ml-auto text-zinc-400" />
          </button>
          {showWorkspaces && (
            <div className="absolute left-full top-0 ml-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[200px] max-h-[300px] overflow-y-auto z-50">
              {allWorkspaces.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-400">No open workspaces</p>
              ) : (
                allWorkspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleAddToWorkspace(ws.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <Briefcase size={12} className="text-teal-500 flex-shrink-0" />
                    <span className="truncate">{ws.title}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
        <button
          onClick={handleCopyPath}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <Copy size={14} />
          Copy Path
        </button>
        <button
          onClick={handleShowInFinder}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <FolderOpen size={14} />
          Show in Finder
        </button>
        {!isDirectory && (
          <button
            onClick={handleOpenWithDefault}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <ExternalLink size={14} />
            Open with Default App
          </button>
        )}
      </div>
    </>
  );
}

export function FileTree({ node, selectedPath, onSelect, onPinSelect, level }: FileTreeProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const { isFavorite, toggleFavorite } = useFavorites();
  const { isExpanded: checkExpanded, toggleExpanded, registerFolder } = useFolderExpansion();

  const isDirectory = node.is_directory;
  const isExpanded = isDirectory ? checkExpanded(node.path) : false;

  // Use node.children if available (from parent query), otherwise load on demand
  const needsLazyLoad = isDirectory && node.children === null;

  // Only fetch children via query if we need lazy loading AND folder is expanded
  const { data: lazyChildren, isLoading, isFetching } = useFolderChildren(
    node.path,
    needsLazyLoad && isExpanded
  );

  // Children come from either the node prop or the lazy-loaded query
  const children = node.children ?? lazyChildren ?? null;

  // Register this folder with the expansion store
  useEffect(() => {
    if (isDirectory) {
      registerFolder(node.path, level);
    }
  }, [node.path, isDirectory, level, registerFolder]);

  const isSelected = selectedPath === node.path;
  const hasChildren = isDirectory && children && children.length > 0;
  const showChevron = isDirectory && (hasChildren || needsLazyLoad);
  const favorite = isFavorite(node.path);

  const handleClick = () => {
    if (isDirectory) {
      toggleExpanded(node.path);
      onSelect(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const handleDoubleClick = () => {
    if (!isDirectory && onPinSelect) {
      onPinSelect(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleToggleFavorite = () => {
    toggleFavorite(node.path, node.name, isDirectory);
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors",
          "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
          isSelected && "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand/collapse chevron for directories */}
        {isDirectory ? (
          <span className="w-4 h-4 flex items-center justify-center">
            {(isLoading || isFetching) ? (
              <Loader2 size={12} className="text-zinc-400 animate-spin" />
            ) : showChevron ? (
              isExpanded ? (
                <ChevronDown size={12} className="text-zinc-500" />
              ) : (
                <ChevronRight size={12} className="text-zinc-500" />
              )
            ) : null}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        {isDirectory ? (
          <Folder size={14} className={cn("text-zinc-500", isExpanded && "text-yellow-500")} />
        ) : (
          getFileIcon(node.name)
        )}

        {/* Name */}
        <span className={cn("text-sm truncate flex-1", isSelected ? "text-teal-600 dark:text-teal-400" : "text-zinc-700 dark:text-zinc-300")}>
          {node.name}
        </span>

        {/* Favorite indicator */}
        {favorite && (
          <Star size={12} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={node.path}
          isDirectory={isDirectory}
          isFavorite={favorite}
          onClose={() => setContextMenu(null)}
          onToggleFavorite={handleToggleFavorite}
          onOpenInNewTab={onPinSelect ? () => onPinSelect(node.path) : undefined}
        />
      )}

      {/* Children */}
      {isDirectory && isExpanded && children && (
        <div>
          {children.map((child) => (
            <FileTree
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onPinSelect={onPinSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
