// src/modules/library/FileViewer.tsx

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { FileText, FileCode, AlertCircle, RefreshCw, MessageSquare } from "lucide-react";
import { useReadFile } from "../../hooks/useFiles";
import { useQueryClient } from "@tanstack/react-query";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { useFavorites } from "../../hooks/useFavorites";
import { useJobsStore } from "../../stores/jobsStore";
import { useTabStore } from "../../stores/tabStore";
import { MarkdownEditor } from "./MarkdownEditor";
import { Breadcrumbs } from "./Breadcrumbs";
import { FileActions } from "./FileActions";
import { JSONEditor, SQLEditor, ImageViewer, CSVViewer, HTMLViewer, PDFViewer, ExcalidrawViewer } from "./viewers";
import { ImageEditor } from "../gallery/ImageEditor";
import { ExcalidrawEditor } from "../gallery/ExcalidrawEditor";
import { IntercomModal } from "./IntercomModal";
import { PortalPublishModal } from "./PortalPublishModal";
import { buildDomainUrl, getDomainLinkLabel } from "../../lib/domainUrl";
import { formatError } from "../../lib/formatError";
import { supabase } from "../../lib/supabase";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import { workspaceLocalStorage } from "../../lib/workspaceScopedStorage";
import { useNotificationNavStore } from "../../stores/notificationNavStore";

interface FileViewerProps {
  path: string;
  basePath: string;
  onNavigate: (path: string) => void;
}

// File type detection
type FileType = "markdown" | "json" | "sql" | "csv" | "image" | "html" | "excel" | "pdf" | "excalidraw" | "code" | "text";

function getFileType(path: string): FileType {
  const lowerPath = path.toLowerCase();
  const ext = lowerPath.split(".").pop() || "";

  // Check by extension (excalidraw before json since .excalidraw is technically JSON)
  if (ext === "excalidraw" || lowerPath.endsWith(".excalidraw.json")) return "excalidraw";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "json";
  if (ext === "sql") return "sql";
  if (ext === "csv") return "csv";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "xlsx" || ext === "xls") return "excel";
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

// Frontmatter helpers for intercom_article_id
function addFrontmatterField(content: string, key: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (fmMatch) {
    // Remove existing field if present, then add before closing ---
    const yaml = fmMatch[2].replace(new RegExp(`^${key}:.*$\\n?`, "m"), "");
    return `${fmMatch[1]}${yaml.trimEnd()}\n${key}: "${value}"${fmMatch[3]}${content.slice(fmMatch[0].length)}`;
  }
  // No frontmatter - prepend one
  return `---\n${key}: "${value}"\n---\n${content}`;
}

function removeFrontmatterField(content: string, key: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;
  const yaml = fmMatch[2].replace(new RegExp(`^${key}:.*$\\n?`, "m"), "");
  return `${fmMatch[1]}${yaml.trimEnd()}${fmMatch[3]}${content.slice(fmMatch[0].length)}`;
}

export function FileViewer({ path, basePath, onNavigate }: FileViewerProps) {
  const fileType = getFileType(path);
  const filename = getFileName(path);

  // Skip text content loading for binary files (images, PDFs, Excel)
  const skipTextLoad = fileType === "image" || fileType === "pdf" || fileType === "excel";
  const { data: content, isLoading, isError, error } = useReadFile(skipTextLoad ? undefined : path);

  const { addRecentFile } = useRecentFiles();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [intercomModalOpen, setIntercomModalOpen] = useState(false);
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showDiscussions, setShowDiscussions] = useState(false);

  // Discussion panel — entity_id is relative path from knowledge base root
  const relativePath = useMemo(() => {
    if (basePath && path.startsWith(basePath)) {
      return path.slice(basePath.length + 1);
    }
    return path;
  }, [path, basePath]);
  const { data: discussionCount } = useDiscussionCount("file", relativePath);

  // Auto-save state for markdown files
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  const pinTab = useTabStore((s) => s.pinTab);
  const queryClient = useQueryClient();
  const favorite = isFavorite(path);

  // Manual refresh — re-fetch file content from disk
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["file", path] });
    queryClient.invalidateQueries({ queryKey: ["fileInfo", path] });
    setRefreshKey((k) => k + 1);
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, [queryClient, path]);

  // Domain URL for "Open in VAL" action
  const domainUrl = useMemo(() => buildDomainUrl(path), [path]);
  const domainLabel = useMemo(() => getDomainLinkLabel(path), [path]);

  // Extract intercom_article_id from frontmatter
  const intercomArticleId = useMemo(() => {
    if (!content) return undefined;
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return undefined;
    const yaml = match[1];
    const idMatch = yaml.match(/^intercom_article_id:\s*["']?([^"'\n]+)["']?\s*$/m);
    return idMatch ? idMatch[1].trim() : undefined;
  }, [content]);

  // Extract portal_doc_id from frontmatter (markdown) or localStorage (html/excel)
  const portalDocId = useMemo(() => {
    if (fileType === "html" || fileType === "excel") {
      return workspaceLocalStorage.get(`portal_doc_id:${path}`) || undefined;
    }
    if (!content) return undefined;
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return undefined;
    const yaml = match[1];
    const idMatch = yaml.match(/^portal_doc_id:\s*["']?([^"'\n]+)["']?\s*$/m);
    return idMatch ? idMatch[1].trim() : undefined;
  }, [content, fileType, path]);

  // Handle intercom publish: add intercom_article_id to frontmatter
  const handleIntercomPublished = useCallback(async (articleId: string, _articleUrl: string) => {
    if (!content) return;
    const updated = addFrontmatterField(content, "intercom_article_id", articleId);
    try {
      await invoke("write_file", { path, content: updated });
      lastSavedContentRef.current = updated;
      showToast("Published to Help Center", "success");
    } catch (err) {
      showToast(`Failed to update frontmatter: ${err}`, "error");
    }
  }, [content, path]);

  // Handle intercom delete: remove intercom_article_id from frontmatter
  const handleIntercomDeleted = useCallback(async () => {
    if (!content) return;
    const updated = removeFrontmatterField(content, "intercom_article_id");
    try {
      await invoke("write_file", { path, content: updated });
      lastSavedContentRef.current = updated;
      showToast("Article deleted from Help Center", "success");
    } catch (err) {
      showToast(`Failed to update frontmatter: ${err}`, "error");
    }
  }, [content, path]);

  // Handle portal publish: add portal_doc_id, portal_domain, portal_doc_type to frontmatter (or localStorage for non-md)
  const handlePortalPublished = useCallback(async (docId: string, domain: string | null, docType: string) => {
    if (fileType === "html" || fileType === "excel") {
      workspaceLocalStorage.set(`portal_doc_id:${path}`, docId);
      showToast("Published to Portal", "success");
      return;
    }
    if (!content) return;
    let updated = addFrontmatterField(content, "portal_doc_id", docId);
    if (domain) {
      updated = addFrontmatterField(updated, "portal_domain", domain);
    }
    updated = addFrontmatterField(updated, "portal_doc_type", docType);
    try {
      await invoke("write_file", { path, content: updated });
      lastSavedContentRef.current = updated;
      showToast("Published to Portal", "success");
    } catch (err) {
      showToast(`Failed to update frontmatter: ${err}`, "error");
    }
  }, [content, path, fileType]);

  // Handle portal delete: remove portal fields from frontmatter (or localStorage for non-md)
  const handlePortalDeleted = useCallback(async () => {
    if (fileType === "html" || fileType === "excel") {
      workspaceLocalStorage.remove(`portal_doc_id:${path}`);
      showToast("Removed from Portal", "success");
      return;
    }
    if (!content) return;
    let updated = removeFrontmatterField(content, "portal_doc_id");
    updated = removeFrontmatterField(updated, "portal_domain");
    updated = removeFrontmatterField(updated, "portal_doc_type");
    try {
      await invoke("write_file", { path, content: updated });
      lastSavedContentRef.current = updated;
      showToast("Removed from Portal", "success");
    } catch (err) {
      showToast(`Failed to update frontmatter: ${err}`, "error");
    }
  }, [content, path, fileType]);

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

    // Mark as unsaved and auto-pin tab on edit
    if (newContent !== lastSavedContentRef.current) {
      setSaveStatus("unsaved");
      pinTab(path);
    }

    // Debounce save - wait 1 second after user stops typing
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent, pinTab, path]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-open discussion panel when navigated from a notification
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);

  // Reset edit mode and close discussions when file changes
  // But if there's a nav target for this file, open discussions instead
  useEffect(() => {
    setEditMode(false);
    if (navTarget?.entityType === "file" && navTarget.openDiscussion && navTarget.entityId === relativePath) {
      setShowDiscussions(true);
      clearNavTarget();
    } else {
      setShowDiscussions(false);
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

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
        message: formatError(err)
      });
      showToast(`Generation failed: ${formatError(err)}`, "error");
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

      updateJob(jobId, { progress: 5, message: "Reading config..." });

      // Parse .gamma.json config to get options and source file
      let gammaConfig: Record<string, unknown> = {};
      let inputText = "";

      try {
        gammaConfig = JSON.parse(content || "{}");
      } catch {
        throw new Error("Invalid .gamma.json file");
      }

      // Read the source markdown file referenced in config
      const sourceFile = gammaConfig.source as string | undefined;
      if (sourceFile) {
        const dir = path.substring(0, path.lastIndexOf("/"));
        const sourcePath = `${dir}/${sourceFile}`;
        try {
          inputText = await invoke<string>("read_file", { path: sourcePath });
        } catch {
          throw new Error(`Source file not found: ${sourceFile}`);
        }
      }

      if (!inputText.trim()) {
        throw new Error("No content to generate. Set \"source\" in .gamma.json pointing to a markdown file.");
      }

      // Build options matching Rust GammaGenerationOptions (camelCase via serde)
      const options: Record<string, unknown> = {};
      if (gammaConfig.core) {
        const core = gammaConfig.core as Record<string, unknown>;
        if (core.text_mode) options.textMode = core.text_mode;
        if (core.format) options.format = core.format;
        if (core.num_cards) options.numCards = core.num_cards;
      }
      if (gammaConfig.text) {
        const text = gammaConfig.text as Record<string, unknown>;
        const textOptions: Record<string, unknown> = {};
        if (text.amount) textOptions.amount = text.amount;
        if (text.language) textOptions.language = text.language;
        if (Object.keys(textOptions).length > 0) options.textOptions = textOptions;
      }
      if (gammaConfig.image) {
        const image = gammaConfig.image as Record<string, unknown>;
        const imageOptions: Record<string, unknown> = {};
        if (image.source) imageOptions.source = image.source;
        if (Object.keys(imageOptions).length > 0) options.imageOptions = imageOptions;
      }
      if (gammaConfig.theme) {
        const theme = gammaConfig.theme as Record<string, unknown>;
        if (theme.theme_id) options.themeId = theme.theme_id;
      }
      if (gammaConfig.instructions) {
        options.additionalInstructions = gammaConfig.instructions;
      }

      updateJob(jobId, { progress: 10, message: "Submitting to Gamma..." });

      // Create generation request (returns generation ID as plain string)
      const generationId = await invoke<string>("gamma_create_generation", {
        apiKey,
        inputText,
        options,
      });

      updateJob(jobId, { progress: 20, message: "Processing..." });

      // Poll for status with progress updates
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max
      let gammaUrl: string | null = null;

      while (attempts < maxAttempts) {
        const status = await invoke<{ status: string; gammaUrl?: string; message?: string }>(
          "gamma_get_status",
          { apiKey, generationId }
        );

        // Update progress (20-90% during processing)
        const progress = Math.min(20 + Math.floor((attempts / maxAttempts) * 70), 90);
        updateJob(jobId, { progress, message: `Processing... (${status.status})` });

        if (status.status === "completed") {
          gammaUrl = status.gammaUrl || null;
          break;
        } else if (status.status === "failed" || status.status === "error") {
          throw new Error(status.message || "Generation failed");
        }

        // Wait 5 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      }

      if (!gammaUrl) {
        throw new Error(attempts >= maxAttempts ? "Generation timed out" : "Generation completed but no URL returned");
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
        message: formatError(err)
      });
      showToast(`Generation failed: ${formatError(err)}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = () => {
    showToast("Video generation coming soon", "success");
  };

  // Handle PDF export for order forms, proposals, and HTML files
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

      // Determine file type and call appropriate command
      const lowerFilename = filename.toLowerCase();
      const isOrderForm = lowerFilename === "order-form-data.md";
      const isHtml = lowerFilename.endsWith(".html") || lowerFilename.endsWith(".htm");

      const command = isHtml
        ? "html_to_pdf_cmd"
        : isOrderForm
        ? "generate_order_form_pdf_cmd"
        : "generate_proposal_pdf_cmd";

      // Call the appropriate Rust command
      const outputPath = await invoke<string>(command, { filePath: path });

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
        message: formatError(err)
      });
      showToast(`PDF export failed: ${formatError(err)}`, "error");
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
  const renderHeader = (opts: boolean | { showSaveStatus?: boolean; editAction?: () => void } = false) => {
    const showSaveStatus = typeof opts === "boolean" ? opts : opts.showSaveStatus ?? false;
    const editAction = typeof opts === "boolean" ? undefined : opts.editAction;
    return (
    <div className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <Breadcrumbs
            path={path}
            basePath={basePath}
            onNavigate={onNavigate}
            isFile={true}
          />
          {showSaveStatus && (
            <span className={`text-xs ${
              saveStatus === "saving" ? "text-zinc-500" :
              saveStatus === "unsaved" ? "text-amber-500" :
              "text-zinc-500 dark:text-zinc-600"
            }`}>
              {saveStatus === "saving" ? "Saving..." :
               saveStatus === "unsaved" ? "Unsaved" :
               "Saved"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editAction && (
            <button
              onClick={editAction}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => setShowDiscussions(!showDiscussions)}
            title="Discussion"
            className={`relative p-1.5 rounded-md transition-colors ${
              showDiscussions
                ? "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            }`}
          >
            <MessageSquare size={15} />
            {(discussionCount ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-bold bg-teal-600 text-white rounded-full px-0.5">
                {discussionCount}
              </span>
            )}
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh file content"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
          <FileActions
            path={path}
            basePath={basePath}
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
            onPublishIntercom={() => setIntercomModalOpen(true)}
            onPublishPortal={() => setPortalModalOpen(true)}
            isGeneratingImage={isGenerating}
            isGeneratingDeck={isGenerating}
            isExportingPdf={isGenerating}
          />
        </div>
      </div>
    </div>
  ); };

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
    if (editMode) {
      const galleryItem = {
        file_path: path,
        file_name: filename,
        relative_path: path.replace(basePath + "/", ""),
        folder: path.substring(0, path.lastIndexOf("/")).replace(basePath + "/", ""),
        extension: filename.split(".").pop()?.toLowerCase() ?? "",
        size_bytes: 0,
        modified: "",
        gallery_type: "image" as const,
      };
      return <ImageEditor item={galleryItem} onBack={() => { setEditMode(false); setRefreshKey(k => k + 1); }} />;
    }
    return (
      <div className="h-full flex flex-col">
        {renderHeader({ editAction: () => setEditMode(true) })}
        <div className="flex-1 overflow-hidden">
          <ImageViewer path={path} filename={filename} refreshKey={refreshKey} />
        </div>
        {renderToast()}
      </div>
    );
  }

  // Excel files - handle separately (binary loading)
  if (fileType === "excel") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <ExcelViewer path={path} filename={filename} />
        </div>
        {renderToast()}
        <PortalPublishModal
          isOpen={portalModalOpen}
          onClose={() => setPortalModalOpen(false)}
          filePath={path}
          content=""
          filename={filename}
          portalDocId={portalDocId}
          onPublished={handlePortalPublished}
          onDeleted={handlePortalDeleted}
        />
      </div>
    );
  }

  // PDF files - handle separately (binary loading)
  if (fileType === "pdf") {
    return (
      <div className="h-full flex flex-col">
        {renderHeader()}
        <div className="flex-1 overflow-hidden">
          <PDFViewer path={path} filename={filename} refreshKey={refreshKey} />
        </div>
        {renderToast()}
      </div>
    );
  }

  // Loading state for text files
  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
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
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
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
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
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
  // Wrapper for content + discussion sidebar
  const renderWithDiscussions = (children: React.ReactNode) => (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-hidden">{children}</div>
      {showDiscussions && (
        <div className="w-[320px] flex-shrink-0">
          <DiscussionPanel
            entityType="file"
            entityId={relativePath}
            onClose={() => setShowDiscussions(false)}
          />
        </div>
      )}
    </div>
  );

  if (fileType === "markdown") {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader(true)}

        {/* TipTap Editor + optional discussion sidebar */}
        {renderWithDiscussions(
          <MarkdownEditor
            key={path}
            content={content}
            onChange={handleContentChange}
          />
        )}
        {renderToast()}
        <IntercomModal
          isOpen={intercomModalOpen}
          onClose={() => setIntercomModalOpen(false)}
          filePath={path}
          content={content}
          filename={filename}
          intercomArticleId={intercomArticleId}
          onPublished={handleIntercomPublished}
          onDeleted={handleIntercomDeleted}
        />
        <PortalPublishModal
          isOpen={portalModalOpen}
          onClose={() => setPortalModalOpen(false)}
          filePath={path}
          content={content}
          filename={filename}
          portalDocId={portalDocId}
          onPublished={handlePortalPublished}
          onDeleted={handlePortalDeleted}
        />
      </div>
    );
  }

  if (fileType === "json") {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader(true)}
        {renderWithDiscussions(
          <JSONEditor
            key={path}
            content={content}
            filename={filename}
            onChange={handleContentChange}
            saveStatus={saveStatus}
          />
        )}
        {renderToast()}
      </div>
    );
  }

  if (fileType === "sql") {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader(true)}
        {renderWithDiscussions(
          <SQLEditor
            key={path}
            content={content}
            filename={filename}
            onChange={handleContentChange}
            saveStatus={saveStatus}
          />
        )}
        {renderToast()}
      </div>
    );
  }

  if (fileType === "csv") {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader()}
        {renderWithDiscussions(
          <CSVViewer content={content} filename={filename} />
        )}
        {renderToast()}
      </div>
    );
  }

  if (fileType === "html") {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader()}
        {renderWithDiscussions(
          <HTMLViewer content={content} filename={filename} refreshKey={refreshKey} />
        )}
        {renderToast()}
        <PortalPublishModal
          isOpen={portalModalOpen}
          onClose={() => setPortalModalOpen(false)}
          filePath={path}
          content={content}
          filename={filename}
          portalDocId={portalDocId}
          onPublished={handlePortalPublished}
          onDeleted={handlePortalDeleted}
        />
      </div>
    );
  }

  if (fileType === "excalidraw") {
    if (editMode) {
      const galleryItem = {
        file_path: path,
        file_name: filename,
        relative_path: path.replace(basePath + "/", ""),
        folder: path.substring(0, path.lastIndexOf("/")).replace(basePath + "/", ""),
        extension: "excalidraw",
        size_bytes: 0,
        modified: "",
        gallery_type: "excalidraw" as const,
      };
      return <ExcalidrawEditor item={galleryItem} onBack={() => { setEditMode(false); setRefreshKey(k => k + 1); }} />;
    }
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader({ editAction: () => setEditMode(true) })}
        <div className="flex-1 overflow-hidden">
          <ExcalidrawViewer content={content} filename={filename} />
        </div>
        {renderToast()}
      </div>
    );
  }

  if (fileType === "code") {
    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {renderHeader()}
        {renderWithDiscussions(
          <div className="h-full overflow-auto">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <FileCode size={16} className="text-zinc-500" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-600 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded ml-auto">
                  {getLanguage(path)}
                </span>
              </div>
              <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {content}
              </pre>
            </div>
          </div>
        )}
        {renderToast()}
      </div>
    );
  }

  // Plain text fallback
  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {renderHeader()}
      {renderWithDiscussions(
        <div className="h-full overflow-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <FileText size={16} className="text-zinc-500" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
            </div>
            <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {content}
            </pre>
          </div>
        </div>
      )}
      {renderToast()}
    </div>
  );
}

// Excel viewer component - uploads to temp storage and uses Office Online viewer
function ExcelViewer({ path, filename }: { path: string; filename: string }) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const storagePathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const base64 = await invoke<string>("read_file_binary", { path });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        // Upload to temp path in portal-reports bucket
        const tempPath = `_temp/${Date.now()}-${filename}`;
        const { error: uploadErr } = await supabase.storage
          .from("portal-reports")
          .upload(tempPath, bytes, {
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: true,
          });
        if (uploadErr) throw new Error(uploadErr.message);
        if (cancelled) return;

        storagePathRef.current = tempPath;
        const { data: urlData } = supabase.storage
          .from("portal-reports")
          .getPublicUrl(tempPath);

        const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(urlData.publicUrl)}`;
        if (!cancelled) setViewerUrl(officeUrl);
      } catch (err) {
        if (!cancelled) setError(formatError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Clean up temp file
      if (storagePathRef.current) {
        supabase.storage.from("portal-reports").remove([storagePathRef.current]);
      }
    };
  }, [path, filename]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText size={32} className="mx-auto mb-3 text-zinc-400 dark:text-zinc-600 animate-pulse" />
          <p className="text-sm text-zinc-500">Loading spreadsheet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-500 dark:text-red-400">Failed to load spreadsheet</p>
          <p className="text-xs text-zinc-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {viewerUrl && (
        <iframe
          src={viewerUrl}
          title={filename}
          className="block h-full w-full border-0"
        />
      )}
    </div>
  );
}
