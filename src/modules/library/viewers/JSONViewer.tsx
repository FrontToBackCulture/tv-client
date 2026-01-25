// src/modules/library/viewers/JSONViewer.tsx
// Collapsible tree view for JSON files

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import { cn } from "../../../lib/cn";

interface JSONViewerProps {
  content: string;
  filename: string;
}

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export function JSONViewer({ content, filename }: JSONViewerProps) {
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    try {
      return JSON.parse(content) as JSONValue;
    } catch {
      return null;
    }
  }, [content]);

  const handleCopy = async () => {
    try {
      // Pretty print for copy
      const formatted = JSON.stringify(parsed, null, 2);
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  if (parsed === null) {
    return (
      <div className="p-4">
        <div className="text-red-500 dark:text-red-400 text-sm mb-2">Invalid JSON</div>
        <pre className="text-sm font-mono text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap">{content}</pre>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-zinc-800">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{filename}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
        >
          {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="font-mono text-sm">
        <JSONNode value={parsed} name={null} level={0} defaultExpanded />
      </div>
    </div>
  );
}

// Recursive node component
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
        className={cn(
          "flex items-start gap-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800/50",
          isExpandable && "cursor-pointer"
        )}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse icon */}
        {isExpandable ? (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
            {isExpanded ? (
              <ChevronDown size={12} className="text-zinc-500" />
            ) : (
              <ChevronRight size={12} className="text-zinc-500" />
            )}
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
              <span className="text-zinc-400 dark:text-zinc-600 ml-1">
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
            <JSONNode
              key={key}
              name={isArray ? null : key}
              value={val}
              level={level + 1}
            />
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
