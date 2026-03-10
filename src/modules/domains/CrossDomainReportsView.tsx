// src/modules/domains/CrossDomainReportsView.tsx
// Cross-domain reports: collapsible tree — Domain → Folder → HTML reports.
// Only loads folder contents on expand. HTML-only (no .md/.csv/.json noise).

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  FileBarChart,
  FileText,
  Search,
  X,
  Loader2,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Folder,
  FolderOpen,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { useRepository } from "../../stores/repositoryStore";
import { useDiscoverDomains } from "../../hooks/val-sync";
import { useFolderEntries, type FolderEntry } from "../../hooks/useFolderFiles";
import { useReadFile, type FileEntry } from "../../hooks/useFiles";
import { SectionLoading } from "../../components/ui/DetailStates";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DomainFolderInfo {
  domain: string;
  reportsPath: string;
  folders: { name: string; path: string }[];
  rootHtmlCount: number;
  totalHtmlCount: number;
}

interface ParsedSodReport {
  entry: FolderEntry;
  prefix: string;
  date: string;
  label: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CrossDomainReportsView() {
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/domains`
    : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  // SOD reports (global)
  const sodReportsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/sod-reports`
    : null;
  const { data: sodEntries } = useFolderEntries(sodReportsPath);

  // Domain folder index (lightweight — only lists folders, not files inside)
  const [domainFolders, setDomainFolders] = useState<DomainFolderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  // UI state
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [selectedSodFile, setSelectedSodFile] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Index: scan each domain's reports/ to find folders + count HTML files
  useEffect(() => {
    if (!domainsQuery.data || domainsQuery.data.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setLoadedCount(0);

    const indexAll = async () => {
      const results: DomainFolderInfo[] = [];
      const domains = domainsQuery.data;

      for (let i = 0; i < domains.length; i++) {
        if (cancelled) return;
        const domain = domains[i];
        const reportsPath = `${domain.global_path}/reports`;

        try {
          const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean; size: number; modified: string | null }>>(
            "list_directory",
            { path: reportsPath },
          );

          const folders = entries
            .filter((e) => e.is_directory && !e.name.startsWith("."))
            .sort((a, b) => b.name.localeCompare(a.name));
          const rootHtmlCount = entries.filter((e) => !e.is_directory && e.name.endsWith(".html")).length;

          // Quick count: scan subfolders for HTML file counts
          let subHtmlCount = 0;
          for (const folder of folders) {
            try {
              const children = await invoke<Array<{ name: string; is_directory: boolean }>>(
                "list_directory",
                { path: folder.path },
              );
              subHtmlCount += children.filter((c) => !c.is_directory && c.name.endsWith(".html")).length;
            } catch { /* skip */ }
          }

          const totalHtmlCount = rootHtmlCount + subHtmlCount;
          if (totalHtmlCount > 0 || folders.length > 0) {
            results.push({
              domain: domain.domain,
              reportsPath,
              folders: folders.map((f) => ({ name: f.name, path: f.path })),
              rootHtmlCount,
              totalHtmlCount,
            });
          }
        } catch {
          // No reports/ folder — skip
        }

        if (!cancelled) setLoadedCount(i + 1);
      }

      if (!cancelled) {
        setDomainFolders(results.sort((a, b) => a.domain.localeCompare(b.domain)));
        setLoading(false);
      }
    };

    indexAll();
    return () => { cancelled = true; };
  }, [domainsQuery.data]);

  // Parse SOD reports
  const sodReports = useMemo(() => {
    if (!sodEntries) return [];
    return sodEntries
      .filter((e) => !e.is_directory && e.name.endsWith(".html"))
      .map(parseSodFilename)
      .filter((r): r is ParsedSodReport => r !== null)
      .sort((a, b) => b.date.localeCompare(a.date) || a.prefix.localeCompare(b.prefix));
  }, [sodEntries]);

  // Filter
  const filteredDomains = useMemo(() => {
    const q = search.toLowerCase();
    return domainFolders.filter((d) => {
      if (domainFilter && d.domain !== domainFilter) return false;
      if (q && !d.domain.toLowerCase().includes(q) && !d.folders.some((f) => f.name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [domainFolders, search, domainFilter]);

  const domainsWithReports = useMemo(() => domainFolders.map((d) => d.domain), [domainFolders]);
  const totalHtml = domainFolders.reduce((sum, d) => sum + d.totalHtmlCount, 0);
  const totalDomains = domainsQuery.data?.length ?? 0;

  // SOD helpers
  const selectedSodReport = sodReports.find((r) => r.entry.path === selectedSodFile);
  const sodIframeSrc = selectedSodFile ? convertFileSrc(selectedSodFile) : null;
  const S3_BASE = "https://signalval.s3.ap-southeast-1.amazonaws.com/sod-reports";
  const s3Url = selectedSodReport ? `${S3_BASE}/${selectedSodReport.prefix}-${selectedSodReport.date}.html` : null;

  const handleCopySodUrl = useCallback(async () => {
    if (!s3Url) return;
    await navigator.clipboard.writeText(s3Url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [s3Url]);

  // ─── Full preview mode ──────────────────────────────────────────────────

  if (previewFile) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <button
            onClick={() => setPreviewFile(null)}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-500"
          >
            <ChevronRight size={12} className="rotate-180" />
            Back to reports
          </button>
          <span className="text-xs text-zinc-400 truncate">{previewFile.split("/").pop()}</span>
        </div>
        <div className="flex-1">
          <ReportPreviewIframe filePath={previewFile} />
        </div>
      </div>
    );
  }

  if (selectedSodFile && sodIframeSrc) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <button
            onClick={() => setSelectedSodFile(null)}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-500"
          >
            <ChevronRight size={12} className="rotate-180" />
            Back to reports
          </button>
          <span className="text-xs text-zinc-400 flex-1 truncate">
            {selectedSodReport?.label} — {selectedSodReport?.date}
          </span>
          <button
            onClick={handleCopySodUrl}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy URL"}
          </button>
          <button
            onClick={() => s3Url && window.open(s3Url, "_blank")}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <ExternalLink size={12} />
            Open
          </button>
        </div>
        <iframe
          src={sodIframeSrc}
          className="flex-1 w-full bg-white"
          title="Report preview"
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  // ─── Main tree view ─────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Reports — All Domains
            </h2>
            <p className="text-sm text-zinc-500">
              {sodReports.length} global · {totalHtml} domain reports across {domainsWithReports.length} domains
              {loading && ` (scanning ${loadedCount}/${totalDomains}...)`}
            </p>
          </div>
        </div>

        {/* Search + domain filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter reports..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={domainFilter || ""}
            onChange={(e) => setDomainFilter(e.target.value || null)}
            className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="">All domains</option>
            {domainsWithReports.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && domainFolders.length === 0 && (
          <div className="p-4">
            <SectionLoading message={`Scanning reports... ${loadedCount}/${totalDomains} domains`} />
          </div>
        )}

        {/* Global SOD Reports */}
        {sodReports.length > 0 && !domainFilter && (
          <SodReportsSection reports={sodReports} onSelect={setSelectedSodFile} />
        )}

        {/* Domain tree */}
        {filteredDomains.map((d) => (
          <DomainRow
            key={d.domain}
            info={d}
            onPreview={setPreviewFile}
            search={search}
            autoExpand={!!domainFilter}
          />
        ))}

        {!loading && filteredDomains.length === 0 && sodReports.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <FileBarChart size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No reports found</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SOD Reports Section (compact) ──────────────────────────────────────────

function SodReportsSection({
  reports,
  onSelect,
}: {
  reports: ParsedSodReport[];
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left"
      >
        <ChevronRight size={14} className={cn("text-zinc-400 transition-transform", expanded && "rotate-90")} />
        <FileBarChart size={15} className="text-blue-500" />
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex-1">
          Global Reports
        </span>
        <span className="text-xs text-zinc-400 tabular-nums">{reports.length}</span>
      </button>
      {expanded && (
        <div className="pl-10 pr-4 pb-2 space-y-0.5">
          {reports.map((r) => (
            <button
              key={r.entry.path}
              onClick={() => onSelect(r.entry.path)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <FileText
                size={13}
                className={cn(
                  "flex-shrink-0",
                  r.prefix === "sod" ? "text-blue-500" : r.prefix === "drive" ? "text-amber-500" : "text-zinc-400",
                )}
              />
              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1">{r.label}</span>
              <span className="text-xs text-zinc-400 tabular-nums">{r.date}</span>
              <span className="text-xs text-zinc-300 dark:text-zinc-600 tabular-nums">{formatSize(r.entry.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Domain Row (collapsible) ───────────────────────────────────────────────

function DomainRow({
  info,
  onPreview,
  search,
  autoExpand,
}: {
  info: DomainFolderInfo;
  onPreview: (path: string) => void;
  search: string;
  autoExpand: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand);

  // Auto-expand when filter applied
  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left"
      >
        <ChevronRight size={14} className={cn("text-zinc-400 transition-transform", expanded && "rotate-90")} />
        {expanded ? (
          <FolderOpen size={15} className="text-teal-500" />
        ) : (
          <Folder size={15} className="text-teal-500" />
        )}
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">{info.domain}</span>
        <span className="text-xs text-zinc-400 tabular-nums">
          {info.totalHtmlCount} report{info.totalHtmlCount !== 1 ? "s" : ""}
          {info.folders.length > 0 && ` · ${info.folders.length} folder${info.folders.length !== 1 ? "s" : ""}`}
        </span>
      </button>

      {expanded && (
        <div className="pl-10 pr-4 pb-2">
          {/* Root-level HTML files */}
          {info.rootHtmlCount > 0 && (
            <ReportFolderContents
              folderPath={info.reportsPath}
              onPreview={onPreview}
              search={search}
            />
          )}

          {/* Subfolders */}
          {info.folders.map((folder) => (
            <FolderRow
              key={folder.path}
              name={folder.name}
              path={folder.path}
              onPreview={onPreview}
              search={search}
              autoExpand={autoExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Folder Row (collapsible, lazy loads contents) ──────────────────────────

function FolderRow({
  name,
  path,
  onPreview,
  search,
  autoExpand,
}: {
  name: string;
  path: string;
  onPreview: (path: string) => void;
  search: string;
  autoExpand: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand);

  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
      >
        <ChevronRight size={12} className={cn("text-zinc-400 transition-transform", expanded && "rotate-90")} />
        {expanded ? (
          <FolderOpen size={14} className="text-amber-500" />
        ) : (
          <Folder size={14} className="text-amber-500" />
        )}
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1">{name}</span>
      </button>

      {expanded && (
        <div className="pl-7 mt-1">
          <ReportFolderContents folderPath={path} onPreview={onPreview} search={search} />
        </div>
      )}
    </div>
  );
}

// ─── Folder Contents (lazy loaded, HTML-only gallery) ───────────────────────

function ReportFolderContents({
  folderPath,
  onPreview,
  search,
}: {
  folderPath: string;
  onPreview: (path: string) => void;
  search: string;
}) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    invoke<FileEntry[]>("list_directory", { path: folderPath })
      .then((entries) => {
        if (!cancelled) {
          const htmlFiles = entries
            .filter((e) => !e.is_directory && e.name.endsWith(".html"))
            .sort((a, b) => a.name.localeCompare(b.name));
          setFiles(htmlFiles);
        }
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [folderPath]);

  if (loading) {
    return (
      <div className="py-2 flex items-center gap-2 text-xs text-zinc-400">
        <Loader2 size={12} className="animate-spin" />
        Loading...
      </div>
    );
  }

  const q = search.toLowerCase();
  const filtered = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    return <p className="text-[10px] text-zinc-400 py-1 px-2">No HTML reports</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-2 pb-2">
      {filtered.map((file) => (
        <ReportThumbnail key={file.path} file={file} onClick={() => onPreview(file.path)} />
      ))}
    </div>
  );
}

// ─── Thumbnail ──────────────────────────────────────────────────────────────

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
      <div className="relative h-32 overflow-hidden bg-white">
        {thumbSrcDoc ? (
          <iframe
            srcDoc={thumbSrcDoc}
            className="w-[300%] h-[300%] border-0 origin-top-left pointer-events-none"
            style={{ transform: "scale(0.333)" }}
            tabIndex={-1}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={14} className="animate-spin text-zinc-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors" />
      </div>
      <div className="px-2 py-1.5 border-t border-zinc-100 dark:border-zinc-800/50">
        <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{file.name}</p>
        <p className="text-[10px] text-zinc-400">
          {file.modified ? formatRelative(file.modified) : ""} · {formatSize(file.size)}
        </p>
      </div>
    </button>
  );
}

// ─── Report Full Preview ────────────────────────────────────────────────────

function ReportPreviewIframe({ filePath }: { filePath: string }) {
  const { data: htmlContent } = useReadFile(filePath);

  const iframeSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + htmlContent;
  }, [htmlContent]);

  if (!iframeSrcDoc) return <SectionLoading className="py-8" />;

  return (
    <iframe
      srcDoc={iframeSrcDoc}
      className="w-full h-full border-0"
      sandbox="allow-scripts"
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSodFilename(entry: FolderEntry): ParsedSodReport | null {
  const match = entry.name.match(/^(.+)-(\d{4}-\d{2}-\d{2})\.html$/);
  if (!match) return null;
  const prefix = match[1];
  const date = match[2];
  const labelMap: Record<string, string> = { sod: "SOD Check", drive: "Drive Unprocessed" };
  const label = labelMap[prefix] ?? prefix;
  return { entry, prefix, date, label };
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
