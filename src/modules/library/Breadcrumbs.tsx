// src/modules/library/Breadcrumbs.tsx

import { ChevronRight, Home, Folder, FileText } from "lucide-react";
import { cn } from "../../lib/cn";

interface BreadcrumbsProps {
  path: string;
  basePath: string;
  onNavigate: (path: string) => void;
  isFile?: boolean;
}

export function Breadcrumbs({ path, basePath, onNavigate, isFile = false }: BreadcrumbsProps) {
  // Get relative path from base
  const relativePath = path.startsWith(basePath)
    ? path.slice(basePath.length).replace(/^\//, "")
    : path;

  const parts = relativePath ? relativePath.split("/").filter(Boolean) : [];

  // Build paths for each segment
  const buildPath = (index: number) => {
    const segments = parts.slice(0, index + 1);
    return `${basePath}/${segments.join("/")}`;
  };

  return (
    <div className="flex items-center gap-1 text-sm min-w-0">
      {/* Home/Root button */}
      <button
        onClick={() => onNavigate(basePath)}
        className="flex-shrink-0 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        title="Go to root"
      >
        <Home className="w-4 h-4" />
      </button>

      {parts.length > 0 && (
        <>
          {/* Truncate if too many segments */}
          {parts.length > 4 && (
            <>
              <ChevronRight className="w-3 h-3 text-zinc-500 dark:text-zinc-600 flex-shrink-0" />
              <span className="text-zinc-500">...</span>
            </>
          )}

          {/* Show segments (last 4 if truncated) */}
          {(parts.length > 4 ? parts.slice(-4) : parts).map((part, idx) => {
            const actualIndex = parts.length > 4 ? parts.length - 4 + idx : idx;
            const isLast = actualIndex === parts.length - 1;
            const segmentPath = buildPath(actualIndex);

            return (
              <div key={actualIndex} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3 h-3 text-zinc-500 dark:text-zinc-600 flex-shrink-0" />

                {isLast ? (
                  // Last segment - not clickable, show icon
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isFile ? (
                      <FileText className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                    )}
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate">
                      {part}
                    </span>
                  </div>
                ) : (
                  // Clickable segment
                  <button
                    onClick={() => onNavigate(segmentPath)}
                    className={cn(
                      "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors truncate max-w-[120px]",
                      "hover:underline"
                    )}
                    title={part}
                  >
                    {part}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {parts.length === 0 && (
        <>
          <ChevronRight className="w-3 h-3 text-zinc-500 dark:text-zinc-600 flex-shrink-0" />
          <span className="text-zinc-800 dark:text-zinc-200 font-medium">Root</span>
        </>
      )}
    </div>
  );
}
