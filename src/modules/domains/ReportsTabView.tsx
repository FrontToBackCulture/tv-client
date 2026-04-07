// src/modules/product/ReportsTabView.tsx
// Reports tab — list and preview HTML reports from sod-reports/

import { useState, useMemo } from "react";
import { FileText, ExternalLink, Copy, Check } from "lucide-react";
import { SectionLoading } from "../../components/ui/DetailStates";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { useFolderEntries, type FolderEntry } from "../../hooks/useFolderFiles";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";

const S3_BASE = "https://signalval.s3.ap-southeast-1.amazonaws.com/sod-reports";

interface ParsedReport {
  entry: FolderEntry;
  prefix: string;
  date: string;
  label: string;
}

function parseReportFilename(entry: FolderEntry): ParsedReport | null {
  const match = entry.name.match(/^(.+)-(\d{4}-\d{2}-\d{2})\.html$/);
  if (!match) return null;
  const prefix = match[1];
  const date = match[2];
  const labelMap: Record<string, string> = { sod: "SOD Check", drive: "Drive Unprocessed" };
  const label = labelMap[prefix] ?? prefix;
  return { entry, prefix, date, label };
}

export function ReportsTabView() {
  const paths = usePrimaryKnowledgePaths();
  const reportsPath = paths ? `${paths.platform}/sod-reports` : null;

  const { data: entries, isLoading } = useFolderEntries(reportsPath);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reports = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter((e) => !e.is_directory && e.name.endsWith(".html"))
      .map(parseReportFilename)
      .filter((r): r is ParsedReport => r !== null)
      .sort((a, b) => {
        // Sort by date desc, then by prefix
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return a.prefix.localeCompare(b.prefix);
      });
  }, [entries]);

  const selectedReport = reports.find((r) => r.entry.path === selectedFile);
  const iframeSrc = selectedFile ? convertFileSrc(selectedFile) : null;
  const s3Url = selectedReport
    ? `${S3_BASE}/${selectedReport.prefix}-${selectedReport.date}.html`
    : null;

  const handleCopyUrl = async () => {
    if (!s3Url) return;
    await navigator.clipboard.writeText(s3Url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExternal = () => {
    if (!s3Url) return;
    window.open(s3Url, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <SectionLoading message="Loading reports..." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Report list */}
      <div className="w-72 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
        <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Reports ({reports.length})
          </h3>
        </div>
        {reports.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">
            No HTML reports found
          </div>
        ) : (
          <div className="py-1">
            {reports.map((r) => (
              <button
                key={r.entry.path}
                onClick={() => setSelectedFile(r.entry.path)}
                className={cn(
                  "w-full text-left px-3 py-1.5 flex items-start gap-2 transition-colors",
                  selectedFile === r.entry.path
                    ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                )}
              >
                <FileText
                  size={14}
                  className={cn(
                    "mt-0.5 flex-shrink-0",
                    r.prefix === "sod"
                      ? "text-blue-500"
                      : r.prefix === "drive"
                        ? "text-amber-500"
                        : "text-zinc-400"
                  )}
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {r.label}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {r.date}
                    {r.entry.size > 0 && (
                      <span className="text-zinc-300 dark:text-zinc-600"> · {formatSize(r.entry.size)}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preview panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedReport && iframeSrc ? (
          <>
            {/* Toolbar */}
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-1 truncate">
                {selectedReport.label} — {selectedReport.date}
              </span>
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded transition-colors"
                title="Copy S3 URL"
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy URL"}
              </button>
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded transition-colors"
                title="Open in browser"
              >
                <ExternalLink size={12} />
                Open
              </button>
            </div>
            {/* iframe */}
            <iframe
              src={iframeSrc}
              className="flex-1 w-full bg-white dark:bg-zinc-900"
              title="Report preview"
              sandbox="allow-same-origin"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-300 dark:text-zinc-600">
            <div className="text-center">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select a report to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
