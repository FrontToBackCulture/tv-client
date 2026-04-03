// DomainReportsTab — Tree + detail pane for browsing domain reports
// Left: folder/file tree. Right: HTML preview of selected report.

import { useState, useMemo } from "react";
import {
  Folder,
  FileText,
  ChevronRight,
  FileBarChart,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useListDirectory, useReadFile, type FileEntry } from "../../hooks/useFiles";
import { SectionLoading, InlineLoading } from "../../components/ui/DetailStates";

interface DomainReportsTabProps {
  reportsPath: string;
  domainName: string;
}

export function DomainReportsTab({ reportsPath, domainName }: DomainReportsTabProps) {
  const dirQuery = useListDirectory(reportsPath);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (dirQuery.isLoading) {
    return <SectionLoading className="py-12" />;
  }

  if (dirQuery.isError || !dirQuery.data || dirQuery.data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg p-8 max-w-md text-center">
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
    .sort((a, b) => b.name.localeCompare(a.name));
  const files = entries
    .filter((e) => !e.is_directory && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex h-full gap-0">
      {/* Left: Tree */}
      <div className="w-[260px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-auto">
        <div className="py-2">
          {folders.map((folder) => (
            <TreeFolder
              key={folder.path}
              folder={folder}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
          ))}
          {files.map((file) => (
            <TreeFile
              key={file.path}
              file={file}
              isSelected={selectedFile === file.path}
              onSelect={() => setSelectedFile(file.path)}
            />
          ))}
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <ReportPreview filePath={selectedFile} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Select a report to preview
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tree components ────────────────────────────────────────────────────────

function TreeFolder({
  folder,
  selectedFile,
  onSelect,
}: {
  folder: FileEntry;
  selectedFile: string | null;
  onSelect: (path: string) => void;
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
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
      >
        <ChevronRight
          size={12}
          className={cn(
            "text-zinc-400 transition-transform flex-shrink-0",
            expanded && "rotate-90"
          )}
        />
        <Folder size={14} className="text-amber-500 flex-shrink-0" />
        <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate flex-1">
          {folder.name}
        </span>
        <span className="text-xs text-zinc-400 tabular-nums">
          {folder.modified ? formatRelative(folder.modified) : ""}
        </span>
      </button>

      {expanded && (
        <div className="ml-4">
          {childQuery.isLoading && (
            <div className="px-3 py-1"><InlineLoading /></div>
          )}
          {childFiles.map((file) => (
            <TreeFile
              key={file.path}
              file={file}
              isSelected={selectedFile === file.path}
              onSelect={() => onSelect(file.path)}
            />
          ))}
          {childQuery.isSuccess && childFiles.length === 0 && (
            <p className="text-xs text-zinc-400 px-3 py-1">Empty folder</p>
          )}
        </div>
      )}
    </div>
  );
}

function TreeFile({
  file,
  isSelected,
  onSelect,
}: {
  file: FileEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isHtml = file.name.endsWith(".html");

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <span className="w-3 flex-shrink-0" /> {/* indent spacer */}
      <FileText
        size={14}
        className={cn(
          "flex-shrink-0",
          isSelected ? "text-teal-500" : isHtml ? "text-blue-400" : "text-zinc-400"
        )}
      />
      <span className={cn(
        "text-xs truncate flex-1",
        isSelected ? "font-medium" : "text-zinc-700 dark:text-zinc-300"
      )}>
        {file.name}
      </span>
      <span className="text-xs text-zinc-400 tabular-nums flex-shrink-0">
        {formatSize(file.size)}
      </span>
    </button>
  );
}

// ─── Preview ────────────────────────────────────────────────────────────────

function ReportPreview({ filePath }: { filePath: string }) {
  const { data: content, isLoading } = useReadFile(filePath);
  const isHtml = filePath.endsWith(".html");

  const iframeSrcDoc = useMemo(() => {
    if (!content || !isHtml) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (content.includes("</head>")) {
      return content.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + content;
  }, [content, isHtml]);

  if (isLoading) {
    return <SectionLoading className="py-12" />;
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
        Could not load file
      </div>
    );
  }

  if (isHtml && iframeSrcDoc) {
    return (
      <iframe
        srcDoc={iframeSrcDoc}
        className="w-full h-full border-0"
        sandbox="allow-scripts"
      />
    );
  }

  // Non-HTML: show raw text
  return (
    <pre className="p-4 text-xs text-zinc-700 dark:text-zinc-300 overflow-auto h-full font-mono whitespace-pre-wrap">
      {content}
    </pre>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
