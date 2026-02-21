// DomainDetailPanel: Files tab showing output status grouped by category

import {
  Loader2,
  CheckCircle2,
  Clock,
  Folder,
  FileText,
  AlertCircle,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { timeAgoVerbose as timeAgo } from "../../lib/date";
import { useSidePanelStore } from "../../stores/sidePanelStore";
import type { OutputFileStatus } from "../../hooks/val-sync";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesTab({ outputs, isLoading }: { outputs: OutputFileStatus[]; isLoading: boolean }) {
  const { openPanel } = useSidePanelStore();

  function handleOpenFile(output: OutputFileStatus) {
    if (!output.exists || output.is_folder) return;
    openPanel(output.path, output.name);
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (outputs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No output files configured</p>
    );
  }

  // Group outputs by category
  const byCategory = new Map<string, OutputFileStatus[]>();
  for (const output of outputs) {
    const list = byCategory.get(output.category) ?? [];
    list.push(output);
    byCategory.set(output.category, list);
  }

  // Category order
  const categoryOrder = ["Schema Sync", "Extractions", "Monitoring", "Analytics", "Health Checks"];
  const sortedCategories = [...byCategory.keys()].sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <div className="space-y-4">
      {sortedCategories.map((category) => {
        const items = byCategory.get(category) ?? [];
        const existsCount = items.filter((o) => o.exists).length;
        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {category}
              </label>
              <span className="text-[10px] text-zinc-400">
                {existsCount}/{items.length} exist
              </span>
            </div>
            <div className="space-y-1">
              {items.map((output) => (
                <div
                  key={output.relative_path}
                  onClick={() => handleOpenFile(output)}
                  className={cn(
                    "p-2 rounded border flex items-start gap-2",
                    output.exists && !output.is_folder
                      ? "border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      : output.exists
                      ? "border-zinc-200 dark:border-zinc-800"
                      : "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10"
                  )}
                  title={output.exists && !output.is_folder ? "Click to view in side panel" : undefined}
                >
                  {output.is_folder ? (
                    <Folder size={14} className={cn(
                      "mt-0.5 flex-shrink-0",
                      output.exists ? "text-amber-500" : "text-zinc-300"
                    )} />
                  ) : (
                    <FileText size={14} className={cn(
                      "mt-0.5 flex-shrink-0",
                      output.exists ? "text-blue-500" : "text-zinc-300"
                    )} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm font-medium",
                        output.exists
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-400"
                      )}>
                        {output.name}
                      </span>
                      {output.exists ? (
                        <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                      ) : (
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <AlertCircle size={10} />
                          Missing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-zinc-400 font-mono truncate" title={output.path}>
                        {output.relative_path}
                      </span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 whitespace-nowrap">
                        {output.created_by}
                      </span>
                    </div>
                    {output.exists && (
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                        {output.modified && (
                          <span className="flex items-center gap-0.5">
                            <Clock size={9} />
                            {timeAgo(output.modified)}
                          </span>
                        )}
                        {output.is_folder && output.item_count !== null && (
                          <span>{output.item_count} items</span>
                        )}
                        {!output.is_folder && output.size !== null && (
                          <span>{formatSize(output.size)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
