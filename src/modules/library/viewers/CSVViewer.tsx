// src/modules/library/viewers/CSVViewer.tsx
// CSV file viewer with sortable table display

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Table2, Copy, Check } from "lucide-react";
import { cn } from "../../../lib/cn";

interface CSVViewerProps {
  content: string;
  filename: string;
}

// Simple CSV parser (handles basic cases, quoted fields with commas)
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

type SortDirection = "asc" | "desc" | null;

export function CSVViewer({ content, filename }: CSVViewerProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [copied, setCopied] = useState(false);

  const { headers, rows } = useMemo(() => parseCSV(content), [content]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (sortColumn === null || sortDirection === null) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aVal = a[sortColumn] || "";
      const bVal = b[sortColumn] || "";

      // Try numeric sort first
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      // Fall back to string sort
      const compare = aVal.localeCompare(bVal);
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [rows, sortColumn, sortDirection]);

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnIndex);
      setSortDirection("asc");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  if (headers.length === 0) {
    return (
      <div className="p-4">
        <div className="text-zinc-500 text-sm">Empty or invalid CSV file</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Table2 size={16} className="text-zinc-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-600">
            {rows.length} rows × {headers.length} columns
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded transition-colors"
        >
          {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 border-b border-slate-200 dark:border-zinc-800 w-10">
                #
              </th>
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(idx)}
                  className={cn(
                    "px-3 py-2 text-left text-xs font-medium text-zinc-600 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors",
                    sortColumn === idx && "text-teal-600 dark:text-teal-400"
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">{header || `Column ${idx + 1}`}</span>
                    {sortColumn === idx ? (
                      sortDirection === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ArrowUpDown size={12} className="text-zinc-400 dark:text-zinc-600" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-600 border-b border-slate-100 dark:border-zinc-800/50">
                  {rowIdx + 1}
                </td>
                {headers.map((_, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-3 py-1.5 text-zinc-800 dark:text-zinc-300 border-b border-slate-100 dark:border-zinc-800/50 max-w-xs truncate"
                    title={row[colIdx] || ""}
                  >
                    {row[colIdx] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
