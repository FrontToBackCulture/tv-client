import type { PaymentMethod, OutletInfo } from "../../../lib/solutions/types";
import { isPMApplicable } from "./matrixHelpers";

// Shared render helpers used by Setup / DataLoad / Reconciliation tabs
// (extracted from the old MatrixImplementationTab).

export function Empty() {
  return <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">No items to show.</p>;
}

export function OutletCount({ count }: { count: number }) {
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">
      {count} outlets
    </span>
  );
}

type HeadCol = string | { label: string; className?: string };

export function THead({ cols }: { cols: HeadCol[] }) {
  return (
    <thead>
      <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {cols.map((c, i) => {
          const label = typeof c === "string" ? c : c.label;
          const extra = typeof c === "string" ? "" : (c.className || "");
          return (
            <th key={i} className={`text-left px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 ${extra}`}>{label}</th>
          );
        })}
      </tr>
    </thead>
  );
}

// ─── Shared column widths for cross-table visual alignment ───
// Applied to both <th> (via THead) and the matching <td> so the same columns
// line up across Bot Setup, POS Setup, Sync Tables, etc.
export const COL_NUM = "w-10";
export const COL_TYPE = "w-[90px]";
export const COL_NAME = "w-[130px]";
export const COL_SCOPE = "w-[240px]";
export const COL_SYNC_STATUS = "w-[140px]";
export const COL_PERIOD = "w-[100px]";
export const COL_STATUS = "w-[100px]";
export const COL_OWNER = "w-[90px]";
export const COL_NOTES = "w-[200px]";

/**
 * Iterate outlets × applicable payment methods, optionally grouped by entity header rows.
 * Used by Populate Mapping and Go Live tables.
 */
export function renderOutletPMRows(
  outlets: OutletInfo[],
  pms: PaymentMethod[],
  entities: { entity: string; count: number }[],
  showEntityHeaders: boolean,
  renderRow: (o: OutletInfo, pm: PaymentMethod, n: number) => React.ReactNode,
  colSpan: number = 8,
): React.ReactNode[] {
  let n = 0;
  if (showEntityHeaders) {
    return entities.flatMap(({ entity }) => {
      const entOutlets = outlets.filter((o) => o.entity === entity);
      return [
        <tr key={`hdr-${entity}`}>
          <td colSpan={colSpan} className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {entity} ({entOutlets.length})
            </span>
          </td>
        </tr>,
        ...entOutlets.flatMap((o) =>
          pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => { n++; return renderRow(o, pm, n); })
        ),
      ];
    });
  }
  return outlets.flatMap((o) =>
    pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => { n++; return renderRow(o, pm, n); })
  );
}

// ─── Provision status constants (used by SyncTable in Setup tab) ───

export const PROV_STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400",
  queued: "bg-blue-500/10 text-blue-400",
  syncing: "bg-blue-500/10 text-blue-400",
  done: "bg-emerald-500/10 text-emerald-400",
  error: "bg-red-500/10 text-red-400",
};

export const PROV_STATUS_LABELS: Record<string, string> = {
  pending: "Pending", queued: "Queued", syncing: "Syncing...", done: "Done", error: "Error",
};
