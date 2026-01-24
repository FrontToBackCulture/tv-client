// src/modules/library/FileViewer.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FileText, FileCode, AlertCircle } from "lucide-react";
import { useReadFile } from "../../hooks/useFiles";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { useFavorites } from "../../hooks/useFavorites";
import { MarkdownEditor } from "./MarkdownEditor";
import { Breadcrumbs } from "./Breadcrumbs";
import { FileActions } from "./FileActions";
import { JSONEditor, SQLEditor, ImageViewer, CSVViewer, HTMLViewer, PDFViewer } from "./viewers";

interface FileViewerProps {
  path: string;
  basePath: string;
  onNavigate: (path: string) => void;
}

// File type detection
type FileType = "markdown" | "json" | "sql" | "csv" | "image" | "html" | "pdf" | "code" | "text";

function getFileType(path: string): FileType {
  const lowerPath = path.toLowerCase();
  const ext = lowerPath.split(".").pop() || "";

  // Check by extension
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

// Get filename from path
function getFileName(path: string): string {
  return path.split("/").pop() || path;
}

// Get language label for code files
function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    rs: "Rust",
    py: "Python",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    sh: "Shell",
    bash: "Bash",
  };
  return langMap[ext] || ext.toUpperCase();
}

export function FileViewer({ path, basePath, onNavigate }: FileViewerProps) {
  const fileType = getFileType(path);
  const filename = getFileName(path);

  // Skip text content loading for binary files (images, PDFs)
  const skipTextLoad = fileType === "image" || fileType === "pdf";
  const { data: content, isLoading, isError, error } = useReadFile(skipTextLoad ? undefined : path);

  const { addRecentFile } = useRecentFiles();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Auto-save state for markdown files
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  const favorite = isFavorite(path);

  // Reset state when path changes
  useEffect(() => {
    setSaveStatus("saved");
    lastSavedContentRef.current = content || "";
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  }, [path, content]);

  // Auto-save function
  const saveContent = useCallback(async (contentToSave: string) => {
    if (contentToSave === lastSavedContentRef.current) return;

    setSaveStatus("saving");
    try {
      await invoke("write_file", { path, content: contentToSave });
      lastSavedContentRef.current = contentToSave;
      setSaveStatus("saved");
    } catch (err) {
      showToast(`Failed to save: ${err}`, "error");
      setSaveStatus("unsaved");
    }
  }, [path]);

  // Handle content change with debounced auto-save
  const handleContentChange = useCallback((newContent: string) => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Mark as unsaved
    if (newContent !== lastSavedContentRef.current) {
      setSaveStatus("unsaved");
    }

    // Debounce save - wait 1 second after user stops typing
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Add to recent files when opened
  useEffect(() => {
    // For images, add immediately. For text files, wait for content
    if (fileType === "image" || (content !== undefined && !isLoading && !isError)) {
      addRecentFile(path, filename, false);
    }
  }, [path, content, isLoading, isError, addRecentFile, filename, fileType]);

  // Handle toast display
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  };

  // Handle favorite toggle
  const handleToggleFavorite = () => {
    toggleFavorite(path, filename, false);
    showToast(favorite ? "Removed from favorites" : "Added to favorites", "success");
  };

  // File-type-specific action handlers (placeholder - API integration needed)
  const handleGenerateImage = () => {
    showToast("Image generation coming soon", "success");
  };

  const handleGenerateImageWithLogo = () => {
    showToast("Image generation with logo coming soon", "success");
  };

  const handleGenerateDeck = () => {
    showToast("Deck generation coming soon", "success");
  };

  const handleGenerateVideo = () => {
    showToast("Video generation coming soon", "success");
  };

  // Handle delete
  const handleDelete = async () => {
    const confirmed = await confirm(`Are you sure you want to delete "${filename}"?`, {
      title: "Delete File",
      kind: "warning",
    });

    if (confirmed) {
      try {
        await invoke("delete_file", { path });
        showToast("File deleted", "success");
        // Navigate to parent folder
        const parentPath = path.split("/").slice(0, -1).join("/");
        onNavigate(parentPath || basePath);
      } catch (err) {
        showToast(`Failed to delete: ${err}`, "error");
      }
    }
  };

  // Header with breadcrumbs and actions
  const renderHeader = () => (
    <div className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800">
      <div className="flex items-center justify-between px-4 py-2">
        <Breadcrumbs
          path={path}
          basePath={basePath}
          onNavigate={onNavigate}
          isFile={true}
        />
        <FileActions
          path={path}
          isDirectory={false}
          isFavorite={favorite}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDelete}
          onShowToast={showToast}
          onGenerateImage={handleGenerateImage}
          onGenerateImageWithLogo={handleGenerateImageWithLogo}
          onGenerateDeck={handleGenerateDeck}
          onGenerateVideo={handleGenerateVideo}
        />
      </div>
    </div>
  );

  // Toast notification
  const renderToast = () => {
    if (!toast) return null;
    return (
      <div
        className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity ${
          toast.type === "success" ? "bg-teal-900 text-teal-100" : "bg-red-900 text-red-100"
        }`}
      >
        {toast.message}
      </div>
    );
  };

  // Image files - handle separately (binary loading)
  if (fileType === "image") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <ImageViewer path={path} filename={filename} />
        </div>
        {renderToast()}
      </div>
    );
  }

  // PDF files - handle separately (binary loading)
  if (fileType === "pdf") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <PDFViewer path={path} filename={filename} />
        </div>
        {renderToast()}
      </div>
    );
  }

  // Loading state for text files
  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText size={32} className="mx-auto mb-3 text-zinc-600 animate-pulse" />
            <p className="text-sm text-zinc-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
            <p className="text-sm text-red-400">Failed to load file</p>
            <p className="text-xs text-zinc-500 mt-1">{String(error)}</p>
          </div>
        </div>
        {renderToast()}
      </div>
    );
  }

  if (!content) {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText size={32} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-sm text-zinc-500">Empty file</p>
          </div>
        </div>
        {renderToast()}
      </div>
    );
  }

  // Render based on file type
  if (fileType === "markdown") {
    return (
      <div className="h-full flex flex-col">
        {/* Header with breadcrumbs and actions */}
        <div className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <Breadcrumbs
                path={path}
                basePath={basePath}
                onNavigate={onNavigate}
                isFile={true}
              />
              {/* Auto-save status */}
              <span className={`text-xs ${
                saveStatus === "saving" ? "text-zinc-500" :
                saveStatus === "unsaved" ? "text-amber-500" :
                "text-zinc-600"
              }`}>
                {saveStatus === "saving" ? "Saving..." :
                 saveStatus === "unsaved" ? "Unsaved" :
                 "Saved"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FileActions
                path={path}
                isDirectory={false}
                isFavorite={favorite}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
                onShowToast={showToast}
                onGenerateImage={handleGenerateImage}
                onGenerateImageWithLogo={handleGenerateImageWithLogo}
                onGenerateDeck={handleGenerateDeck}
                onGenerateVideo={handleGenerateVideo}
              />
            </div>
          </div>
        </div>

        {/* TipTap Editor - always editable */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            key={path}
            content={content}
            onChange={handleContentChange}
          />
        </div>
        {renderToast()}
      </div>
    );
  }

  if (fileType === "json") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <JSONEditor
            key={path}
            content={content}
            filename={filename}
            onChange={handleContentChange}
            saveStatus={saveStatus}
          />
        </div>
        {renderToast()}
      </div>
    );
  }

  if (fileType === "sql") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <SQLEditor
            key={path}
            content={content}
            filename={filename}
            onChange={handleContentChange}
            saveStatus={saveStatus}
          />
        </div>
        {renderToast()}
      </div>
    );
  }

  if (fileType === "csv") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <CSVViewer content={content} filename={filename} />
        </div>
        {renderToast()}
      </div>
    );
  }

  if (fileType === "html") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <HTMLViewer content={content} filename={filename} />
        </div>
        {renderToast()}
      </div>
    );
  }

  if (fileType === "code") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800">
              <FileCode size={16} className="text-zinc-500" />
              <span className="text-sm text-zinc-400">{filename}</span>
              <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded ml-auto">
                {getLanguage(path)}
              </span>
            </div>
            <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">
              {content}
            </pre>
          </div>
        </div>
        {renderToast()}
      </div>
    );
  }

  // Plain text fallback
  return (
    <div className="h-full flex flex-col">
      {renderHeader()}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800">
            <FileText size={16} className="text-zinc-500" />
            <span className="text-sm text-zinc-400">{filename}</span>
          </div>
          <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      </div>
      {renderToast()}
    </div>
  );
}
