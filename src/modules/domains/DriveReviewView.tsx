// Per-domain Drive review — mirrors the artifact reviews (Queries/Workflows/…).
// A Files | Folders toggle switches the grid between individual VAL Drive
// FILES and FOLDERS, both from a live walk (no on-disk defs), merged with
// existing portal exposures of the matching kind, rendered through the shared
// ReviewGrid so the Portal/Sitemap columns + edit model are identical to
// "the rest". "Sync to Portal" reconciles into portal_resources:
//   - Files   → resource_type='drive_file'   (card deep-links the file viewer)
//   - Folders → resource_type='drive_folder' (card deep-links /valdrive/?folder=)
// Both deep-link straight into VAL's UI — the portal client is VAL-authed.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Globe,
  RefreshCw,
  Loader2,
  AlertTriangle,
  FileText,
  Folder,
} from "lucide-react";
import { ReviewGrid, type ReviewGridHandle } from "./ReviewGrid";
import type { ReviewRow } from "./reviewTypes";
import {
  useValDrivePortalResources,
  useSyncDriveResourcesToPortal,
  buildDriveFileUrl,
  buildDriveFolderUrl,
  type DrivePortalResource,
  type DriveResourceKind,
  type DriveFilesResult,
} from "../../hooks/val-sync";
import { toast } from "../../stores/toastStore";
import { cn } from "../../lib/cn";

type DriveMode = "files" | "folders";

const modeKind = (m: DriveMode): DriveResourceKind =>
  m === "folders" ? "drive_folder" : "drive_file";

// Folder levels to descend from val_drive when collecting entries. Depth 3
// covers typical layouts like val_drive/RevRec/01_SourceReports/<file>.
const MAX_WALK = 3;

function isFolderEntry(name: string, size: number | null): boolean {
  return (
    name.endsWith("/") ||
    (size === 0 && !name.includes(".") && !name.startsWith("."))
  );
}

function isSkippableFolder(clean: string): boolean {
  const lower = clean.toLowerCase();
  return (
    clean.startsWith(".") ||
    lower === "test" ||
    lower === "processed" ||
    lower.includes("output")
  );
}

// VAL returns a file's key/name as a URL-encoded full S3 path
// (val_drive%2FRevRec%2F…). Decode to a raw path so resource_id is canonical
// and human-readable; the proxy URL re-encodes exactly once.
function decodeKey(s: string): string {
  let cur = s;
  for (let i = 0; i < 5 && /%[0-9A-Fa-f]{2}/.test(cur); i++) {
    let dec: string;
    try {
      dec = decodeURIComponent(cur);
    } catch {
      break;
    }
    if (dec === cur) break;
    cur = dec;
  }
  return cur;
}

interface DriveEntry {
  path: string; // full VAL Drive file/folder path (== resource_id)
  name: string; // leaf name
}

const LIST_TIMEOUT_MS = 20_000; // a single slow folder must not block the walk
const WALK_CONCURRENCY = 6; // parallel val_drive_list_files calls per batch

/** List one folder's entries; null on error/timeout (skip, don't fail walk). */
async function listEntries(
  domain: string,
  folderId: string
): Promise<DriveFilesResult | null> {
  try {
    return await Promise.race([
      invoke<DriveFilesResult>("val_drive_list_files", { domain, folderId }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), LIST_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return null;
  }
}

/**
 * Breadth-walk val_drive to MAX_WALK depth. In `files` mode collect file
 * entries; in `folders` mode collect every non-skippable folder path
 * encountered (full path incl. the `val_drive/` prefix — that's what the
 * /prism/drive?path= deep-link and resource_id want). Each level's folders are
 * listed with bounded concurrency. `onProgress` reports folders scanned so the
 * UI isn't a blank skeleton.
 */
async function walkDrive(
  domain: string,
  mode: DriveMode,
  onProgress?: (scanned: number) => void
): Promise<DriveEntry[]> {
  const entries: DriveEntry[] = [];
  let frontier = ["val_drive"];
  let scanned = 0;

  for (let depth = 0; depth < MAX_WALK; depth++) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += WALK_CONCURRENCY) {
      const batch = frontier.slice(i, i + WALK_CONCURRENCY);
      const results = await Promise.all(
        batch.map((fid) => listEntries(domain, fid).then((r) => ({ fid, r })))
      );
      for (const { fid, r } of results) {
        scanned++;
        if (!r) continue;
        for (const f of r.files) {
          if (isFolderEntry(f.name, f.size)) {
            const clean = f.name.replace(/\/$/, "");
            if (isSkippableFolder(clean)) continue;
            const folderPath =
              fid === "val_drive" ? `val_drive/${clean}` : `${fid}/${clean}`;
            next.push(folderPath);
            if (mode === "folders") {
              entries.push({ path: folderPath, name: clean });
            }
          } else if (
            mode === "files" &&
            f.name.includes(".") &&
            !f.name.startsWith(".")
          ) {
            // f.id/f.name is the canonical key, URL-encoded as a full path.
            const decoded = decodeKey(f.id || f.name);
            const path = decoded.includes("/")
              ? decoded
              : `${fid}/${decoded}`;
            entries.push({ path, name: path.split("/").pop() || decoded });
          }
        }
      }
      onProgress?.(scanned);
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const seen = new Set<string>();
  return entries
    .filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function makeRow(
  domain: string,
  kind: DriveResourceKind,
  path: string,
  leafName: string,
  existing: DrivePortalResource | undefined
): ReviewRow {
  return {
    id: path,
    name: leafName,
    displayName: existing?.name ?? leafName,
    folderName: path, // full VAL Drive path == resource_id
    folderPath: path,
    isStale: false,
    category: null,
    subcategory: null,
    owner: null,
    verified: null,
    dataType: null,
    dataCategory: null,
    dataSubCategory: null,
    usageStatus: null,
    action: null,
    dataSource: null,
    sourceSystem: null,
    tags: null,
    suggestedName: null,
    summaryShort: existing?.description ?? null,
    summaryFull: null,
    includeSitemap: !!existing,
    sitemapGroup1: existing?.sitemap_group1 ?? null,
    sitemapGroup2: existing?.sitemap_group2 ?? null,
    solution: existing?.solution ?? null,
    // Always recompute — resource_url is derived from domain+path+kind, never
    // user-edited. Reading it back from an existing row would surface stale
    // URLs (e.g. the old proxy URL from a prior sync).
    resourceUrl:
      kind === "drive_folder"
        ? buildDriveFolderUrl(domain, path)
        : buildDriveFileUrl(domain, path),
    createdDate: null,
    updatedDate: null,
    hasOverview: null,
    columnCount: null,
    calculatedColumnCount: null,
    rowCount: null,
    tableType: null,
    daysSinceCreated: null,
    daysSinceUpdate: null,
    workflowCount: null,
    scheduledWorkflowCount: null,
    queryCount: null,
    dashboardCount: null,
    lastSampleAt: null,
    lastDetailsAt: null,
    lastAnalyzeAt: null,
    lastOverviewAt: null,
    space: null,
    tableName: null,
    fieldCount: null,
    widgetCount: null,
    creatorName: null,
    isScheduled: null,
    cronExpression: null,
    pluginCount: null,
    description: null,
    gaViews7d: null,
    gaViews30d: null,
    gaViews90d: null,
    gaUsers30d: null,
    gaLastViewed: null,
    gaHealthScore: null,
    gaHealthStatus: null,
  };
}

export function DriveReviewView({ domainName }: { domainName: string }) {
  const gridRef = useRef<ReviewGridHandle>(null);
  const [mode, setMode] = useState<DriveMode>("files");
  const [entries, setEntries] = useState<DriveEntry[] | null>(null);
  const [walkError, setWalkError] = useState<string | null>(null);
  const [walking, setWalking] = useState(true);
  const [scanned, setScanned] = useState(0);
  const [walkKey, setWalkKey] = useState(0);
  const [modifiedRows, setModifiedRows] = useState<Map<string, Partial<ReviewRow>>>(
    new Map()
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const kind = modeKind(mode);
  const exposuresQuery = useValDrivePortalResources(domainName, kind);
  const syncMutation = useSyncDriveResourcesToPortal();

  useEffect(() => {
    let cancelled = false;
    setWalking(true);
    setWalkError(null);
    setScanned(0);
    setEntries(null);
    walkDrive(domainName, mode, (n) => {
      if (!cancelled) setScanned(n);
    })
      .then((e) => {
        if (!cancelled) setEntries(e);
      })
      .catch((e) => {
        if (!cancelled)
          setWalkError(
            e instanceof Error ? e.message : "Failed to list VAL Drive"
          );
      })
      .finally(() => {
        if (!cancelled) setWalking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domainName, mode, walkKey]);

  const rows = useMemo<ReviewRow[]>(() => {
    if (!entries) return [];
    const exposed = exposuresQuery.data ?? [];
    const byId = new Map(exposed.map((e) => [e.resource_id, e]));
    const known = new Map(entries.map((e) => [e.path, e.name]));
    // Keep exposed entries even if not re-discovered, so they stay editable.
    for (const e of exposed) {
      if (!known.has(e.resource_id)) {
        known.set(
          e.resource_id,
          e.resource_id.replace(/\/$/, "").split("/").pop() || e.resource_id
        );
      }
    }
    return Array.from(known.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, name]) =>
        makeRow(domainName, kind, path, name, byId.get(path))
      );
  }, [entries, exposuresQuery.data, domainName, kind]);

  const handleCellEdited = useCallback(
    (key: string, field: string, value: unknown) => {
      setModifiedRows((prev) => {
        const next = new Map(prev);
        next.set(key, { ...(next.get(key) ?? {}), [field]: value });
        return next;
      });
    },
    []
  );

  const switchMode = useCallback(
    (m: DriveMode) => {
      if (m === mode) return;
      setModifiedRows(new Map());
      setMode(m);
    },
    [mode]
  );

  const handleSync = useCallback(async () => {
    const allRows = gridRef.current?.getAllRows() ?? [];
    setIsSyncing(true);
    try {
      const res = await syncMutation.mutateAsync({
        domain: domainName,
        kind,
        rows: allRows,
      });
      const parts: string[] = [];
      if (res.synced) parts.push(`${res.synced} synced`);
      if (res.removed) parts.push(`${res.removed} removed`);
      toast.success(`Portal: ${parts.join(", ") || "no changes"}`);
      setModifiedRows(new Map());
    } catch (e) {
      toast.error(`Sync failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setIsSyncing(false);
    }
  }, [domainName, kind, syncMutation]);

  const modeToggle = (
    <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {(
        [
          { m: "files" as const, label: "Files", Icon: FileText },
          { m: "folders" as const, label: "Folders", Icon: Folder },
        ]
      ).map(({ m, label, Icon }) => (
        <button
          key={m}
          onClick={() => switchMode(m)}
          title={`Review VAL Drive ${label.toLowerCase()}`}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
            mode === m
              ? "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
              : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          )}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );

  if (walking) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 size={24} className="animate-spin text-teal-500" />
        <p className="text-sm">
          Scanning VAL Drive {mode}… {scanned > 0 ? `${scanned} folders` : ""}
        </p>
      </div>
    );
  }

  if (walkError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">{walkError}</p>
          <button
            onClick={() => setWalkKey((k) => k + 1)}
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const toolbarActions = (
    <div className="flex items-center gap-1.5">
      {modeToggle}
      <button
        onClick={() => setWalkKey((k) => k + 1)}
        title={`Re-scan VAL Drive ${mode}`}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
      >
        <RefreshCw size={13} />
        Rescan
      </button>
      <button
        onClick={handleSync}
        disabled={isSyncing}
        title={`Reconcile flagged ${mode} to the client portal`}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
          isSyncing
            ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isSyncing ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Globe size={13} />
        )}
        {isSyncing ? "Syncing..." : "Sync to Portal"}
      </button>
    </div>
  );

  return (
    <ReviewGrid
      ref={gridRef}
      resourceType="drive_file"
      folderPath=""
      domainName={domainName}
      domainSlug={domainName}
      externalRows={rows}
      reviewMode
      onCellEdited={handleCellEdited}
      modifiedRows={modifiedRows}
      toolbarActions={toolbarActions}
    />
  );
}
