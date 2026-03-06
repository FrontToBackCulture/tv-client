// src/modules/product/DomainReportsTab.tsx
// Reports tab for domain detail panel — lists report folders and files from {domain}/reports/

import { useState, useMemo, useCallback } from "react";
import {
  Folder,
  FileText,
  ChevronRight,
  FileBarChart,
  Loader2,
  List,
  LayoutGrid,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useListDirectory, useReadFile, type FileEntry } from "../../hooks/useFiles";
import { useSidePanelStore } from "../../stores/sidePanelStore";

interface DomainReportsTabProps {
  reportsPath: string; // e.g. /path/to/domain/reports
  domainName: string;
}

export function DomainReportsTab({ reportsPath, domainName }: DomainReportsTabProps) {
  const dirQuery = useListDirectory(reportsPath);
  const openPanel = useSidePanelStore((s) => s.openPanel);
  const [viewMode, setViewMode] = useState<"list" | "gallery">("gallery");
  const [galleryPreview, setGalleryPreview] = useState<string | null>(null);

  if (dirQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (dirQuery.isError || !dirQuery.data || dirQuery.data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 max-w-md text-center">
          <FileBarChart size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            No reports found
          </h3>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            No reports/ folder exists for {domainName}.
          </p>
        </div>
      </div>
    );
  }

  const entries = dirQuery.data;
  const folders = entries
    .filter((e) => e.is_directory && !e.name.startsWith("."))
    .sort((a, b) => b.name.localeCompare(a.name)); // newest first by name
  const files = entries
    .filter((e) => !e.is_directory && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalCount = folders.length + files.length;

  // Collect all HTML files (top-level + inside folders) for gallery
  const htmlFiles = files.filter(f => f.name.endsWith(".html"));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileBarChart size={14} className="text-teal-500" />
          <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Reports
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 tabular-nums">
            {totalCount} {totalCount === 1 ? "item" : "items"}
          </span>
          <div className="flex items-center rounded border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => { setViewMode("list"); setGalleryPreview(null); }}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
              )}
              title="List view"
            >
              <List size={13} />
            </button>
            <button
              onClick={() => { setViewMode("gallery"); setGalleryPreview(null); }}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "gallery" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
              )}
              title="Gallery view"
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        /* List view */
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
          {folders.map((folder) => (
            <ReportFolder key={folder.path} folder={folder} onOpenFile={openPanel} />
          ))}
          {files.map((file) => (
            <ReportFileRow key={file.path} file={file} onOpen={openPanel} />
          ))}
        </div>
      ) : galleryPreview ? (
        /* Gallery full preview */
        <ReportFullPreview filePath={galleryPreview} onBack={() => setGalleryPreview(null)} />
      ) : (
        /* Gallery grid */
        <div>
          {htmlFiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {htmlFiles.map(f => (
                <ReportThumbnail key={f.path} file={f} onClick={() => setGalleryPreview(f.path)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-zinc-400">
              No HTML reports found. Switch to list view to see all files.
            </div>
          )}
          {/* Non-HTML files below gallery */}
          {files.filter(f => !f.name.endsWith(".html")).length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Other Files</p>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {folders.map((folder) => (
                  <ReportFolder key={folder.path} folder={folder} onOpenFile={openPanel} />
                ))}
                {files.filter(f => !f.name.endsWith(".html")).map((file) => (
                  <ReportFileRow key={file.path} file={file} onOpen={openPanel} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportFolder({
  folder,
  onOpenFile,
}: {
  folder: FileEntry;
  onOpenFile: (path: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const childQuery = useListDirectory(expanded ? folder.path : undefined);

  const childFiles = (childQuery.data ?? [])
    .filter((e) => !e.is_directory && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
      >
        <ChevronRight
          size={14}
          className={cn(
            "text-zinc-400 transition-transform flex-shrink-0",
            expanded && "rotate-90"
          )}
        />
        <Folder size={16} className="text-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate block">
            {folder.name}
          </span>
          <span className="text-[11px] text-zinc-400">
            {folder.modified ? formatRelative(folder.modified) : ""}
            {expanded && childQuery.isSuccess && ` \u00B7 ${childFiles.length} files`}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="pl-11 pr-4 pb-2">
          {childQuery.isLoading && (
            <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              Loading...
            </div>
          )}
          {childQuery.isError && (
            <p className="text-xs text-zinc-400 py-2">Could not read folder</p>
          )}
          {childFiles.length > 0 && (
            <div className="space-y-0.5">
              {childFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onOpenFile(file.path, file.name)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left group"
                >
                  <FileText size={13} className="text-zinc-400 group-hover:text-teal-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate flex-1">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-zinc-400 tabular-nums flex-shrink-0">
                    {formatSize(file.size)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {childQuery.isSuccess && childFiles.length === 0 && (
            <p className="text-xs text-zinc-400 py-2">Empty folder</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReportFileRow({
  file,
  onOpen,
}: {
  file: FileEntry;
  onOpen: (path: string, name: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(file.path, file.name)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left group"
    >
      {/* Spacer to align with folder content (chevron width) */}
      <span className="w-[14px] flex-shrink-0" />
      <FileText size={16} className="text-zinc-400 group-hover:text-teal-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate block">
          {file.name}
        </span>
        <span className="text-[11px] text-zinc-400">
          {file.modified ? formatRelative(file.modified) : ""}
        </span>
      </div>
      <span className="text-xs text-zinc-400 tabular-nums flex-shrink-0">
        {formatSize(file.size)}
      </span>
    </button>
  );
}

function ReportThumbnail({ file, onClick }: { file: FileEntry; onClick: () => void }) {
  const { data: htmlContent } = useReadFile(file.path);

  const thumbSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const thumbStyle = `<style>body{margin:0!important;padding:0.5rem!important;overflow:hidden!important;pointer-events:none!important}body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}img,table,pre{max-width:100%!important}</style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${thumbStyle}</head>`);
    }
    return thumbStyle + htmlContent;
  }, [htmlContent]);

  return (
    <button
      onClick={onClick}
      className="group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all"
    >
      <div className="relative h-48 overflow-hidden bg-white">
        {thumbSrcDoc ? (
          <iframe
            srcDoc={thumbSrcDoc}
            className="w-[200%] h-[200%] border-0 origin-top-left pointer-events-none"
            style={{ transform: "scale(0.5)" }}
            tabIndex={-1}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={14} className="animate-spin text-zinc-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors" />
      </div>
      <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800/50">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{file.name}</p>
        <p className="text-[10px] text-zinc-400">{file.modified ? formatRelative(file.modified) : ""} · {formatSize(file.size)}</p>
      </div>
    </button>
  );
}

function ReportFullPreview({ filePath, onBack }: { filePath: string; onBack: () => void }) {
  const { data: htmlContent } = useReadFile(filePath);

  const iframeSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + htmlContent;
  }, [htmlContent]);

  const [iframeHeight, setIframeHeight] = useState(800);
  const iframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) setIframeHeight(doc.body.scrollHeight + 20);
      } catch { /* cross-origin */ }
    };
    iframe.addEventListener("load", handleLoad);
  }, []);

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-500 mb-3"
      >
        <ChevronRight size={12} className="rotate-180" />
        Back to gallery
      </button>
      {iframeSrcDoc ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <iframe
            ref={iframeRef}
            srcDoc={iframeSrcDoc}
            className="w-full border-0"
            sandbox="allow-scripts"
            style={{ height: iframeHeight }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-zinc-400" />
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
