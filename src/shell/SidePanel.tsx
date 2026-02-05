// src/shell/SidePanel.tsx
// Side document panel — read-only file viewer alongside Work/CRM/Inbox modules

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, FileText, FileCode, AlertCircle, File, Folder, FolderOpen, Loader2, Clock, ChevronRight, Replace } from "lucide-react";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useRecentFilesStore } from "../stores/recentFilesStore";
import { useReadFile, useFolderChildren } from "../hooks/useFiles";
import { useFileSearch } from "../hooks/useSearch";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";
import { JSONViewer, SQLViewer, CSVViewer, HTMLViewer, ImageViewer, PDFViewer } from "../modules/library/viewers";

// ---------- file type helpers (same as FileViewer.tsx) ----------

type FileType = "markdown" | "json" | "sql" | "csv" | "image" | "html" | "pdf" | "code" | "text";

function getFileType(path: string): FileType {
  const ext = path.toLowerCase().split(".").pop() || "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "json";
  if (ext === "sql") return "sql";
  if (ext === "csv") return "csv";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"].includes(ext)) return "image";
  if (["ts", "tsx", "js", "jsx", "rs", "py", "yaml", "yml", "toml", "css", "scss", "sh", "bash"].includes(ext)) return "code";
  return "text";
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    rs: "Rust", py: "Python", yaml: "YAML", yml: "YAML", toml: "TOML",
    html: "HTML", css: "CSS", scss: "SCSS", sh: "Shell", bash: "Bash",
  };
  return langMap[ext] || ext.toUpperCase();
}

// ---------- SidePanel ----------

export function SidePanel() {
  const {
    filePath, fileName, panelWidth, isPickerOpen,
    openPanel, closePanel, setPanelWidth, openPicker, closePicker,
  } = useSidePanelStore();

  // ---- resize handle ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: MouseEvent) => {
      // Panel is on the right, so dragging left = wider
      const delta = startX - ev.clientX;
      setPanelWidth(startWidth + delta);
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
  }, [panelWidth, setPanelWidth]);

  return (
    <div className="flex flex-shrink-0 h-full" style={{ width: panelWidth }}>
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize flex-shrink-0 hover:bg-slate-300 dark:hover:bg-zinc-700 active:bg-teal-500 transition-colors"
      />

      {/* Panel body */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
          <button
            onClick={openPicker}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            title="Search files"
          >
            <Search size={14} className="text-zinc-500" />
          </button>
          {/* Clickable filename — opens picker to switch document */}
          <button
            onClick={openPicker}
            className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate text-left px-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            title="Click to change document"
          >
            {fileName || "No file selected"}
          </button>
          {filePath && (
            <button
              onClick={openPicker}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              title="Change document"
            >
              <Replace size={14} className="text-zinc-500" />
            </button>
          )}
          <button
            onClick={closePanel}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            title="Close panel"
          >
            <X size={14} className="text-zinc-500" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          {isPickerOpen && (
            <Picker
              onSelect={(path, name) => {
                openPanel(path, name);
              }}
              onClose={closePicker}
            />
          )}
          {!isPickerOpen && filePath && <ReadOnlyViewer path={filePath} />}
          {!isPickerOpen && !filePath && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center px-4">
                <FileText size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600" />
                <p className="text-sm text-zinc-500">No document open</p>
                <button
                  onClick={openPicker}
                  className="mt-2 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Search for a file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Picker overlay ----------

function Picker({ onSelect, onClose }: { onSelect: (path: string, name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRepo = useRepositoryStore((s) => s.getActiveRepository());
  const recentFiles = useRecentFilesStore((s) => s.files);
  const currentFolder = useSidePanelStore((s) => s.currentFolder);

  const root = activeRepo?.path;
  // Use current folder if it's within the active repo, otherwise fall back to root
  const initialFolder = currentFolder && root && currentFolder.startsWith(root) ? currentFolder : root;
  const { data: searchResults, isLoading } = useFileSearch(root, query, {
    maxResults: 20,
    enabled: query.length >= 2,
  });

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectFile = (path: string) => {
    const name = path.split("/").pop() || path;
    onSelect(path, name);
  };

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

      {/* Results / Recent */}
      <div className="flex-1 overflow-y-auto">
        {showResults ? (
          isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="text-zinc-400 animate-spin" />
            </div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="py-1">
              {searchResults.filter((r) => !r.is_directory).map((r) => (
                <button
                  key={r.path}
                  onClick={() => selectFile(r.path)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  <File size={14} className="flex-shrink-0 text-zinc-400" />
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-sm text-zinc-400">No files found</div>
          )
        ) : (
          /* Show recent files + file tree when no search query */
          <>
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
                      onClick={() => selectFile(f.path)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <File size={14} className="flex-shrink-0 text-zinc-400" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
              </div>
            )}
            {/* Browsable file tree */}
            {root && (
              <div className="py-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500">
                  <FolderOpen size={12} />
                  <span>Browse</span>
                </div>
                <PickerTree root={root} initialFolder={initialFolder} onSelect={selectFile} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Picker file tree ----------

function PickerTree({ root, initialFolder, onSelect }: { root: string; initialFolder?: string | null; onSelect: (path: string) => void }) {
  // Current folder being browsed - starts at initialFolder or root
  const [currentPath, setCurrentPath] = useState(initialFolder || root);

  // Load contents of current folder
  const { data: children, isLoading } = useFolderChildren(currentPath, true);

  // Check if at root
  const isAtRoot = currentPath === root;
  const folderName = currentPath.split("/").pop() || "Root";

  // Navigate to parent folder
  const goUp = () => {
    const parentPath = currentPath.slice(0, currentPath.lastIndexOf("/"));
    if (parentPath.length >= root.length) {
      setCurrentPath(parentPath);
    }
  };

  // Navigate into a subfolder
  const openFolder = (path: string) => {
    setCurrentPath(path);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={14} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Current folder header with back button */}
      {!isAtRoot && (
        <button
          onClick={goUp}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left border-b border-slate-100 dark:border-zinc-800"
        >
          <ChevronRight size={12} className="rotate-180" />
          <FolderOpen size={14} className="text-teal-500 flex-shrink-0" />
          <span className="truncate font-medium">{folderName}</span>
          <span className="text-[10px] text-zinc-400 ml-auto">↑ Back</span>
        </button>
      )}

      {/* Folder contents */}
      {children && children.length > 0 ? (
        children.map((node) => (
          node.is_directory ? (
            <button
              key={node.path}
              onClick={() => openFolder(node.path)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <Folder size={14} className="text-teal-500 flex-shrink-0" />
              <span className="truncate">{node.name}</span>
              <ChevronRight size={12} className="ml-auto text-zinc-300" />
            </button>
          ) : (
            <button
              key={node.path}
              onClick={() => onSelect(node.path)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <File size={14} className="flex-shrink-0 text-zinc-400" />
              <span className="truncate">{node.name}</span>
            </button>
          )
        ))
      ) : (
        <div className="px-3 py-4 text-center text-xs text-zinc-400">
          Empty folder
        </div>
      )}
    </div>
  );
}

// ---------- Read-only viewer ----------

function ReadOnlyViewer({ path }: { path: string }) {
  const fileType = getFileType(path);
  const filename = path.split("/").pop() || path;

  const skipTextLoad = fileType === "image" || fileType === "pdf";
  const { data: content, isLoading, isError, error } = useReadFile(skipTextLoad ? undefined : path);

  // Binary viewers
  if (fileType === "image") {
    return <ImageViewer path={path} filename={filename} />;
  }
  if (fileType === "pdf") {
    return <PDFViewer path={path} filename={filename} />;
  }

  // Loading
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <FileText size={24} className="text-zinc-400 animate-pulse" />
      </div>
    );
  }

  // Error
  if (isError) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-500">Failed to load file</p>
          <p className="text-xs text-zinc-500 mt-1">{String(error)}</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-zinc-500">Empty file</p>
      </div>
    );
  }

  // Markdown
  if (fileType === "markdown") {
    return (
      <div className="h-full overflow-auto p-4">
        <MarkdownViewer content={content} />
      </div>
    );
  }

  // JSON (read-only viewer)
  if (fileType === "json") {
    return <JSONViewer content={content} filename={filename} />;
  }

  // SQL (read-only viewer)
  if (fileType === "sql") {
    return <SQLViewer content={content} filename={filename} />;
  }

  // CSV
  if (fileType === "csv") {
    return <CSVViewer content={content} filename={filename} />;
  }

  // HTML
  if (fileType === "html") {
    return <HTMLViewer content={content} filename={filename} />;
  }

  // Code
  if (fileType === "code") {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-zinc-800">
          <FileCode size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-500">{filename}</span>
          <span className="text-xs text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded ml-auto">
            {getLanguage(path)}
          </span>
        </div>
        <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{content}</pre>
      </div>
    );
  }

  // Plain text fallback
  return (
    <div className="h-full overflow-auto p-4">
      <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{content}</pre>
    </div>
  );
}
