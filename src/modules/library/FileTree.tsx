// src/modules/library/FileTree.tsx

import { useState, useCallback, useEffect } from "react";
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
} from "lucide-react";
import { TreeNode } from "../../hooks/useFiles";
import { useFavorites } from "../../hooks/useFavorites";
import { useFolderExpansion } from "../../stores/folderExpansionStore";
import { cn } from "../../lib/cn";
import { invoke } from "@tauri-apps/api/core";

interface FileTreeProps {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
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
}: {
  x: number;
  y: number;
  path: string;
  isDirectory: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
}) {
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        <button
          onClick={() => {
            onToggleFavorite();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Star size={14} className={isFavorite ? "text-yellow-500 fill-yellow-500" : ""} />
          {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        <div className="border-t border-zinc-800 my-1" />
        <button
          onClick={handleCopyPath}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Copy size={14} />
          Copy Path
        </button>
        <button
          onClick={handleShowInFinder}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <FolderOpen size={14} />
          Show in Finder
        </button>
        {!isDirectory && (
          <button
            onClick={handleOpenWithDefault}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <ExternalLink size={14} />
            Open with Default App
          </button>
        )}
      </div>
    </>
  );
}

export function FileTree({ node, selectedPath, onSelect, level }: FileTreeProps) {
  const [children, setChildren] = useState<TreeNode[] | null>(node.children || null);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const { isFavorite, toggleFavorite } = useFavorites();
  const { isExpanded: checkExpanded, toggleExpanded, registerFolder } = useFolderExpansion();

  const isDirectory = node.is_directory;
  const isExpanded = isDirectory ? checkExpanded(node.path) : false;

  // Register this folder with the expansion store
  useEffect(() => {
    if (isDirectory) {
      registerFolder(node.path, level);
    }
  }, [node.path, isDirectory, level, registerFolder]);

  const isSelected = selectedPath === node.path;
  const hasChildren = isDirectory && children && children.length > 0;
  const needsLoad = isDirectory && children === null;
  const favorite = isFavorite(node.path);

  // Load children on demand
  const loadChildren = useCallback(async () => {
    if (!isDirectory || isLoading) return;

    setIsLoading(true);
    try {
      const result = await invoke<TreeNode>("get_file_tree", {
        path: node.path,
        max_depth: 1,
      });
      setChildren(result.children || []);
    } catch (err) {
      console.error("Failed to load children:", err);
      setChildren([]);
    } finally {
      setIsLoading(false);
    }
  }, [node.path, isDirectory, isLoading]);

  const handleClick = async () => {
    if (isDirectory) {
      if (!isExpanded && needsLoad) {
        await loadChildren();
      }
      toggleExpanded(node.path);
      // Also select the folder to show FolderView
      onSelect(node.path);
    } else {
      onSelect(node.path);
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
        onContextMenu={handleContextMenu}
        className={cn(
          "group flex items-center gap-1 px-2 py-1 cursor-pointer transition-colors",
          "hover:bg-zinc-800",
          isSelected && "bg-zinc-800 text-teal-400"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand/collapse chevron for directories */}
        {isDirectory ? (
          <span className="w-4 h-4 flex items-center justify-center">
            {isLoading ? (
              <Loader2 size={12} className="text-zinc-500 animate-spin" />
            ) : hasChildren || needsLoad ? (
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
        <span className={cn("text-sm truncate flex-1", isSelected ? "text-teal-400" : "text-zinc-300")}>
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
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
