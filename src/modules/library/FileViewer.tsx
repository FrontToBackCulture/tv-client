// src/modules/library/FileViewer.tsx

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FileText, FileCode, AlertCircle } from "lucide-react";
import { useReadFile } from "../../hooks/useFiles";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { useFavorites } from "../../hooks/useFavorites";
import { useJobsStore } from "../../stores/jobsStore";
import { MarkdownEditor } from "./MarkdownEditor";
import { Breadcrumbs } from "./Breadcrumbs";
import { FileActions } from "./FileActions";
import { JSONEditor, SQLEditor, ImageViewer, CSVViewer, HTMLViewer, PDFViewer } from "./viewers";
import { buildDomainUrl, getDomainLinkLabel } from "../../lib/domainUrl";

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
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-save state for markdown files
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  const favorite = isFavorite(path);

  // Domain URL for "Open in VAL" action
  const domainUrl = useMemo(() => buildDomainUrl(path), [path]);
  const domainLabel = useMemo(() => getDomainLinkLabel(path), [path]);

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

  // Jobs store for background task tracking
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);

  // File-type-specific action handlers
  const handleGenerateImage = async () => {
    if (isGenerating) return;

    const jobId = `nanobanana-${Date.now()}`;
    const jobName = `Generate: ${filename}`;

    try {
      setIsGenerating(true);

      // Add job to monitoring
      addJob({
        id: jobId,
        name: jobName,
        status: "running",
        message: "Checking API key...",
      });

      // Get API key from settings
      const apiKey = await invoke<string | null>("settings_get_gemini_key");
      if (!apiKey) {
        updateJob(jobId, {
          status: "failed",
          message: "Gemini API key not set"
        });
        showToast("Gemini API key not set. Go to Settings (⌘,) to add it.", "error");
        return;
      }

      updateJob(jobId, { message: "Generating image with Gemini..." });

      // Generate image from the file (reads prompt from frontmatter/JSON)
      const outputPath = await invoke<string>("nanobanana_generate_from_file", {
        apiKey,
        filePath: path,
      });

      const outputFilename = outputPath.split("/").pop();
      updateJob(jobId, {
        status: "completed",
        message: `Saved: ${outputFilename}`
      });
      showToast(`Image saved: ${outputFilename}`, "success");
    } catch (err) {
      updateJob(jobId, {
        status: "failed",
        message: String(err)
      });
      showToast(`Generation failed: ${err}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImageWithLogo = async () => {
    // TODO: Implement with reference image support
    showToast("Image with logo - coming soon", "success");
  };

  const handleGenerateDeck = async () => {
    if (isGenerating) return;

    const jobId = `gamma-${Date.now()}`;
    const jobName = `Deck: ${filename}`;

    try {
      setIsGenerating(true);

      // Add job to monitoring
      addJob({
        id: jobId,
        name: jobName,
        status: "running",
        progress: 0,
        message: "Checking API key...",
      });

      // Get API key from settings
      const apiKey = await invoke<string | null>("settings_get_gamma_key");
      if (!apiKey) {
        updateJob(jobId, {
          status: "failed",
          message: "Gamma API key not set"
        });
        showToast("Gamma API key not set. Go to Settings (⌘,) to add it.", "error");
        return;
      }

      updateJob(jobId, { progress: 10, message: "Submitting to Gamma..." });

      // Read file content
      const fileContent = content || "";

      // Create generation request first
      const createResult = await invoke<{ generation_id: string }>("gamma_create_generation", {
        apiKey,
        inputText: fileContent,
        options: {
          format: "presentation",
          num_cards: 10,
        },
      });

      updateJob(jobId, { progress: 20, message: "Processing..." });

      // Poll for status with progress updates
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max
      let gammaUrl: string | null = null;

      while (attempts < maxAttempts) {
        const status = await invoke<{ status: string; gamma_url?: string; error_message?: string }>(
          "gamma_get_status",
          { apiKey, generationId: createResult.generation_id }
        );

        // Update progress (20-90% during processing)
        const progress = Math.min(20 + Math.floor((attempts / maxAttempts) * 70), 90);
        updateJob(jobId, { progress, message: `Processing... (${status.status})` });

        if (status.status === "completed" && status.gamma_url) {
          gammaUrl = status.gamma_url;
          break;
        } else if (status.status === "failed") {
          throw new Error(status.error_message || "Generation failed");
        }

        // Wait 5 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      }

      if (!gammaUrl) {
        throw new Error("Generation timed out");
      }

      updateJob(jobId, {
        status: "completed",
        progress: 100,
        message: "Opening presentation..."
      });
      showToast("Presentation created!", "success");

      // Open the Gamma URL
      await invoke("open_with_default_app", { path: gammaUrl });
    } catch (err) {
      updateJob(jobId, {
        status: "failed",
        message: String(err)
      });
      showToast(`Generation failed: ${err}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = () => {
    showToast("Video generation coming soon", "success");
  };

  // Handle PDF export for order forms and proposals
  const handleExportPdf = async () => {
    if (isGenerating) return;

    const jobId = `pdf-${Date.now()}`;
    const jobName = `PDF: ${filename}`;

    try {
      setIsGenerating(true);

      // Add job to monitoring
      addJob({
        id: jobId,
        name: jobName,
        status: "running",
        message: "Generating PDF...",
      });

      // Determine if this is an order form or proposal
      const isOrderForm = filename.toLowerCase() === "order-form-data.md";

      // Call the appropriate Rust command
      const outputPath = await invoke<string>(
        isOrderForm ? "generate_order_form_pdf_cmd" : "generate_proposal_pdf_cmd",
        { filePath: path }
      );

      const outputFilename = outputPath.split("/").pop();
      updateJob(jobId, {
        status: "completed",
        message: `Saved: ${outputFilename}`
      });
      showToast(`PDF saved: ${outputFilename}`, "success");

      // Open the generated PDF
      await invoke("open_with_default_app", { path: outputPath });
    } catch (err) {
      updateJob(jobId, {
        status: "failed",
        message: String(err)
      });
      showToast(`PDF export failed: ${err}`, "error");
    } finally {
      setIsGenerating(false);
    }
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
    <div className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
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
          domainUrl={domainUrl}
          domainLabel={domainLabel}
          onGenerateImage={handleGenerateImage}
          onGenerateImageWithLogo={handleGenerateImageWithLogo}
          onGenerateDeck={handleGenerateDeck}
          onGenerateVideo={handleGenerateVideo}
          onExportPdf={handleExportPdf}
          isGeneratingImage={isGenerating}
          isGeneratingDeck={isGenerating}
          isExportingPdf={isGenerating}
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
          toast.type === "success" ? "bg-teal-600 dark:bg-teal-900 text-white dark:text-teal-100" : "bg-red-600 dark:bg-red-900 text-white dark:text-red-100"
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600 animate-pulse" />
            <p className="text-sm text-zinc-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
            <p className="text-sm text-red-500 dark:text-red-400">Failed to load file</p>
            <p className="text-xs text-zinc-500 mt-1">{String(error)}</p>
          </div>
        </div>
        {renderToast()}
      </div>
    );
  }

  if (!content) {
    return (
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600" />
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
        {/* Header with breadcrumbs and actions */}
        <div className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
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
                "text-zinc-500 dark:text-zinc-600"
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
                domainUrl={domainUrl}
                domainLabel={domainLabel}
                onGenerateImage={handleGenerateImage}
                onGenerateImageWithLogo={handleGenerateImageWithLogo}
                onGenerateDeck={handleGenerateDeck}
                onGenerateVideo={handleGenerateVideo}
                onExportPdf={handleExportPdf}
                isGeneratingImage={isGenerating}
                isGeneratingDeck={isGenerating}
                isExportingPdf={isGenerating}
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
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
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
        {renderHeader()}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-zinc-800">
              <FileCode size={16} className="text-zinc-500" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-600 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded ml-auto">
                {getLanguage(path)}
              </span>
            </div>
            <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
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
    <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
      {renderHeader()}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-zinc-800">
            <FileText size={16} className="text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
          </div>
          <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      </div>
      {renderToast()}
    </div>
  );
}
