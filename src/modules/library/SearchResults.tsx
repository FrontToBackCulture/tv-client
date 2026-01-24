// src/modules/library/SearchResults.tsx

import { FileText, FileCode, Search } from "lucide-react";
import { SearchResult } from "../../hooks/useSearch";
import { cn } from "../../lib/cn";

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  onSelect: (result: SearchResult) => void;
  selectedPath: string | null;
}

// Get icon based on file extension
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "md":
    case "markdown":
      return <FileText size={14} className="text-blue-400" />;
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "sql":
    case "rs":
    case "py":
      return <FileCode size={14} className="text-yellow-400" />;
    default:
      return <FileText size={14} className="text-zinc-500" />;
  }
}

export function SearchResults({
  results,
  isLoading,
  onSelect,
  selectedPath,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <Search size={20} className="mx-auto mb-2 text-zinc-500 animate-pulse" />
        <p className="text-sm text-zinc-500">Searching...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-4 text-center">
        <Search size={20} className="mx-auto mb-2 text-zinc-600" />
        <p className="text-sm text-zinc-500">No results found</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="px-3 py-1.5 text-xs text-zinc-500 uppercase tracking-wide">
        {results.length} result{results.length !== 1 ? "s" : ""}
      </div>
      {results.map((result) => {
        const isSelected = selectedPath === result.path;
        return (
          <div
            key={result.path}
            onClick={() => onSelect(result)}
            className={cn(
              "flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors",
              "hover:bg-zinc-800",
              isSelected && "bg-zinc-800"
            )}
          >
            <div className="mt-0.5">{getFileIcon(result.name)}</div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm truncate", isSelected ? "text-teal-400" : "text-zinc-300")}>
                {result.name}
              </div>
              {result.preview && (
                <div className="text-xs text-zinc-500 truncate mt-0.5">
                  {result.line_number && (
                    <span className="text-zinc-600">L{result.line_number}: </span>
                  )}
                  {result.preview}
                </div>
              )}
              <div className="text-xs text-zinc-600 truncate mt-0.5">
                {result.path}
              </div>
            </div>
            <div className="text-xs text-zinc-600">
              {result.match_type === "content" ? "content" : "name"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
