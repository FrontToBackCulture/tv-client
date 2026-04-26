// src/modules/domains/CrossDomainReportsView.tsx
// Cross-domain reports: tree sidebar (left) + report preview (right).
// Tree: Global Reports → Domain → Folder → HTML files. Lazy-loads on expand.

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
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { useDiscoverDomains } from "../../hooks/val-sync";
import { useFolderEntries, type FolderEntry } from "../../hooks/useFolderFiles";
import { useReadFile, type FileEntry } from "../../hooks/useFiles";
import { SectionLoading } from "../../components/ui/DetailStates";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DomainFolderInfo {
  domain: string;
  reportsPath: string;
  folders: { name: string; path: string }[];
  rootHtmlFiles: { name: string; path: string; size: number; modified: string | null }[];
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
  const paths = usePrimaryKnowledgePaths();
  const domainsPath = paths ? `${paths.platform}/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  // SOD reports (global)
  const sodReportsPath = paths ? `${paths.platform}/sod-reports` : null;
  const { data: sodEntries } = useFolderEntries(sodReportsPath);

  // Domain folder index
  const [domainFolders, setDomainFolders] = useState<DomainFolderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  // UI state
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; type: "domain" | "sod"; sodReport?: ParsedSodReport } | null>(null);
  const [copied, setCopied] = useState(false);

  // Index domains
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
          const rootHtmlFiles = entries
            .filter((e) => !e.is_directory && e.name.endsWith(".html"))
            .sort((a, b) => a.name.localeCompare(b.name));

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

          const totalHtmlCount = rootHtmlFiles.length + subHtmlCount;
          if (totalHtmlCount > 0 || folders.length > 0) {
            results.push({
              domain: domain.domain,
              reportsPath,
              folders: folders.map((f) => ({ name: f.name, path: f.path })),
              rootHtmlFiles: rootHtmlFiles.map((f) => ({ name: f.name, path: f.path, size: f.size, modified: f.modified })),
              totalHtmlCount,
            });
          }
        } catch {
          // No reports/ folder
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

  // Filter tree
  const filteredDomains = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return domainFolders;
    return domainFolders.filter((d) =>
      d.domain.toLowerCase().includes(q) || d.folders.some((f) => f.name.toLowerCase().includes(q)),
    );
  }, [domainFolders, search]);

  const totalHtml = domainFolders.reduce((sum, d) => sum + d.totalHtmlCount, 0);
  const totalDomains = domainsQuery.data?.length ?? 0;

  // SOD helpers
  const S3_BASE = "https://signalval.s3.ap-southeast-1.amazonaws.com/sod-reports";
  const s3Url = selectedFile?.sodReport
    ? `${S3_BASE}/${selectedFile.sodReport.prefix}-${selectedFile.sodReport.date}.html`
    : null;

  const handleCopyUrl = useCallback(async () => {
    if (!s3Url) return;
    await navigator.clipboard.writeText(s3Url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [s3Url]);

  const handleSelectSod = useCallback((report: ParsedSodReport) => {
    setSelectedFile({ path: report.entry.path, name: `${report.label} — ${report.date}`, type: "sod", sodReport: report });
  }, []);

  const handleSelectDomainFile = useCallback((path: string, name: string) => {
    setSelectedFile({ path, name, type: "domain" });
  }, []);

  // ─── Layout: Tree (left) + Preview (right) ────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden px-4 py-4">
     <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
      {/* ── Tree sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
        {/* Search */}
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="w-full pl-7 pr-6 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={10} />
              </button>
            )}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5 px-0.5">
            {sodReports.length} global · {totalHtml} domain
            {loading && ` (${loadedCount}/${totalDomains})`}
          </p>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading && domainFolders.length === 0 && (
            <div className="px-2 py-3">
              <SectionLoading message={`Scanning ${loadedCount}/${totalDomains}...`} />
            </div>
          )}

          {/* Global Reports */}
          {sodReports.length > 0 && (
            <TreeSection
              icon={<FileBarChart size={13} className="text-blue-500" />}
              label="GLOBAL REPORTS"
              count={sodReports.length}
              defaultExpanded={false}
            >
              {sodReports.map((r) => (
                <TreeFile
                  key={r.entry.path}
                  name={`${r.label} ${r.date}`}
                  icon={<FileText size={12} className={r.prefix === "sod" ? "text-blue-500" : r.prefix === "drive" ? "text-amber-500" : "text-zinc-400"} />}
                  active={selectedFile?.path === r.entry.path}
                  onClick={() => handleSelectSod(r)}
                />
              ))}
            </TreeSection>
          )}

          {/* Domains */}
          {filteredDomains.map((d) => (
            <DomainTreeNode
              key={d.domain}
              info={d}
              selectedPath={selectedFile?.path ?? null}
              onSelect={handleSelectDomainFile}
              autoExpand={!!search}
            />
          ))}
        </div>
      </aside>

      {/* ── Content pane ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile ? (
          <>
            {/* Preview header */}
            <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 truncate">{selectedFile.name}</span>
              {s3Url && (
                <>
                  <button
                    onClick={handleCopyUrl}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded transition-colors"
                  >
                    {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy URL"}
                  </button>
                  <button
                    onClick={() => window.open(s3Url, "_blank")}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open
                  </button>
                </>
              )}
            </div>
            {/* Preview iframe */}
            <div className="flex-1">
              {selectedFile.type === "sod" ? (
                <iframe
                  src={convertFileSrc(selectedFile.path)}
                  className="w-full h-full border-0 bg-white dark:bg-zinc-900"
                  title="Report preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <ReportPreviewIframe filePath={selectedFile.path} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileBarChart size={36} className="mx-auto text-zinc-200 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-400">Select a report to preview</p>
              <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">
                {sodReports.length} global · {totalHtml} domain reports across {domainFolders.length} domains
              </p>
            </div>
          </div>
        )}
      </div>
     </div>
    </div>
  );
}

// ─── Tree Section (collapsible group) ───────────────────────────────────────

function TreeSection({
  icon,
  label,
  count,
  defaultExpanded = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left"
      >
        <ChevronRight size={11} className={cn("text-zinc-400 transition-transform flex-shrink-0", expanded && "rotate-90")} />
        {icon}
        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex-1 truncate">{label}</span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{count}</span>
      </button>
      {expanded && <div className="ml-3">{children}</div>}
    </div>
  );
}

// ─── Tree File (leaf node) ──────────────────────────────────────────────────

function TreeFile({
  name,
  icon,
  active,
  onClick,
}: {
  name: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors truncate",
        active
          ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
      )}
    >
      {icon ?? <FileText size={13} className={active ? "text-teal-500" : "text-zinc-400"} />}
      <span className="truncate flex-1">{name}</span>
    </button>
  );
}

// ─── Domain Tree Node ───────────────────────────────────────────────────────

function DomainTreeNode({
  info,
  selectedPath,
  onSelect,
  autoExpand,
}: {
  info: DomainFolderInfo;
  selectedPath: string | null;
  onSelect: (path: string, name: string) => void;
  autoExpand: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand);

  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  // Check if any child is selected (to keep domain visually highlighted)
  const hasSelectedChild = selectedPath?.startsWith(info.reportsPath) ?? false;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left",
          hasSelectedChild && !expanded && "bg-teal-50/50 dark:bg-teal-900/10",
        )}
      >
        <ChevronRight size={11} className={cn("text-zinc-400 transition-transform flex-shrink-0", expanded && "rotate-90")} />
        {expanded ? <FolderOpen size={13} className="text-teal-500 flex-shrink-0" /> : <Folder size={13} className="text-teal-500 flex-shrink-0" />}
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 truncate">{info.domain}</span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{info.totalHtmlCount}</span>
      </button>

      {expanded && (
        <div className="ml-3">
          {/* Root HTML files */}
          {info.rootHtmlFiles.map((f) => (
            <TreeFile
              key={f.path}
              name={f.name.replace(".html", "")}
              active={selectedPath === f.path}
              onClick={() => onSelect(f.path, `${info.domain} / ${f.name}`)}
            />
          ))}

          {/* Subfolders */}
          {info.folders.map((folder) => (
            <SubfolderTreeNode
              key={folder.path}
              name={folder.name}
              path={folder.path}
              domain={info.domain}
              selectedPath={selectedPath}
              onSelect={onSelect}
              autoExpand={autoExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subfolder Tree Node (lazy loads contents) ──────────────────────────────

function SubfolderTreeNode({
  name,
  path,
  domain,
  selectedPath,
  onSelect,
  autoExpand,
}: {
  name: string;
  path: string;
  domain: string;
  selectedPath: string | null;
  onSelect: (path: string, name: string) => void;
  autoExpand: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  // Lazy load on first expand
  useEffect(() => {
    if (!expanded || files !== null) return;
    let cancelled = false;
    setLoading(true);

    invoke<FileEntry[]>("list_directory", { path })
      .then((entries) => {
        if (!cancelled) {
          setFiles(
            entries
              .filter((e) => !e.is_directory && e.name.endsWith(".html"))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      })
      .catch(() => { if (!cancelled) setFiles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [expanded, files, path]);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left"
      >
        <ChevronRight size={10} className={cn("text-zinc-400 transition-transform flex-shrink-0", expanded && "rotate-90")} />
        {expanded ? <FolderOpen size={12} className="text-amber-500 flex-shrink-0" /> : <Folder size={12} className="text-amber-500 flex-shrink-0" />}
        <span className="text-[11px] text-zinc-600 dark:text-zinc-400 flex-1 truncate">{name}</span>
      </button>

      {expanded && (
        <div className="ml-3">
          {loading && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-zinc-400">
              <Loader2 size={10} className="animate-spin" /> Loading...
            </div>
          )}
          {files?.map((f) => (
            <TreeFile
              key={f.path}
              name={f.name.replace(".html", "")}
              active={selectedPath === f.path}
              onClick={() => onSelect(f.path, `${domain} / ${name} / ${f.name}`)}
            />
          ))}
          {files && files.length === 0 && (
            <p className="text-[10px] text-zinc-400 px-2 py-1">No HTML reports</p>
          )}
        </div>
      )}
    </div>
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
