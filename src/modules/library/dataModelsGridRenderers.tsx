// DataModelsAgGrid: Cell renderers and style helpers

import type { ICellRendererParams } from "ag-grid-community";
import type { TableInfo } from "./dataModelsGridTypes";

// Name cell renderer with documentation indicator
export const NameCellRenderer = (params: ICellRendererParams<TableInfo>) => {
  const data = params.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2">
      {data.hasOverview ? (
        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Has overview" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="No overview" />
      )}
      <span className="font-medium">{data.displayName || data.name}</span>
    </div>
  );
};

// Status badge cell renderer
export const StatusCellRenderer = (params: ICellRendererParams) => {
  const value = params.value;
  if (!value || value === "-") {
    return <span className="text-zinc-500">-</span>;
  }

  let className = "px-2 py-0.5 rounded text-xs font-medium ";
  switch (value) {
    case "In Use":
      className += "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      break;
    case "Not Used":
      className += "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      break;
    case "Historically Used":
      className += "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      break;
    case "I Dunno":
      className += "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
      break;
    default:
      className += "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
  }

  return <span className={className}>{value}</span>;
};

// Action badge cell renderer
export const ActionCellRenderer = (params: ICellRendererParams) => {
  const value = params.value;
  if (!value || value === "-" || value === "None") {
    return <span className="text-zinc-500">-</span>;
  }

  let className = "px-2 py-0.5 rounded text-xs font-medium ";
  switch (value) {
    case "To Review":
      className += "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      break;
    case "To Delete":
      className += "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      break;
    case "Approved":
      className += "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      break;
    default:
      className += "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
  }

  return <span className={className}>{value}</span>;
};

// Days cell renderer with color coding
export const DaysCellRenderer = (params: ICellRendererParams) => {
  const value = params.value;
  if (value === null || value === undefined) {
    return <span className="text-zinc-500">-</span>;
  }

  let className = "tabular-nums ";
  if (value <= 1) {
    className += "text-green-400";
  } else if (value <= 7) {
    className += "text-blue-400";
  } else if (value <= 30) {
    className += "text-amber-400";
  } else {
    className += "text-red-400";
  }

  return <span className={className}>{value}</span>;
};

// Tag style helper - light and dark mode
export const getTagStyle = (tag: string, type: string) => {
  if (type === "status") {
    switch (tag) {
      case "In Use": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
      case "Not Used": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
      case "Historically Used": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
      case "I Dunno": return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
      default: return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
    }
  }
  if (type === "action") {
    switch (tag) {
      case "To Review": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
      case "To Delete": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
      default: return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
    }
  }
  if (type === "category") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400";
  if (type === "subCategory") return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400";
  if (type === "dataSource") return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400";
  if (type === "dataType") return "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400";
  if (type === "tag") return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
};

// Tags cell renderer
export const TagsCellRenderer = (params: ICellRendererParams<TableInfo>) => {
  const data = params.data;
  if (!data) return null;

  const tags: { value: string; type: string }[] = [];
  const seenValues = new Set<string>();

  const addTag = (value: string | null, type: string) => {
    if (value && value !== "-" && !seenValues.has(value)) {
      if (type === "status" && value === "I Dunno") return;
      if (type === "action" && value === "None") return;
      seenValues.add(value);
      tags.push({ value, type });
    }
  };

  addTag(data.dataCategory, "category");
  addTag(data.dataSubCategory, "subCategory");
  addTag(data.dataSource, "dataSource");
  addTag(data.dataType, "dataType");
  addTag(data.usageStatus, "status");
  addTag(data.action, "action");

  // Add actual tags from classification (comma-separated string)
  if (data.tags) {
    data.tags.split(",").forEach(tag => {
      const trimmed = tag.trim();
      if (trimmed) {
        addTag(trimmed, "tag");
      }
    });
  }

  if (tags.length === 0) {
    return <span className="text-zinc-500">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1 py-1">
      {tags.map((tag, index) => (
        <span
          key={index}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getTagStyle(tag.value, tag.type)}`}
        >
          {tag.value}
        </span>
      ))}
    </div>
  );
};
