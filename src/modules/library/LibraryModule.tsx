// src/modules/library/LibraryModule.tsx

import { useState, useCallback, useRef, useEffect } from "react";
import { Library, Search, X, File, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, Clock } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { FileViewer } from "./FileViewer";
import { FolderView } from "./FolderView";
import { useRepository } from "../../stores/repositoryStore";
import { useTabStore } from "../../stores/tabStore";
import { useRecentFilesStore } from "../../stores/recentFilesStore";
import { useFileSearch } from "../../hooks/useSearch";
import { useFileTree, useFolderChildren, TreeNode } from "../../hooks/useFiles";

// Sidebar width constraints
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 256;

interface FileInfo {
  is_directory: boolean;
}

export function LibraryModule() {
  const { activeRepository } = useRepository();
  const knowledgePath = activeRepository?.path ?? "";
  const { tabs, activeTabId, splitOpen, splitFile, openTab, closeTab, setActiveTab, closeAllTabs, setSplitFile, closeSplit } = useTabStore();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [splitWidth, setSplitWidth] = useState(0.5); // fraction of content area
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Derive active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Clear tabs when repository changes
  const handleRepositoryChange = useCallback(() => {
    closeAllTabs();
  }, [closeAllTabs]);

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

  // Handle split resize (fraction-based)
  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startFraction = splitWidth;
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const contentWidth = contentEl.getBoundingClientRect().width;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newFraction = Math.min(0.8, Math.max(0.2, startFraction + delta / contentWidth));
      setSplitWidth(newFraction);
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
  }, [splitWidth]);

  // Handle file/folder selection — opens a tab
  const handleFileSelect = useCallback(async (path: string) => {
    try {
      const info = await invoke<FileInfo>("get_file_info", { path });
      const name = path.split("/").pop() || path;
      openTab(path, name, info.is_directory);
    } catch (err) {
      console.error("Failed to get file info:", err);
      const name = path.split("/").pop() || path;
      openTab(path, name, false);
    }
  }, [openTab]);

  // Handle split file selection
  const handleSplitFileSelect = useCallback(async (path: string) => {
    try {
      const info = await invoke<FileInfo>("get_file_info", { path });
      const name = path.split("/").pop() || path;
      setSplitFile(path, name, info.is_directory);
    } catch (err) {
      console.error("Failed to get file info:", err);
      const name = path.split("/").pop() || path;
      setSplitFile(path, name, false);
    }
  }, [setSplitFile]);

  // Handle navigation from breadcrumbs or folder view
  const handleNavigate = useCallback((path: string) => {
    if (path.startsWith(knowledgePath)) {
      handleFileSelect(path);
    }
  }, [knowledgePath, handleFileSelect]);

  // Handle navigation in split pane
  const handleSplitNavigate = useCallback((path: string) => {
    if (path.startsWith(knowledgePath)) {
      handleSplitFileSelect(path);
    }
  }, [knowledgePath, handleSplitFileSelect]);

  // Keyboard shortcuts for tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+W — close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx === -1) return;
        const next = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        setActiveTab(tabs[next].id);
        return;
      }

      // Cmd+\ — close all tabs
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        closeAllTabs();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs, activeTabId, closeTab, setActiveTab, closeAllTabs]);

  return (
    <div ref={containerRef} className="h-full flex bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar with file tree */}
      <Sidebar
        key={activeRepository?.id ?? "no-repo"}
        knowledgePath={knowledgePath}
        selectedPath={activeTab?.path ?? null}
        onFileSelect={handleFileSelect}
        onRepositoryChange={handleRepositoryChange}
        width={sidebarWidth}
      />

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize hover:bg-teal-500/50 transition-colors flex-shrink-0 ${
          isResizing ? "bg-teal-500" : "bg-transparent hover:bg-slate-300 dark:hover:bg-zinc-700"
        }`}
      />

      {/* Main content area: tab bar + viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <TabBar />

        {/* Content — single or split */}
        <div ref={contentRef} className="flex-1 flex overflow-hidden">
          {/* Left pane (or full width when no split) */}
          <div className="overflow-hidden" style={{ flex: splitOpen ? `0 0 ${splitWidth * 100}%` : "1 1 0%" }}>
            {activeTab ? (
              activeTab.isDirectory ? (
                <FolderView
                  path={activeTab.path}
                  basePath={knowledgePath}
                  onNavigate={handleNavigate}
                  onFileSelect={handleFileSelect}
                />
              ) : (
                <FileViewer
                  path={activeTab.path}
                  basePath={knowledgePath}
                  onNavigate={handleNavigate}
                />
              )
            ) : !knowledgePath ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Library size={48} className="mx-auto mb-4 text-zinc-400 dark:text-zinc-700" />
                  <h2 className="text-xl font-semibold text-zinc-600 dark:text-zinc-400">No Repository Selected</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-600 mt-2 max-w-md">
                    Add a repository using the dropdown in the sidebar.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Library size={48} className="mx-auto mb-4 text-zinc-400 dark:text-zinc-700" />
                  <h2 className="text-xl font-semibold text-zinc-600 dark:text-zinc-400">Knowledge Base</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-600 mt-2 max-w-md">
                    Select a file or folder from the sidebar to view its contents.
                    <br />
                    Use search to find files by name or content.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Split pane */}
          {splitOpen && (
            <>
              <div
                onMouseDown={handleSplitMouseDown}
                className="w-1 cursor-col-resize flex-shrink-0 hover:bg-slate-300 dark:hover:bg-zinc-700 active:bg-teal-500 transition-colors"
              />
              <div className="flex-1 overflow-hidden min-w-0 flex flex-col border-l border-slate-200 dark:border-zinc-800">
                <SplitPane
                  splitFile={splitFile}
                  knowledgePath={knowledgePath}
                  onFileSelect={handleSplitFileSelect}
                  onNavigate={handleSplitNavigate}
                  onClose={closeSplit}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Split Pane ----------

interface SplitPaneProps {
  splitFile: { path: string; name: string; isDirectory: boolean } | null;
  knowledgePath: string;
  onFileSelect: (path: string) => void;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

function SplitPane({ splitFile, knowledgePath, onFileSelect, onNavigate, onClose }: SplitPaneProps) {
  const [pickerOpen, setPickerOpen] = useState(!splitFile);

  // Auto-open picker when split opens with no file
  useEffect(() => {
    if (!splitFile) setPickerOpen(true);
  }, [splitFile]);

  return (
    <>
      {/* Split pane header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 flex-shrink-0">
        <button
          onClick={() => setPickerOpen(true)}
          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          title="Search files"
        >
          <Search size={13} className="text-zinc-500" />
        </button>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex-1 text-xs text-zinc-600 dark:text-zinc-400 truncate text-left px-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          title="Click to change file"
        >
          {splitFile?.name || "Select a file..."}
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          title="Close split"
        >
          <X size={13} className="text-zinc-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {pickerOpen ? (
          <SplitPicker
            knowledgePath={knowledgePath}
            onSelect={(path) => {
              onFileSelect(path);
              setPickerOpen(false);
            }}
            onClose={() => {
              if (splitFile) setPickerOpen(false);
            }}
          />
        ) : splitFile ? (
          splitFile.isDirectory ? (
            <FolderView
              path={splitFile.path}
              basePath={knowledgePath}
              onNavigate={onNavigate}
              onFileSelect={onFileSelect}
            />
          ) : (
            <FileViewer
              path={splitFile.path}
              basePath={knowledgePath}
              onNavigate={onNavigate}
            />
          )
        ) : null}
      </div>
    </>
  );
}

// ---------- Split Picker (file search + tree) ----------

function SplitPicker({ knowledgePath, onSelect, onClose }: { knowledgePath: string; onSelect: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const recentFiles = useRecentFilesStore((s) => s.files);

  const { data: searchResults, isLoading } = useFileSearch(knowledgePath || undefined, query, {
    maxResults: 20,
    enabled: query.length >= 2,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const showResults = query.length >= 2;

  return (
    <div className="absolute inset-0 z-10 bg-white dark:bg-zinc-900 flex flex-col">
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
        <Search size={14} className="text-zinc-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100"
        />
        {query && (
          <button onClick={() => setQuery("")} className="p-0.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded">
            <X size={12} className="text-zinc-500" />
          </button>
        )}
      </div>

      {/* Results / Recent / Tree */}
      <div className="flex-1 overflow-y-auto">
        {showResults ? (
          isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="text-zinc-400 animate-spin" />
            </div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="py-1">
              {searchResults.map((r) => (
                <button
                  key={r.path}
                  onClick={() => onSelect(r.path)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  {r.is_directory ? (
                    <Folder size={14} className="flex-shrink-0 text-teal-500" />
                  ) : (
                    <File size={14} className="flex-shrink-0 text-zinc-400" />
                  )}
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-sm text-zinc-400">No files found</div>
          )
        ) : (
          <>
            {/* Recent files */}
            {recentFiles.filter((f) => !f.isDirectory).length > 0 && (
              <div className="py-1 border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500">
                  <Clock size={12} />
                  <span>Recent</span>
                </div>
                {recentFiles
                  .filter((f) => !f.isDirectory)
                  .slice(0, 8)
                  .map((f) => (
                    <button
                      key={f.path}
                      onClick={() => onSelect(f.path)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <File size={14} className="flex-shrink-0 text-zinc-400" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
              </div>
            )}
            {/* Browsable file tree */}
            {knowledgePath && (
              <div className="py-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500">
                  <FolderOpen size={12} />
                  <span>Browse</span>
                </div>
                <SplitPickerTree root={knowledgePath} onSelect={onSelect} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Picker file tree (lazy loading) ----------

function SplitPickerTree({ root, onSelect }: { root: string; onSelect: (path: string) => void }) {
  const { data: tree, isLoading: treeLoading } = useFileTree(root, 3);

  if (treeLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={14} className="text-zinc-400 animate-spin" />
      </div>
    );
  }
  if (!tree?.children) return null;

  return (
    <div>
      {tree.children.map((node) => (
        <SplitPickerNode key={node.path} node={node} onSelect={onSelect} level={0} />
      ))}
    </div>
  );
}

function SplitPickerNode({ node, onSelect, level }: { node: TreeNode; onSelect: (path: string) => void; level: number }) {
  const [expanded, setExpanded] = useState(false);
  const indent = 12 + level * 16;

  const needsLazyLoad = node.is_directory && node.children === null;
  const { data: lazyChildren, isLoading: lazyLoading } = useFolderChildren(
    node.path,
    expanded && needsLazyLoad
  );

  if (node.is_directory) {
    const children = node.children ?? lazyChildren ?? [];
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
          style={{ paddingLeft: `${indent}px` }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? (
            <FolderOpen size={14} className="text-teal-500 flex-shrink-0" />
          ) : (
            <Folder size={14} className="text-teal-500 flex-shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {lazyLoading ? (
              <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${indent + 28}px` }}>
                <Loader2 size={12} className="text-zinc-400 animate-spin" />
                <span className="text-xs text-zinc-400">Loading...</span>
              </div>
            ) : children.length > 0 ? (
              children.map((child) => (
                <SplitPickerNode key={child.path} node={child} onSelect={onSelect} level={level + 1} />
              ))
            ) : (
              <div className="text-xs text-zinc-400 py-1" style={{ paddingLeft: `${indent + 28}px` }}>
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
      style={{ paddingLeft: `${indent + 16}px` }}
    >
      <File size={14} className="flex-shrink-0 text-zinc-400" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
