// src/modules/product/DomainAiTab.tsx
// AI tab for domain detail panel — shows instructions.md + table docs from ai/ folder

import { useState, useMemo } from "react";
import {
  FileText,
  Brain,
  Database,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useListDirectory, useReadFile, type FileEntry } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";

interface DomainAiTabProps {
  aiPath: string; // e.g. /path/to/domain/ai
  domainName: string; // e.g. "lag"
}

export function DomainAiTab({ aiPath, domainName }: DomainAiTabProps) {
  const [selectedDoc, setSelectedDoc] = useState<{ path: string; name: string } | null>(null);

  const aiDir = useListDirectory(aiPath);
  const tablesPath = `${aiPath}/tables`;
  const instructionsPath = `${aiPath}/instructions.md`;

  const tablesDir = useListDirectory(tablesPath);
  const instructionsFile = useReadFile(instructionsPath);

  // If the ai/ folder doesn't exist or is empty, show empty state
  const aiNotFound = aiDir.isError || (aiDir.isSuccess && aiDir.data.length === 0);

  if (aiDir.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (aiNotFound) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-lg p-8 max-w-md text-center">
          <Brain size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            No AI context found
          </h3>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            This domain doesn't have an <code className="px-1 py-0.5 bg-slate-100 dark:bg-zinc-800 rounded text-[11px]">ai/</code> folder yet.
            AI context includes instructions and table metadata docs used by MCP tools.
          </p>
        </div>
      </div>
    );
  }

  const tableFiles = (tablesDir.data ?? []).filter(
    (f) => !f.is_directory && f.name.endsWith(".md")
  );

  const hasInstructions = !!instructionsFile.data;

  return (
    <div className="space-y-6">
      {/* Profile header card */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-purple-400 to-purple-600" />
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              <Brain size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {domainName}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  AI Context
                </span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Instructions and table metadata documentation used by MCP tools for this domain.
              </p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800">
              <Database size={13} className="text-blue-500" />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{tableFiles.length}</span>
              <span className="text-xs text-zinc-400">Table Docs</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800">
              <FileText size={13} className={hasInstructions ? "text-green-500" : "text-zinc-300"} />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{hasInstructions ? "1" : "0"}</span>
              <span className="text-xs text-zinc-400">Instructions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex gap-6">
        {/* Left column — Table metadata grid */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-blue-500" />
            <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Table Metadata Reference
            </label>
            {tableFiles.length > 0 && (
              <span className="text-[10px] font-normal text-zinc-400 tabular-nums">
                {tableFiles.length}
              </span>
            )}
          </div>

          {tablesDir.isLoading && (
            <div className="text-xs text-zinc-400 py-4">Loading table docs...</div>
          )}

          {tablesDir.isSuccess && tableFiles.length === 0 && (
            <div className="py-6 text-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg">
              <Database size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
              <p className="text-xs text-zinc-400">No table docs in ai/tables/</p>
            </div>
          )}

          {tableFiles.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {tableFiles.map((file) => (
                <TableDocGridCard
                  key={file.path}
                  file={file}
                  onClick={() => setSelectedDoc({ path: file.path, name: file.name })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right column — Instructions */}
        <div className="w-[320px] flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-purple-500" />
            <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Instructions
            </label>
          </div>

          <InstructionsCard
            content={instructionsFile.data}
            isLoading={instructionsFile.isLoading}
            isError={instructionsFile.isError}
          />
        </div>
      </div>

      {/* Table doc modal */}
      {selectedDoc && (
        <TableDocModal
          filePath={selectedDoc.path}
          fileName={selectedDoc.name}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}

/** Grid card for a table doc — skill-style layout */
function TableDocGridCard({ file, onClick }: { file: FileEntry; onClick: () => void }) {
  const displayName = file.name.replace(/\.md$/, "");

  // Extract a human-readable label from the filename
  // e.g. "dw-udt-receipts" → "Receipts", "dw-udt-receipt-items" → "Receipt Items"
  const shortLabel = useMemo(() => {
    // Remove common prefixes like dw-udt-, dw-, etc.
    const cleaned = displayName
      .replace(/^dw-udt-/, "")
      .replace(/^dw-/, "")
      .replace(/^udt-/, "");
    // Convert kebab-case to Title Case
    return cleaned
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }, [displayName]);

  const sizeLabel = file.size < 1024
    ? `${file.size} B`
    : `${(file.size / 1024).toFixed(1)} KB`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left px-4 py-3 rounded-lg border bg-white dark:bg-zinc-900 hover:shadow-sm transition-all cursor-pointer group",
        "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Database size={13} className="text-blue-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-1">
          {shortLabel}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate mb-1">
        {displayName}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-zinc-400">{sizeLabel}</span>
        {file.modified && (
          <span className="text-[9px] text-zinc-400">{formatRelative(file.modified)}</span>
        )}
      </div>
    </button>
  );
}

/** Modal for viewing a table doc — matches SkillModal pattern */
function TableDocModal({
  filePath,
  fileName,
  onClose,
}: {
  filePath: string;
  fileName: string;
  onClose: () => void;
}) {
  const { data: content, isLoading } = useReadFile(filePath);
  const displayName = fileName.replace(/\.md$/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-blue-500 flex-shrink-0" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{displayName}</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">&middot;</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{fileName}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          )}
          {content && (
            <div className="px-6 py-5">
              <MarkdownViewer content={content} filename={displayName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Instructions card with truncated preview + modal on "Show more" */
function InstructionsCard({
  content,
  isLoading,
  isError,
}: {
  content: string | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  if (isLoading) {
    return (
      <div className="p-3 rounded border border-slate-200 dark:border-zinc-800 text-xs text-zinc-400">
        Loading instructions...
      </div>
    );
  }

  if (isError || !content) {
    return (
      <div className="p-3 rounded border border-dashed border-slate-300 dark:border-zinc-700 text-xs text-zinc-400">
        No instructions.md found
      </div>
    );
  }

  return (
    <>
      <div className="rounded border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-3">
          <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed line-clamp-[12]">
            {content}
          </pre>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full px-3 py-1.5 text-[11px] text-teal-600 dark:text-teal-400 hover:bg-slate-50 dark:hover:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 transition-colors"
        >
          Show more
        </button>
      </div>
      {showModal && (
        <InstructionsModal
          content={content}
          title="instructions.md"
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/** Full-screen modal for instructions content */
function InstructionsModal({
  content,
  title,
  onClose,
}: {
  content: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-500 flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            <MarkdownViewer content={content} filename={title} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Format a timestamp as relative time */
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
