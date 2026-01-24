// src/modules/library/LibraryModule.tsx

import { useState, useCallback, useRef } from "react";
import { Library } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./Sidebar";
import { FileViewer } from "./FileViewer";
import { FolderView } from "./FolderView";
import { useRepository } from "../../stores/repositoryStore";

// Sidebar width constraints
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 256;

interface FileInfo {
  is_directory: boolean;
}

interface Selection {
  path: string;
  isDirectory: boolean;
}

export function LibraryModule() {
  const { activeRepository } = useRepository();
  const knowledgePath = activeRepository?.path ?? "";
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear selection when repository changes
  const handleRepositoryChange = useCallback(() => {
    setSelection(null);
  }, []);

  // Handle sidebar resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [sidebarWidth]);

  // Handle file/folder selection
  const handleFileSelect = useCallback(async (path: string) => {
    try {
      const info = await invoke<FileInfo>("get_file_info", { path });
      setSelection({ path, isDirectory: info.is_directory });
    } catch (err) {
      console.error("Failed to get file info:", err);
      // Assume file if we can't get info
      setSelection({ path, isDirectory: false });
    }
  }, []);

  // Handle navigation from breadcrumbs or folder view
  const handleNavigate = useCallback((path: string) => {
    if (path.startsWith(knowledgePath)) {
      handleFileSelect(path);
    }
  }, [knowledgePath, handleFileSelect]);

  return (
    <div ref={containerRef} className="h-full flex bg-zinc-950">
      {/* Sidebar with file tree - key forces remount on repository change */}
      <Sidebar
        key={activeRepository?.id ?? "no-repo"}
        knowledgePath={knowledgePath}
        selectedPath={selection?.path ?? null}
        onFileSelect={handleFileSelect}
        onRepositoryChange={handleRepositoryChange}
        width={sidebarWidth}
      />

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize hover:bg-teal-500/50 transition-colors flex-shrink-0 ${
          isResizing ? "bg-teal-500" : "bg-transparent hover:bg-zinc-700"
        }`}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {selection ? (
          selection.isDirectory ? (
            <FolderView
              path={selection.path}
              basePath={knowledgePath}
              onNavigate={handleNavigate}
              onFileSelect={handleFileSelect}
            />
          ) : (
            <FileViewer
              path={selection.path}
              basePath={knowledgePath}
              onNavigate={handleNavigate}
            />
          )
        ) : !knowledgePath ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Library size={48} className="mx-auto mb-4 text-zinc-700" />
              <h2 className="text-xl font-semibold text-zinc-400">No Repository Selected</h2>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                Add a repository using the dropdown in the sidebar.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Library size={48} className="mx-auto mb-4 text-zinc-700" />
              <h2 className="text-xl font-semibold text-zinc-400">Knowledge Base</h2>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                Select a file or folder from the sidebar to view its contents.
                <br />
                Use search to find files by name or content.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
