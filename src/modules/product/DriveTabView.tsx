// src/modules/product/DriveTabView.tsx
// Drive tab — browse VAL Drive files per domain with folder navigation

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Search,
  Loader2,
  FolderOpen,
  File,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  ScanSearch,
  CheckCircle2,
  XCircle,
  Clock,
  Settings2,
  Plus,
  X,
} from "lucide-react";
import {
  useDiscoverDomains,
  type DiscoveredDomain,
  useValDriveFolders,
  useValDriveFiles,
  useValDriveWorkflowFolders,
  type DriveFile,
  type DriveFilesResult,
  type DriveWorkflowFolder,
  type DriveScanConfig,
  useValDriveScanConfig,
  useValDriveScanConfigSave,
  useValDriveScanConfigSeed,
  useValDriveScanResults,
  useValDriveScanResultsSave,
} from "../../hooks/val-sync";
import { useRepository } from "../../stores/repositoryStore";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";

// ============================
// Constants
// ============================

const TYPE_ORDER = ["production", "not-active", "demo", "template"] as const;
const TYPE_LABELS: Record<string, string> = {
  production: "Production",
  "not-active": "Not Active",
  demo: "Demo",
  template: "Templates",
};
const DEFAULT_COLLAPSED = new Set(["not-active", "demo", "template"]);

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================
// Scan-all types
// ============================

interface ScanFile {
  folder: string;
  name: string;
  size: number | null;
  last_modified: string | null;
  stale: boolean;
}

interface DomainScanResult {
  domain: string;
  status: "clean" | "has-files" | "stale" | "error";
  files: ScanFile[];
  staleCount: number;
  error: string | null;
}

// ============================
// Helpers
// ============================

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isStale(lastModified: string | null | undefined): boolean {
  if (!lastModified) return false;
  const date = new Date(lastModified);
  if (isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > STALE_THRESHOLD_MS;
}

function groupByType(domains: DiscoveredDomain[]): Map<string, DiscoveredDomain[]> {
  const groups = new Map<string, DiscoveredDomain[]>();
  for (const type of TYPE_ORDER) {
    const items = domains.filter((d) => d.domain_type === type);
    if (items.length > 0) groups.set(type, items);
  }
  const known = new Set<string>(TYPE_ORDER as unknown as string[]);
  const other = domains.filter((d) => !known.has(d.domain_type));
  if (other.length > 0) groups.set("other", other);
  return groups;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// ============================
// Component
// ============================

export function DriveTabView() {
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository ? `${activeRepository.path}/0_Platform/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(DEFAULT_COLLAPSED)
  );

  // Scan-all state
  const [scanAllMode, setScanAllMode] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanResults, setScanResults] = useState<DomainScanResult[] | null>(null);

  // Scan config state
  const [showScanConfig, setShowScanConfig] = useState(false);
  const scanConfigQuery = useValDriveScanConfig();
  const scanConfigSave = useValDriveScanConfigSave();
  const scanConfigSeed = useValDriveScanConfigSeed();
  const [editingConfig, setEditingConfig] = useState<DriveScanConfig | null>(null);

  // Persisted scan results
  const cachedScanQuery = useValDriveScanResults();
  const scanResultsSave = useValDriveScanResultsSave();
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);

  // Load cached results on mount
  useEffect(() => {
    if (cachedScanQuery.data && !scanResults && !scanRunning) {
      const cached = cachedScanQuery.data;
      setLastScanAt(cached.last_scan_at);
      // Convert persisted results to component format
      const restored: DomainScanResult[] = cached.results.map((r) => ({
        domain: r.domain,
        status: r.status as DomainScanResult["status"],
        files: r.files.map((f) => ({
          folder: f.folder,
          name: f.name,
          size: f.size,
          last_modified: f.last_modified,
          stale: f.stale,
        })),
        staleCount: r.stale_count,
        error: r.error,
      }));
      setScanResults(restored);
      setScanAllMode(true);
    }
  }, [cachedScanQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Folder navigation (breadcrumb path stack)
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);

  const currentFolderId = folderPath.length > 0
    ? folderPath[folderPath.length - 1].id
    : "val_drive";

  const foldersQuery = useValDriveFolders(selectedDomain, currentFolderId);
  const filesQuery = useValDriveFiles(selectedDomain, currentFolderId);
  const wfFoldersQuery = useValDriveWorkflowFolders(selectedDomain);

  // Filter domains by search
  const filteredDomains = useMemo(() => {
    if (!domainsQuery.data) return [];
    if (!searchQuery.trim()) return domainsQuery.data;
    const q = searchQuery.toLowerCase();
    return domainsQuery.data.filter((d) => d.domain.toLowerCase().includes(q));
  }, [domainsQuery.data, searchQuery]);

  const grouped = useMemo(() => groupByType(filteredDomains), [filteredDomains]);

  const toggleSection = useCallback((type: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleSelectDomain = useCallback((domain: string) => {
    setSelectedDomain(domain);
    setScanAllMode(false);
    setFolderPath([]); // reset navigation
  }, []);

  // Scan all production domains for unprocessed files
  // Uses persisted scan config if available, otherwise falls back to workflow-based discovery
  const handleScanAll = useCallback(async () => {
    const productionDomains = (domainsQuery.data ?? []).filter(
      (d) => d.domain_type === "production"
    );
    if (productionDomains.length === 0) return;

    setScanAllMode(true);
    setSelectedDomain(null);
    setScanRunning(true);
    setScanResults(null);

    // Load persisted config — auto-seed if empty
    let config: DriveScanConfig;
    try {
      config = await invoke<DriveScanConfig>("val_drive_scan_config_load");
      if (Object.keys(config.domains).length === 0) {
        config = await invoke<DriveScanConfig>("val_drive_scan_config_seed");
      }
    } catch {
      config = { domains: {} };
    }

    const results: DomainScanResult[] = [];

    for (const d of productionDomains) {
      setScanProgress(`Checking ${d.domain}... (${results.length + 1}/${productionDomains.length})`);
      try {
        // Get enabled folders from config, or fall back to workflow discovery
        const domainConfig = config.domains[d.domain];
        let foldersToScan: { folder_path: string; move_to_processed: boolean }[] = [];

        if (domainConfig && domainConfig.folders.length > 0) {
          // Use persisted config — only scan enabled folders
          foldersToScan = domainConfig.folders
            .filter((f) => f.enabled)
            .map((f) => ({ folder_path: f.folder_path, move_to_processed: f.move_to_processed }));
        } else {
          // Fallback: discover from workflow configs
          try {
            const wfFolders = await invoke<DriveWorkflowFolder[]>("val_drive_workflow_folders", {
              domain: d.domain,
            });
            foldersToScan = wfFolders.map((f) => ({
              folder_path: f.folder_path,
              move_to_processed: f.move_to_processed,
            }));
          } catch {
            // No workflow configs — skip domain
          }
        }

        // Build lookup sets from configured folders
        const enabledFolderPaths = new Set(
          foldersToScan.map((f) => f.folder_path)
        );
        const processedFolders = new Set(
          foldersToScan.filter((f) => f.move_to_processed).map((f) => f.folder_path)
        );

        const expectsProcessed = (fp: string): boolean => {
          if (processedFolders.has(fp)) return true;
          for (const p of processedFolders) {
            if (fp.startsWith(p + "/")) return true;
          }
          return foldersToScan.length === 0;
        };

        // Check if a folder is in scope (enabled in config, or a subfolder of an enabled folder)
        const isInScope = (fp: string): boolean => {
          if (foldersToScan.length === 0) return true; // no config = scan everything
          if (enabledFolderPaths.has(fp)) return true;
          for (const p of enabledFolderPaths) {
            if (fp.startsWith(p + "/")) return true;
          }
          return false;
        };

        // Get top-level files (which includes folder-like entries)
        const filesResult = await invoke<DriveFilesResult>("val_drive_list_files", {
          domain: d.domain,
          folderId: "val_drive",
        });

        const topFolders = filesResult.files
          .filter((f) => f.name.endsWith("/"))
          .map((f) => f.name.replace(/\/$/, ""));

        let allUnprocessed: ScanFile[] = [];

        for (const folder of topFolders) {
          if (folder.startsWith(".") || folder.toLowerCase() === "test") continue;
          const folderId = `val_drive/${folder}`;

          // Skip folders not in the enabled scan config
          if (!isInScope(folderId)) continue;

          try {
            const subResult = await invoke<DriveFilesResult>("val_drive_list_files", {
              domain: d.domain,
              folderId,
            });

            const subFolders = subResult.files
              .filter((f) => f.name.endsWith("/"))
              .map((f) => f.name.replace(/\/$/, ""));
            const subFiles = subResult.files.filter(
              (f) => !f.name.endsWith("/") && f.name.includes(".")
            );

            if (expectsProcessed(folderId)) {
              for (const f of subFiles) {
                allUnprocessed.push({
                  folder: `${folder}`,
                  name: f.name,
                  size: f.size,
                  last_modified: f.last_modified,
                  stale: isStale(f.last_modified),
                });
              }
            }

            for (const sub of subFolders) {
              const subLower = sub.toLowerCase();
              if (subLower === "processed" || subLower.includes("output") || sub.startsWith(".")) continue;
              const subPath = `${folderId}/${sub}`;

              if (!expectsProcessed(subPath) && !expectsProcessed(folderId)) continue;

              try {
                const deepResult = await invoke<DriveFilesResult>("val_drive_list_files", {
                  domain: d.domain,
                  folderId: subPath,
                });
                const deepFiles = deepResult.files.filter(
                  (f) => !f.name.endsWith("/") && f.name.includes(".")
                );
                for (const f of deepFiles) {
                  allUnprocessed.push({
                    folder: `${folder}/${sub}`,
                    name: f.name,
                    size: f.size,
                    last_modified: f.last_modified,
                    stale: isStale(f.last_modified),
                  });
                }
              } catch {
                // skip errored sub-subfolders
              }
            }
          } catch {
            // skip errored subfolders
          }
        }

        const staleCount = allUnprocessed.filter((f) => f.stale).length;
        results.push({
          domain: d.domain,
          status: allUnprocessed.length === 0 ? "clean" : staleCount > 0 ? "stale" : "has-files",
          files: allUnprocessed,
          staleCount,
          error: null,
        });
      } catch (e) {
        results.push({
          domain: d.domain,
          status: "error",
          files: [],
          staleCount: 0,
          error: String(e),
        });
      }
    }

    setScanResults(results);
    setScanRunning(false);
    setScanProgress("");

    // Persist results
    const scanTime = new Date().toISOString();
    setLastScanAt(scanTime);
    scanResultsSave.mutate({
      last_scan_at: scanTime,
      results: results.map((r) => ({
        domain: r.domain,
        status: r.status,
        files: r.files.map((f) => ({
          folder: f.folder,
          name: f.name,
          size: f.size,
          last_modified: f.last_modified,
          stale: f.stale,
        })),
        stale_count: r.staleCount,
        error: r.error,
      })),
    });
  }, [domainsQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateToFolder = useCallback((id: string, name: string) => {
    setFolderPath((prev) => [...prev, { id, name }]);
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    if (index < 0) {
      setFolderPath([]);
    } else {
      setFolderPath((prev) => prev.slice(0, index + 1));
    }
  }, []);

  // Detect folder-like entries from the files response (API sometimes returns folders as files)
  const { pseudoFolders, actualFiles } = useMemo(() => {
    const files = filesQuery.data?.files ?? [];
    const folders: { id: string; name: string }[] = [];
    const real: DriveFile[] = [];

    for (const f of files) {
      // Entries with trailing "/" or zero size + no file extension are folders
      const isFolder =
        f.name.endsWith("/") ||
        (f.size === 0 && !f.name.includes(".") && !f.name.startsWith("."));
      if (isFolder) {
        const cleanName = f.name.replace(/\/$/, "");
        // Build the full path for navigation: currentFolderId + name
        const folderId = currentFolderId === "val_drive"
          ? `val_drive/${cleanName}`
          : `${currentFolderId}/${cleanName}`;
        folders.push({ id: folderId, name: cleanName });
      } else {
        real.push(f);
      }
    }

    return { pseudoFolders: folders, actualFiles: real };
  }, [filesQuery.data, currentFolderId]);

  // Merge API folders with pseudo-folders detected from files response
  const allFolders = useMemo(() => {
    const apiFolders = (foldersQuery.data ?? []).map((f) => ({ id: f.id, name: f.name }));
    const seen = new Set(apiFolders.map((f) => f.name));
    const merged = [...apiFolders];
    for (const pf of pseudoFolders) {
      if (!seen.has(pf.name)) {
        merged.push(pf);
        seen.add(pf.name);
      }
    }
    return merged;
  }, [foldersQuery.data, pseudoFolders]);

  // Check if the current folder is monitored by a workflow with moveFileToProcessedFolder
  const currentFolderWorkflow = useMemo(() => {
    const wfFolders = wfFoldersQuery.data ?? [];
    if (wfFolders.length === 0) return null;
    // Check if current folder or any parent matches a workflow folder
    for (const wf of wfFolders) {
      if (currentFolderId === wf.folder_path || currentFolderId.startsWith(wf.folder_path + "/")) {
        return wf;
      }
    }
    return null;
  }, [wfFoldersQuery.data, currentFolderId]);

  const folderExpectsProcessed = currentFolderWorkflow?.move_to_processed ?? false;

  // Separate unprocessed vs processed files
  const { unprocessedFiles, processedFiles } = useMemo(() => {
    const unprocessed: DriveFile[] = [];
    const processed: DriveFile[] = [];

    for (const f of actualFiles) {
      // Files in a "processed" folder path are considered processed
      if (
        currentFolderId.includes("/processed") ||
        f.id.includes("/processed/") ||
        f.name.startsWith("processed/")
      ) {
        processed.push(f);
      } else {
        unprocessed.push(f);
      }
    }

    // Sort by last_modified desc (newest first for processed, oldest first for unprocessed to highlight stale)
    unprocessed.sort((a, b) => {
      const aTime = a.last_modified ? new Date(a.last_modified).getTime() : 0;
      const bTime = b.last_modified ? new Date(b.last_modified).getTime() : 0;
      return aTime - bTime; // oldest first
    });
    processed.sort((a, b) => {
      const aTime = a.last_modified ? new Date(a.last_modified).getTime() : 0;
      const bTime = b.last_modified ? new Date(b.last_modified).getTime() : 0;
      return bTime - aTime; // newest first
    });

    return { unprocessedFiles: unprocessed, processedFiles: processed };
  }, [actualFiles, currentFolderId]);

  const isLoading = foldersQuery.isLoading || filesQuery.isLoading;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left sidebar: domain list ── */}
      <div className="w-[220px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        {/* Search + Scan All */}
        <div className="p-2 border-b border-zinc-100 dark:border-zinc-800/50 space-y-1.5">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              placeholder="Filter domains..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleScanAll}
              disabled={scanRunning}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded transition-colors",
                scanRunning
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-wait"
                  : "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/50 border border-teal-200 dark:border-teal-800"
              )}
            >
              {scanRunning ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ScanSearch size={12} />
              )}
              {scanRunning ? "Scanning..." : "Scan All"}
            </button>
            <button
              onClick={() => {
                setShowScanConfig(true);
                setScanAllMode(false);
                setSelectedDomain(null);
                setEditingConfig(null);
              }}
              className={cn(
                "flex items-center justify-center px-1.5 py-1.5 text-[11px] rounded transition-colors border",
                showScanConfig
                  ? "bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700"
                  : "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
              title="Scan configuration"
            >
              <Settings2 size={12} />
            </button>
          </div>
        </div>

        {/* Domain list */}
        <div className="flex-1 overflow-y-auto py-1">
          {domainsQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-zinc-400" />
            </div>
          )}

          {Array.from(grouped.entries()).map(([type, domains]) => {
            const isCollapsed = collapsedSections.has(type);
            return (
              <div key={type}>
                <button
                  onClick={() => toggleSection(type)}
                  className="w-full flex items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
                >
                  {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                  {TYPE_LABELS[type] ?? type} ({domains.length})
                </button>
                {!isCollapsed &&
                  domains.map((d) => (
                    <button
                      key={d.domain}
                      onClick={() => handleSelectDomain(d.domain)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                        selectedDomain === d.domain
                          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      )}
                    >
                      <HardDrive size={12} className="flex-shrink-0 opacity-50" />
                      <span className="truncate">{d.domain}</span>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right content: file browser ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showScanConfig ? (
          <ScanConfigPanel
            config={editingConfig ?? scanConfigQuery.data ?? { domains: {} }}
            isLoading={scanConfigQuery.isLoading}
            isSaving={scanConfigSave.isPending}
            isSeeding={scanConfigSeed.isPending}
            onChange={setEditingConfig}
            onSave={(cfg) => {
              scanConfigSave.mutate(cfg, {
                onSuccess: () => setEditingConfig(null),
              });
            }}
            onSeed={() => {
              scanConfigSeed.mutate(undefined, {
                onSuccess: (data) => setEditingConfig(data),
              });
            }}
            onClose={() => {
              setShowScanConfig(false);
              setEditingConfig(null);
            }}
          />
        ) : scanAllMode ? (
          <ScanAllView
            running={scanRunning}
            progress={scanProgress}
            results={scanResults}
            lastScanAt={lastScanAt}
            onSelectDomain={handleSelectDomain}
            onRescan={handleScanAll}
            onClose={() => setScanAllMode(false)}
          />
        ) : !selectedDomain ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-400">
            <HardDrive size={36} className="opacity-20" />
            <p className="text-sm">Select a domain to browse Drive files</p>
            <button
              onClick={handleScanAll}
              disabled={scanRunning}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors"
            >
              <ScanSearch size={14} />
              Scan All Domains for Unprocessed Files
            </button>
          </div>
        ) : (
          <>
            {/* Breadcrumb */}
            <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
              <button
                onClick={() => navigateToBreadcrumb(-1)}
                className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors font-medium"
              >
                val_drive
              </button>
              {folderPath.map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight size={10} className="text-zinc-300 dark:text-zinc-600" />
                  <button
                    onClick={() => navigateToBreadcrumb(i)}
                    className={cn(
                      "hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors",
                      i === folderPath.length - 1 && "font-medium text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    {seg.name}
                  </button>
                </span>
              ))}

              {/* Refresh */}
              <button
                onClick={() => {
                  foldersQuery.refetch();
                  filesQuery.refetch();
                }}
                className="ml-auto p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-zinc-400" />
                </div>
              )}

              {!isLoading && (
                <>
                  {/* Folders */}
                  {allFolders.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                        Folders ({allFolders.length})
                      </h3>
                      <div className="space-y-0.5">
                        {allFolders.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => navigateToFolder(folder.id, folder.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded transition-colors group"
                          >
                            <FolderOpen
                              size={14}
                              className="flex-shrink-0 text-amber-500 dark:text-amber-400"
                            />
                            <span className="truncate flex-1 text-left">{folder.name}</span>
                            <ChevronRight
                              size={12}
                              className="flex-shrink-0 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unprocessed files */}
                  {unprocessedFiles.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 flex items-center gap-2">
                        {folderExpectsProcessed ? "Unprocessed Files" : "Files"} ({unprocessedFiles.length})
                        {currentFolderWorkflow && (
                          <span className={cn(
                            "text-[9px] font-normal normal-case tracking-normal px-1.5 py-0.5 rounded",
                            folderExpectsProcessed
                              ? "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          )}>
                            {folderExpectsProcessed ? "moves to processed/" : "stays in place"}
                          </span>
                        )}
                      </h3>
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                        {unprocessedFiles.map((file, i) => (
                          <FileRow key={file.id} file={file} showStaleWarning={folderExpectsProcessed} index={i} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Processed files */}
                  {processedFiles.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                        Recently Processed ({processedFiles.length})
                      </h3>
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                        {processedFiles.map((file, i) => (
                          <FileRow key={file.id} file={file} showStaleWarning={false} index={i} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {allFolders.length === 0 &&
                    unprocessedFiles.length === 0 &&
                    processedFiles.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                        <HardDrive size={32} className="mb-3 opacity-30" />
                        <p className="text-sm">No files or folders found</p>
                        <p className="text-xs mt-1">This folder may be empty</p>
                      </div>
                    )}

                  {/* Error states */}
                  {foldersQuery.error && (
                    <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded">
                      Folders error: {String(foldersQuery.error)}
                    </div>
                  )}
                  {filesQuery.error && (
                    <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded">
                      Files error: {String(filesQuery.error)}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================
// Scan Config panel
// ============================

function ScanConfigPanel({
  config,
  isLoading,
  isSaving,
  isSeeding,
  onChange,
  onSave,
  onSeed,
  onClose,
}: {
  config: DriveScanConfig;
  isLoading: boolean;
  isSaving: boolean;
  isSeeding: boolean;
  onChange: (config: DriveScanConfig) => void;
  onSave: (config: DriveScanConfig) => void;
  onSeed: () => void;
  onClose: () => void;
}) {
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(() => new Set());
  const [addingFolder, setAddingFolder] = useState<string | null>(null); // domain currently adding to
  const [newFolderPath, setNewFolderPath] = useState("");

  const domainEntries = useMemo(
    () =>
      Object.entries(config.domains).sort(([a], [b]) => a.localeCompare(b)),
    [config]
  );

  const toggleDomain = (domain: string) => {
    setCollapsedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const toggleFolder = (domain: string, folderPath: string) => {
    const updated = structuredClone(config);
    const folder = updated.domains[domain]?.folders.find(
      (f) => f.folder_path === folderPath
    );
    if (folder) {
      folder.enabled = !folder.enabled;
      onChange(updated);
    }
  };

  const removeFolder = (domain: string, folderPath: string) => {
    const updated = structuredClone(config);
    const domainConfig = updated.domains[domain];
    if (domainConfig) {
      domainConfig.folders = domainConfig.folders.filter(
        (f) => f.folder_path !== folderPath
      );
      onChange(updated);
    }
  };

  const addFolder = (domain: string) => {
    const path = newFolderPath.trim();
    if (!path) return;
    const updated = structuredClone(config);
    if (!updated.domains[domain]) {
      updated.domains[domain] = { folders: [] };
    }
    // Don't add duplicates
    if (updated.domains[domain].folders.some((f) => f.folder_path === path)) {
      setNewFolderPath("");
      setAddingFolder(null);
      return;
    }
    updated.domains[domain].folders.push({
      folder_path: path,
      enabled: true,
      move_to_processed: false,
      source: "manual",
    });
    onChange(updated);
    setNewFolderPath("");
    setAddingFolder(null);
  };

  const isEmpty = domainEntries.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center gap-3 flex-shrink-0">
        <Settings2 size={14} className="text-teal-500" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Scan Configuration
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onSeed}
            disabled={isSeeding}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {isSeeding ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            {isSeeding ? "Seeding..." : "Seed from Workflows"}
          </button>
          <button
            onClick={() => onSave(config)}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors"
          >
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : null}
            Save
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        )}

        {!isLoading && isEmpty && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
            <Settings2 size={32} className="opacity-20" />
            <p className="text-sm">No scan configuration found</p>
            <p className="text-xs">Click "Seed from Workflows" to auto-discover folders from workflow configs</p>
            <button
              onClick={onSeed}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors"
            >
              {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Seed from Workflows
            </button>
          </div>
        )}

        {!isLoading &&
          domainEntries.map(([domain, domainConfig]) => {
            const isCollapsed = collapsedDomains.has(domain);
            const enabledCount = domainConfig.folders.filter((f) => f.enabled).length;
            const totalCount = domainConfig.folders.length;

            return (
              <div
                key={domain}
                className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
              >
                {/* Domain header */}
                <button
                  onClick={() => toggleDomain(domain)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="text-zinc-400" />
                  ) : (
                    <ChevronDown size={12} className="text-zinc-400" />
                  )}
                  <HardDrive size={12} className="text-zinc-400" />
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {domain}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-auto">
                    {totalCount} folder{totalCount !== 1 ? "s" : ""}, {enabledCount} enabled
                  </span>
                </button>

                {/* Folder list */}
                {!isCollapsed && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800/50">
                    {domainConfig.folders.map((folder) => (
                      <div
                        key={folder.folder_path}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 text-xs border-b border-zinc-50 dark:border-zinc-800/30 last:border-b-0",
                          !folder.enabled && "opacity-50"
                        )}
                      >
                        <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={folder.enabled}
                            onChange={() => toggleFolder(domain, folder.folder_path)}
                            className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
                          />
                          <span className="truncate text-zinc-700 dark:text-zinc-300">
                            {folder.folder_path}
                          </span>
                        </label>
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded flex-shrink-0",
                            folder.source === "workflow"
                              ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          )}
                        >
                          {folder.source === "workflow" ? "wf" : "manual"}
                        </span>
                        {folder.move_to_processed && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 flex-shrink-0">
                            processed
                          </span>
                        )}
                        {folder.source === "manual" && (
                          <button
                            onClick={() => removeFolder(domain, folder.folder_path)}
                            className="p-0.5 text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Remove folder"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add folder */}
                    {addingFolder === domain ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-zinc-100 dark:border-zinc-800/50">
                        <input
                          type="text"
                          value={newFolderPath}
                          onChange={(e) => setNewFolderPath(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addFolder(domain);
                            if (e.key === "Escape") {
                              setAddingFolder(null);
                              setNewFolderPath("");
                            }
                          }}
                          placeholder="val_drive/..."
                          className="flex-1 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                          autoFocus
                        />
                        <button
                          onClick={() => addFolder(domain)}
                          className="px-2 py-1 text-xs text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setAddingFolder(null);
                            setNewFolderPath("");
                          }}
                          className="px-1 py-1 text-xs text-zinc-400 hover:text-zinc-600 rounded transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingFolder(domain)}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors border-t border-zinc-100 dark:border-zinc-800/50"
                      >
                        <Plus size={10} />
                        Add folder
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ============================
// Scan All view
// ============================

function ScanAllView({
  running,
  progress,
  results,
  lastScanAt,
  onSelectDomain,
  onRescan,
  onClose,
}: {
  running: boolean;
  progress: string;
  results: DomainScanResult[] | null;
  lastScanAt: string | null;
  onSelectDomain: (domain: string) => void;
  onRescan: () => void;
  onClose: () => void;
}) {
  if (running) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 size={28} className="animate-spin text-teal-500" />
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Scanning all domains...</p>
        <p className="text-xs">{progress}</p>
      </div>
    );
  }

  if (!results) return null;

  const stale = results.filter((r) => r.status === "stale");
  const hasFiles = results.filter((r) => r.status === "has-files");
  const clean = results.filter((r) => r.status === "clean");
  const errors = results.filter((r) => r.status === "error");
  const totalStale = results.reduce((acc, r) => acc + r.staleCount, 0);
  const totalFiles = results.reduce((acc, r) => acc + r.files.length, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center gap-3 flex-shrink-0">
        <ScanSearch size={14} className="text-teal-500" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Drive Scan — All Domains
        </span>
        {lastScanAt && (
          <span className="text-[10px] text-zinc-400" title={new Date(lastScanAt).toLocaleString()}>
            Last scanned {formatRelativeTime(lastScanAt)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onRescan}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <RefreshCw size={11} />
            Rescan
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center gap-6 text-xs flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-400">Domains:</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{results.length}</span>
        </div>
        {totalFiles > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Unprocessed:</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">{totalFiles} files</span>
          </div>
        )}
        {totalStale > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-amber-500" />
            <span className="font-medium text-amber-600 dark:text-amber-400">{totalStale} stale (&gt;24h)</span>
          </div>
        )}
        {totalFiles === 0 && totalStale === 0 && (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={11} />
            <span className="font-medium">All clean</span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stale domains (needs attention) */}
        {stale.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
              <AlertTriangle size={10} />
              Stale Files — Needs Attention ({stale.length})
            </h3>
            {stale.map((r) => (
              <ScanDomainCard key={r.domain} result={r} onSelect={onSelectDomain} />
            ))}
          </div>
        )}

        {/* Domains with recent files */}
        {hasFiles.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1">
              <Clock size={10} />
              Unprocessed — Monitoring ({hasFiles.length})
            </h3>
            {hasFiles.map((r) => (
              <ScanDomainCard key={r.domain} result={r} onSelect={onSelectDomain} />
            ))}
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-2 flex items-center gap-1">
              <XCircle size={10} />
              Failed ({errors.length})
            </h3>
            {errors.map((r) => (
              <div key={r.domain} className="px-3 py-2 text-xs bg-red-50 dark:bg-red-950/20 rounded mb-1">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.domain}</span>
                <span className="text-red-500 ml-2">{r.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* Clean domains */}
        {clean.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 flex items-center gap-1">
              <CheckCircle2 size={10} />
              Clean ({clean.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {clean.map((r) => (
                <button
                  key={r.domain}
                  onClick={() => onSelectDomain(r.domain)}
                  className="px-2 py-1 text-xs bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/40 transition-colors"
                >
                  {r.domain} ✓
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScanDomainCard({
  result,
  onSelect,
}: {
  result: DomainScanResult;
  onSelect: (domain: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = result.files.length > 5;
  const visibleFiles = expanded ? result.files : result.files.slice(0, 5);

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => onSelect(result.domain)}
        className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
      >
        <HardDrive size={13} className="flex-shrink-0 text-zinc-400" />
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{result.domain}</span>
        <span className="text-xs text-zinc-400 ml-auto">
          {result.files.length} file{result.files.length !== 1 ? "s" : ""}
          {result.staleCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400 ml-1">
              ({result.staleCount} stale)
            </span>
          )}
        </span>
        <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-600" />
      </button>
      {result.files.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/50">
          {visibleFiles.map((f, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs",
                i > 0 && "border-t border-zinc-50 dark:border-zinc-800/30",
                f.stale && "bg-amber-50/50 dark:bg-amber-950/10"
              )}
            >
              <File size={11} className="flex-shrink-0 text-zinc-300" />
              <span className="text-zinc-500 truncate">{f.folder}/</span>
              <span className="text-zinc-700 dark:text-zinc-300 truncate">{f.name}</span>
              <span className="text-zinc-400 ml-auto flex-shrink-0">{formatFileSize(f.size)}</span>
              <span
                className={cn(
                  "flex-shrink-0 w-16 text-right",
                  f.stale ? "text-amber-600 dark:text-amber-400 font-medium" : "text-zinc-400"
                )}
              >
                {formatRelativeTime(f.last_modified)}
              </span>
              {f.stale && (
                <span title="Stale (>24h)">
                  <AlertTriangle size={10} className="flex-shrink-0 text-amber-500" />
                </span>
              )}
            </div>
          ))}
          {hasMore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="w-full px-3 py-1.5 text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-center border-t border-zinc-50 dark:border-zinc-800/30 transition-colors"
            >
              {expanded
                ? "Show less"
                : `Show all ${result.files.length} files (+${result.files.length - 5} more)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================
// File row sub-component
// ============================

function FileRow({
  file,
  showStaleWarning,
  index,
}: {
  file: DriveFile;
  showStaleWarning: boolean;
  index: number;
}) {
  const ext = getFileExtension(file.name);
  const stale = showStaleWarning && isStale(file.last_modified);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm",
        index > 0 && "border-t border-zinc-100 dark:border-zinc-800/50",
        stale && "bg-amber-50/50 dark:bg-amber-950/10"
      )}
    >
      <File size={13} className="flex-shrink-0 text-zinc-400" />
      <span className="truncate flex-1 text-zinc-700 dark:text-zinc-300">{file.name}</span>
      {ext && (
        <span className="text-[10px] uppercase font-medium text-zinc-400 dark:text-zinc-500 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">
          {ext}
        </span>
      )}
      <span className="text-xs text-zinc-400 dark:text-zinc-500 w-16 text-right flex-shrink-0">
        {formatFileSize(file.size)}
      </span>
      <span
        className={cn(
          "text-xs w-20 text-right flex-shrink-0",
          stale
            ? "text-amber-600 dark:text-amber-400 font-medium"
            : "text-zinc-400 dark:text-zinc-500"
        )}
      >
        {formatRelativeTime(file.last_modified)}
      </span>
      {stale && (
        <span title="File older than 24 hours">
          <AlertTriangle size={12} className="flex-shrink-0 text-amber-500" />
        </span>
      )}
    </div>
  );
}
