// src/modules/product/DomainReportsTab.tsx
// Reports tab for domain detail panel — lists report folders and files from {domain}/reports/

import { useState } from "react";
import {
  Folder,
  FileText,
  ChevronRight,
  FileBarChart,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useListDirectory, type FileEntry } from "../../hooks/useFiles";
import { useSidePanelStore } from "../../stores/sidePanelStore";

interface DomainReportsTabProps {
  reportsPath: string; // e.g. /path/to/domain/reports
  domainName: string;
}

export function DomainReportsTab({ reportsPath, domainName }: DomainReportsTabProps) {
  const dirQuery = useListDirectory(reportsPath);
  const openPanel = useSidePanelStore((s) => s.openPanel);

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
        <span className="text-xs text-zinc-400 tabular-nums">
          {totalCount} {totalCount === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Entries */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
        {folders.map((folder) => (
          <ReportFolder key={folder.path} folder={folder} onOpenFile={openPanel} />
        ))}
        {files.map((file) => (
          <ReportFileRow key={file.path} file={file} onOpen={openPanel} />
        ))}
      </div>
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
