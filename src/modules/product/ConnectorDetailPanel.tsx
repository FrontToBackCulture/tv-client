// src/modules/product/ConnectorDetailPanel.tsx
// Detail panel — shows connector info + sub-connector folders from synced source

import { useState, useMemo } from "react";
import { useProductConnectorWithRelations } from "../../hooks/product";
import { useGitHubSyncConfig } from "../../hooks/github-sync";
import {
  useFolderEntries,
  useFolderFiles,
  type FolderEntry,
} from "../../hooks/useFolderFiles";
import { CONNECTOR_TYPES, CONNECTOR_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import {
  X,
  Loader2,
  FileCode,
  FileText,
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "../../lib/cn";

interface ConnectorDetailPanelProps {
  id: string;
  onClose: () => void;
}

export function ConnectorDetailPanel({
  id,
  onClose,
}: ConnectorDetailPanelProps) {
  const { data, isLoading } = useProductConnectorWithRelations(id);
  const { data: syncConfig } = useGitHubSyncConfig();

  // Derive the connector's source folder from sync config rules
  const sourceFolder = useMemo(() => {
    if (!data || !syncConfig) return null;
    return findConnectorSourceFolder(
      data.name,
      data.doc_path,
      syncConfig.repositories
    );
  }, [data, syncConfig]);

  const { data: entries, isLoading: entriesLoading } =
    useFolderEntries(sourceFolder);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Connector not found
      </div>
    );
  }

  const typeDef = CONNECTOR_TYPES.find((t) => t.value === data.connector_type);
  const statusDef = CONNECTOR_STATUSES.find((s) => s.value === data.status);

  const folders = (entries ?? []).filter((e) => e.is_directory);
  const topFiles = (entries ?? []).filter((e) => !e.is_directory);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {data.name}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && (
              <StatusChip label={statusDef.label} color={statusDef.color} />
            )}
            {typeDef && (
              <StatusChip label={typeDef.label} color={typeDef.color} />
            )}
            {data.platform_category && (
              <span className="text-xs text-zinc-400">
                {data.platform_category}
              </span>
            )}
            {data.region && (
              <span className="text-xs text-zinc-400">{data.region}</span>
            )}
          </div>
          {data.description && (
            <p className="text-xs text-zinc-500 mt-1.5">{data.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 self-start"
        >
          <X size={16} />
        </button>
      </div>

      {/* Sub-connector folders */}
      <div className="flex-1 overflow-auto p-4">
        {!sourceFolder && (
          <p className="text-sm text-zinc-500">
            No source folder found. Load a sync config to see sub-connectors.
          </p>
        )}

        {sourceFolder && entriesLoading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 size={14} className="animate-spin" />
            Loading...
          </div>
        )}

        {sourceFolder && !entriesLoading && folders.length === 0 && topFiles.length === 0 && (
          <p className="text-sm text-zinc-500">
            No files synced yet. Run GitHub Sync to populate.
          </p>
        )}

        {folders.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-zinc-400 mb-2">
              {folders.length} sub-connector{folders.length !== 1 ? "s" : ""}
            </div>
            {folders.map((folder) => (
              <SubConnectorFolder key={folder.path} folder={folder} />
            ))}
          </div>
        )}

        {/* Top-level files (outside sub-folders) */}
        {topFiles.length > 0 && (
          <div className={cn("space-y-0.5", folders.length > 0 && "mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800")}>
            <div className="text-xs text-zinc-400 mb-2">Files</div>
            {topFiles.map((f) => (
              <SourceFileRow key={f.path} name={f.name} size={f.size} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-connector folder ──────────────────────────────────

function SubConnectorFolder({ folder }: { folder: FolderEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { data: files, isLoading } = useFolderFiles(
    expanded ? folder.path : null,
    100
  );

  const fileList = (files ?? []).filter((f) => !f.is_directory);

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
          expanded
            ? "bg-zinc-50 dark:bg-zinc-900/50"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
        )}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-zinc-400 flex-shrink-0" />
        )}
        {expanded ? (
          <FolderOpen size={16} className="text-teal-500 flex-shrink-0" />
        ) : (
          <FolderClosed size={16} className="text-zinc-400 flex-shrink-0" />
        )}
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {folder.name}
        </span>
        {expanded && fileList.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {fileList.length} file{fileList.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {isLoading && (
            <div className="px-3 py-2 text-xs text-zinc-400">
              <Loader2 size={12} className="animate-spin inline mr-1" />
              Loading...
            </div>
          )}
          {!isLoading && fileList.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400">Empty</div>
          )}
          {fileList.map((f) => (
            <SourceFileRow key={f.path} name={f.name} size={f.size} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── File row ──────────────────────────────────────────────

function SourceFileRow({ name, size }: { name: string; size: number }) {
  const ext = name.split(".").pop() || "";
  const isCode = ["ts", "js", "tsx", "jsx", "json", "yml", "yaml"].includes(
    ext
  );
  const sizeStr =
    size < 1024
      ? `${size} B`
      : size < 1024 * 1024
        ? `${(size / 1024).toFixed(1)} KB`
        : `${(size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900/20">
      {isCode ? (
        <FileCode size={14} className="text-zinc-400 flex-shrink-0" />
      ) : (
        <FileText size={14} className="text-zinc-400 flex-shrink-0" />
      )}
      <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate">
        {name}
      </span>
      <span className="ml-auto text-zinc-400 flex-shrink-0">{sizeStr}</span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Find the source folder for a connector by matching its name against
 * sync config rule targetPaths. Falls back to doc_path if set.
 */
function findConnectorSourceFolder(
  connectorName: string,
  docPath: string | null,
  repos: { rules: { targetPath: string; name?: string }[] }[]
): string | null {
  const nameLower = connectorName.toLowerCase();

  // Search all repos' rules for a targetPath ending with the connector name
  for (const repo of repos) {
    for (const rule of repo.rules) {
      const pathEnd = rule.targetPath.split("/").pop()?.toLowerCase() || "";
      if (
        pathEnd === nameLower ||
        pathEnd === nameLower.replace(/\s+/g, "-")
      ) {
        return rule.targetPath;
      }
      if (rule.name?.toLowerCase().includes(nameLower)) {
        return rule.targetPath;
      }
    }
  }

  // Fallback: if doc_path is set and looks like an absolute path
  if (docPath && docPath.startsWith("/")) {
    return docPath;
  }

  // Try constructing from a common connectors base + name slug
  for (const repo of repos) {
    if (repo.rules.length > 0) {
      const firstPath = repo.rules[0].targetPath;
      const base = firstPath.substring(0, firstPath.lastIndexOf("/"));
      if (base.includes("connectors")) {
        return `${base}/${nameLower.replace(/\s+/g, "-")}`;
      }
    }
  }

  return null;
}
