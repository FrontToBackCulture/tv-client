// Side-by-side JSON diff of a table definition between the master domain
// and a target client domain, sourced from val_table_definitions.
//
// MVP-level highlighting: line-by-line compare of canonicalized JSON. Lines
// present only on one side are coloured; lines present on both are neutral.
// Good enough to spot schema drift without pulling in a diff library.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { canonicalize } from "../hooks/useTableDriftRefresh";

interface TableDriftDiffModalProps {
  masterDomain: string;
  targetDomain: string;
  tableId: string;
  driftStatus: string;
  /** Which definition table to read. Defaults to "table" so existing
   *  callers stay valid; new callers pass "query"/"workflow"/"dashboard"
   *  to diff the corresponding val_<type>_definitions row. */
  resourceType?: "table" | "query" | "workflow" | "dashboard";
  onClose: () => void;
}

interface TableDefRow {
  domain: string;
  resource_id: string;
  display_name: string | null;
  definition: unknown;
  definition_hash: string | null;
  field_count: number | null;
  calculated_field_count: number | null;
  updated_date: string | null;
  synced_at: string | null;
  deleted: boolean;
}

/** Per-resource-type config: which Supabase table holds the definition,
 *  what the id column is called, and whether the id is text or numeric. */
const RESOURCE_CFG: Record<NonNullable<TableDriftDiffModalProps["resourceType"]>, {
  table: string;
  idColumn: string;
  numericId: boolean;
  label: string;
}> = {
  table:     { table: "val_table_definitions",     idColumn: "table_id",  numericId: false, label: "Table" },
  query:     { table: "val_query_definitions",     idColumn: "query_id",  numericId: false, label: "Query" },
  workflow:  { table: "val_workflow_definitions",  idColumn: "id",        numericId: true,  label: "Workflow" },
  dashboard: { table: "val_dashboard_definitions", idColumn: "id",        numericId: true,  label: "Dashboard" },
};

function stringifyCanonical(value: unknown): string {
  // Use the exact same canonicalizer that produces definition_hash. That
  // way the visual diff aligns 1:1 with what drives drift_status — no
  // false positives from volatile fields like dft_nodefields_id, IDs,
  // timestamps. Anything still different here is real drift.
  return JSON.stringify(canonicalize(value), null, 2);
}

export function TableDriftDiffModal({
  masterDomain,
  targetDomain,
  tableId,
  driftStatus,
  resourceType = "table",
  onClose,
}: TableDriftDiffModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [master, setMaster] = useState<TableDefRow | null>(null);
  const [target, setTarget] = useState<TableDefRow | null>(null);

  const cfg = RESOURCE_CFG[resourceType];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Workflows/dashboards key on bigint; queries/tables on text. Cast
        // tableId to the right shape so the .eq() picks up matching rows.
        // Also: workflow/dashboard tables don't have field_count / display_name
        // / calculated_field_count columns — select only what exists, and
        // map into the shared TableDefRow shape.
        const idValue: string | number = cfg.numericId ? Number(tableId) : tableId;
        const baseCols = `domain, definition, definition_hash, synced_at, deleted, updated_date`;
        const cols = resourceType === "table"
          ? `${baseCols}, ${cfg.idColumn}, display_name, field_count, calculated_field_count`
          : resourceType === "query"
          ? `${baseCols}, ${cfg.idColumn}, display_name`
          : `${baseCols}, ${cfg.idColumn}, name`;
        const { data, error: err } = await supabase
          .from(cfg.table)
          .select(cols)
          .eq(cfg.idColumn, idValue)
          .in("domain", [masterDomain, targetDomain]);
        if (err) throw new Error(err.message);
        if (cancelled) return;
        // Normalise the returned rows into TableDefRow regardless of source.
        // Supabase's typed client can't infer a row shape from a dynamic
        // `from(cfg.table)`, hence the cast.
        const rows: TableDefRow[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
          domain: r.domain as string,
          resource_id: String(r[cfg.idColumn] ?? tableId),
          display_name: (r.display_name as string | null) ?? (r.name as string | null) ?? null,
          definition: r.definition,
          definition_hash: (r.definition_hash as string | null) ?? null,
          field_count: (r.field_count as number | null) ?? null,
          calculated_field_count: (r.calculated_field_count as number | null) ?? null,
          updated_date: (r.updated_date as string | null) ?? null,
          synced_at: (r.synced_at as string | null) ?? null,
          deleted: !!r.deleted,
        }));
        setMaster(rows.find((r) => r.domain === masterDomain) ?? null);
        setTarget(rows.find((r) => r.domain === targetDomain) ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [masterDomain, targetDomain, tableId, resourceType, cfg]);

  // Compute the line sets so we can colour rows that exist only on one side.
  const { masterLines, targetLines, masterOnly, targetOnly } = useMemo(() => {
    const mStr = master?.definition ? stringifyCanonical(master.definition) : "";
    const tStr = target?.definition ? stringifyCanonical(target.definition) : "";
    const mLines = mStr.split("\n");
    const tLines = tStr.split("\n");
    const mSet = new Set(mLines);
    const tSet = new Set(tLines);
    const mOnly = new Set(mLines.filter((l) => !tSet.has(l)));
    const tOnly = new Set(tLines.filter((l) => !mSet.has(l)));
    return { masterLines: mLines, targetLines: tLines, masterOnly: mOnly, targetOnly: tOnly };
  }, [master, target]);

  const colourForStatus = (s: string) => {
    switch (s) {
      case "in_sync": return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "drifted": return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
      case "missing": return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      default: return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
    }
  };

  // ESC closes — same pattern as JobsModal. Backdrop click closes via the
  // onClick handler on the wrapper that compares e.target to e.currentTarget.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Synchronized scrolling — when the user scrolls one pane, the other
  // follows. `isSyncing` ref breaks the feedback loop (A → B → A → ...).
  // Scroll fires on every frame, so we use a ref instead of state to
  // avoid React re-renders.
  const masterScrollRef = useRef<HTMLDivElement | null>(null);
  const targetScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);

  const makeScrollHandler = (
    sourceRef: React.MutableRefObject<HTMLDivElement | null>,
    targetRef: React.MutableRefObject<HTMLDivElement | null>,
  ) => () => {
    if (isSyncingRef.current) return;
    const src = sourceRef.current;
    const tgt = targetRef.current;
    if (!src || !tgt) return;
    isSyncingRef.current = true;
    tgt.scrollTop = src.scrollTop;
    tgt.scrollLeft = src.scrollLeft;
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 w-[92vw] h-[88vh] flex flex-col animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {cfg.label} drift · <span className="font-mono text-zinc-600 dark:text-zinc-400">{tableId}</span>
              {(master?.display_name || target?.display_name) && (
                <span className="text-zinc-500 dark:text-zinc-400 ml-1">— {master?.display_name || target?.display_name}</span>
              )}
            </h3>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colourForStatus(driftStatus)}`}>
              {driftStatus}
            </span>
            {master?.definition_hash && target?.definition_hash && (
              <span className="text-[10px] font-mono text-zinc-400">
                {master.definition_hash.slice(0, 8)} ↔ {target.definition_hash.slice(0, 8)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800">
          {/* Master */}
          <Pane
            title={`${masterDomain} (master)`}
            row={master}
            lines={masterLines}
            onlyHere={masterOnly}
            highlightClass="bg-amber-50 dark:bg-amber-900/20"
            loading={loading}
            error={error}
            scrollRef={masterScrollRef}
            onScroll={makeScrollHandler(masterScrollRef, targetScrollRef)}
          />
          {/* Target */}
          <Pane
            title={`${targetDomain} (deployed)`}
            row={target}
            lines={targetLines}
            onlyHere={targetOnly}
            highlightClass="bg-amber-50 dark:bg-amber-900/20"
            loading={loading}
            error={error}
            scrollRef={targetScrollRef}
            onScroll={makeScrollHandler(targetScrollRef, masterScrollRef)}
          />
        </div>
      </div>
    </div>
  );
}

function Pane({
  title,
  row,
  lines,
  onlyHere,
  highlightClass,
  loading,
  error,
  scrollRef,
  onScroll,
}: {
  title: string;
  row: TableDefRow | null;
  lines: string[];
  onlyHere: Set<string>;
  highlightClass: string;
  loading: boolean;
  error: string | null;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{title}</span>
        {row && (
          <span className="text-[10px] text-zinc-400">
            {row.field_count !== null && (
              <>{row.field_count} fields · {row.calculated_field_count ?? 0} calc · </>
            )}
            synced {row.synced_at ? new Date(row.synced_at).toLocaleString() : "—"}
          </span>
        )}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            <Loader2 className="animate-spin mr-2" size={14} /> Loading…
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-red-500">{error}</div>
        ) : !row ? (
          <div className="p-4 text-xs text-zinc-500 italic">No definition synced for this domain. Run Refresh Drift.</div>
        ) : (
          <pre className="text-[11px] font-mono leading-snug">
            {lines.map((line, i) => (
              <div
                key={i}
                className={`px-3 ${onlyHere.has(line) ? highlightClass : ""}`}
              >
                {line || " "}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
