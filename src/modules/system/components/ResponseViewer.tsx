// src/modules/system/components/ResponseViewer.tsx
// JSON response display with copy functionality

import { useState, useMemo } from "react";
import { Copy, Check, ChevronRight, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "../../../lib/cn";

interface ResponseViewerProps {
  response: unknown;
  isError?: boolean;
  className?: string;
}

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export function ResponseViewer({ response, isError, className }: ResponseViewerProps) {
  const [copied, setCopied] = useState(false);

  const formatted = useMemo(() => {
    try {
      if (typeof response === "string") {
        // Try to parse if it's a JSON string
        try {
          const parsed = JSON.parse(response);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return response;
        }
      }
      return JSON.stringify(response, null, 2);
    } catch {
      return String(response);
    }
  }, [response]);

  const parsed = useMemo(() => {
    try {
      if (typeof response === "string") {
        return JSON.parse(response);
      }
      return response;
    } catch {
      return null;
    }
  }, [response]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className={cn("rounded-lg border overflow-hidden", className, isError ? "border-red-200 dark:border-red-800" : "border-zinc-200 dark:border-zinc-800")}>
      {/* Header */}
      <div className={cn("flex items-center justify-between px-3 py-2 border-b", isError ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800")}>
        <div className="flex items-center gap-2 text-sm">
          {isError ? (
            <>
              <AlertCircle size={14} className="text-red-500" />
              <span className="text-red-600 dark:text-red-400 font-medium">Error</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-green-600 dark:text-green-400 font-medium">Response</span>
            </>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
        >
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Content */}
      <div className="p-3 bg-white dark:bg-zinc-950 max-h-96 overflow-auto">
        {parsed !== null ? (
          <div className="font-mono text-sm">
            <JSONNode value={parsed as JSONValue} name={null} level={0} defaultExpanded />
          </div>
        ) : (
          <pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{formatted}</pre>
        )}
      </div>
    </div>
  );
}

// Recursive node component for JSON tree
function JSONNode({
  value,
  name,
  level,
  defaultExpanded = false,
}: {
  value: JSONValue;
  name: string | null;
  level: number;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || level < 2);

  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;

  const entries = isObject
    ? Object.entries(value)
    : isArray
      ? value.map((v, i) => [i.toString(), v] as [string, JSONValue])
      : [];

  return (
    <div style={{ marginLeft: level > 0 ? 16 : 0 }}>
      <div
        className={cn("flex items-start gap-1 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50", isExpandable && "cursor-pointer")}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse icon */}
        {isExpandable ? (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
            {isExpanded ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-500" />}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* Key name */}
        {name !== null && (
          <>
            <span className="text-purple-600 dark:text-purple-400">{`"${name}"`}</span>
            <span className="text-zinc-500">:</span>
          </>
        )}

        {/* Value or preview */}
        {isExpandable ? (
          <span className="text-zinc-500">
            {isArray ? "[" : "{"}
            {!isExpanded && (
              <span className="text-zinc-500 dark:text-zinc-400 ml-1">
                {entries.length} {entries.length === 1 ? "item" : "items"}
              </span>
            )}
            {!isExpanded && (isArray ? "]" : "}")}
          </span>
        ) : (
          <ValueDisplay value={value} />
        )}
      </div>

      {/* Children */}
      {isExpandable && isExpanded && (
        <>
          {entries.map(([key, val]) => (
            <JSONNode key={key} name={isArray ? null : key} value={val} level={level + 1} />
          ))}
          <div style={{ marginLeft: 16 }} className="text-zinc-500">
            {isArray ? "]" : "}"}
          </div>
        </>
      )}
    </div>
  );
}

// Value display with type-based coloring
function ValueDisplay({ value }: { value: JSONValue }) {
  if (value === null) {
    return <span className="text-zinc-500 italic">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-orange-500 dark:text-orange-400">{value.toString()}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-cyan-600 dark:text-cyan-400">{value}</span>;
  }
  if (typeof value === "string") {
    // Truncate long strings
    const display = value.length > 100 ? value.slice(0, 100) + "..." : value;
    return <span className="text-green-600 dark:text-green-400">{`"${display}"`}</span>;
  }
  return null;
}
