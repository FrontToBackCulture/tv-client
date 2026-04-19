// Contracts — master data management for subscription contracts.
//
// Each row = one QBO Estimate + editable overlay (start/end/auto-renewal).
// Monthly subscription amount is derived from estimate total / contract months
// once start + end are set.
//
// Estimates come from QBO (already synced). Overlay lives in `orderforms`
// keyed by orderform_code = estimate.doc_number.

import { useMemo, useState } from "react";
import {
  useContracts,
  useUpsertOrderform,
  type Contract,
} from "../../hooks/finance/useFyReview";
import { formatDate, formatMoney } from "./formatters";
import { cn } from "../../lib/cn";

type StatusFilter = "all" | "Accepted" | "Pending" | "Closed";

export function ContractsView() {
  const { data: contracts, isLoading } = useContracts();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Accepted");
  const [search, setSearch] = useState("");
  const [showOnlyUnannotated, setShowOnlyUnannotated] = useState(false);

  const filtered = useMemo(() => {
    if (!contracts) return [];
    return contracts.filter((c) => {
      if (statusFilter !== "all" && c.estimate.status !== statusFilter) return false;
      if (showOnlyUnannotated && c.overlay?.start_date && c.overlay?.end_date) return false;
      if (search) {
        const needle = search.toLowerCase();
        if (
          !(c.customer_name.toLowerCase().includes(needle) ||
            c.estimate.doc_number?.toLowerCase().includes(needle))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [contracts, statusFilter, search, showOnlyUnannotated]);

  const counts = useMemo(() => {
    const all = contracts ?? [];
    const annotated = all.filter((c) => c.overlay?.start_date && c.overlay?.end_date);
    return {
      total: all.length,
      annotated: annotated.length,
      accepted: all.filter((c) => c.estimate.status === "Accepted").length,
      pending: all.filter((c) => c.estimate.status === "Pending").length,
      closed: all.filter((c) => c.estimate.status === "Closed").length,
    };
  }, [contracts]);

  if (isLoading) return <div className="text-sm text-zinc-500">Loading contracts…</div>;

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="text-xs text-zinc-500 max-w-3xl">
        Each row is a QBO Estimate. Estimate details (customer, total) come from QBO.
        You maintain the contract overlay — start date, end date, and auto-renewal — so
        we can derive the monthly recognition amount and validate QBO JEs against it.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <StatTile label="Total" value={counts.total} />
        <StatTile label="Accepted" value={counts.accepted} tone="ok" />
        <StatTile label="Pending" value={counts.pending} tone="warn" />
        <StatTile label="Closed" value={counts.closed} tone="neutral" />
        <StatTile label="Annotated" value={counts.annotated} tone={counts.annotated === counts.total ? "ok" : "warn"} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          >
            <option value="all">All</option>
            <option value="Accepted">Accepted</option>
            <option value="Pending">Pending</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or estimate #"
          className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-1 max-w-sm"
        />
        <label className="text-xs text-zinc-500 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyUnannotated}
            onChange={(e) => setShowOnlyUnannotated(e.target.checked)}
          />
          Only unannotated
        </label>
        <div className="text-xs text-zinc-500 ml-auto">
          {filtered.length} of {counts.total} contracts
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs min-w-full">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-medium min-w-[90px]">Estimate #</th>
                <th className="px-3 py-2 text-left font-medium min-w-[220px]">Customer</th>
                <th className="px-3 py-2 text-left font-medium">QBO Status</th>
                <th className="px-3 py-2 text-right font-medium">Est. Date</th>
                <th className="px-3 py-2 text-right font-medium" title="Gross total incl. GST">Total (gross)</th>
                <th className="px-3 py-2 text-right font-medium" title="Sum of subscription lines, pre-tax">SUB (net)</th>
                <th className="px-3 py-2 text-right font-medium" title="Sum of service/professional-services lines, pre-tax">SVC (net)</th>
                <th className="px-3 py-2 text-left font-medium">SUB Start</th>
                <th className="px-3 py-2 text-left font-medium">SUB End</th>
                <th className="px-3 py-2 text-right font-medium" title="SUB net ÷ SUB months">Monthly SUB</th>
                <th className="px-3 py-2 text-left font-medium" title="Override for service recognition start. Defaults to SUB Start if empty.">SVC Start</th>
                <th className="px-3 py-2 text-left font-medium" title="Override for service recognition end. Defaults to SUB End if empty.">SVC End</th>
                <th className="px-3 py-2 text-right font-medium" title="SVC net ÷ SVC months">Monthly SVC</th>
                <th className="px-3 py-2 text-center font-medium">Auto-renew</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <ContractRow key={c.estimate.qbo_id} contract={c} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-6 text-center text-zinc-500">
                    No contracts match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ContractRow({ contract }: { contract: Contract }) {
  const upsert = useUpsertOrderform();
  const { estimate, overlay, customer_name } = contract;
  const code = estimate.doc_number ?? estimate.qbo_id;

  const save = (patch: {
    start_date?: string | null;
    end_date?: string | null;
    svc_start_date?: string | null;
    svc_end_date?: string | null;
    auto_renewal?: boolean;
  }) => {
    upsert.mutate({
      orderform_code: code,
      customer_qbo_id: estimate.customer_qbo_id ?? undefined,
      customer_name,
      source_estimate_id: estimate.qbo_id,
      start_date: patch.start_date !== undefined ? patch.start_date : overlay?.start_date ?? null,
      end_date: patch.end_date !== undefined ? patch.end_date : overlay?.end_date ?? null,
      svc_start_date: patch.svc_start_date !== undefined ? patch.svc_start_date : overlay?.svc_start_date ?? null,
      svc_end_date: patch.svc_end_date !== undefined ? patch.svc_end_date : overlay?.svc_end_date ?? null,
      auto_renewal: patch.auto_renewal !== undefined ? patch.auto_renewal : overlay?.auto_renewal ?? false,
      status: overlay?.status ?? "active",
    });
  };

  const start = overlay?.start_date ?? "";
  const end = overlay?.end_date ?? "";
  const svcStart = overlay?.svc_start_date ?? "";
  const svcEnd = overlay?.svc_end_date ?? "";
  const subMonths = computeMonths(start, end);
  // For SVC, fall back to SUB dates when override is empty (per user policy).
  const effectiveSvcStart = svcStart || start;
  const effectiveSvcEnd = svcEnd || end;
  const svcMonths = computeMonths(effectiveSvcStart, effectiveSvcEnd);
  const monthlySub = subMonths > 0 && contract.sub_net > 0 ? contract.sub_net / subMonths : null;
  const monthlySvc = svcMonths > 0 && contract.svc_net > 0 ? contract.svc_net / svcMonths : null;
  const annotated = !!start && !!end;

  return (
    <tr className={cn(
      "border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-950",
      !annotated && estimate.status === "Accepted" && "bg-amber-50/40 dark:bg-amber-950/20",
    )}>
      <td className="px-3 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">{code}</td>
      <td className="px-3 py-1.5 text-zinc-800 dark:text-zinc-200">{customer_name}</td>
      <td className="px-3 py-1.5">
        <StatusBadge status={estimate.status ?? ""} />
      </td>
      <td className="px-3 py-1.5 text-right text-zinc-600 dark:text-zinc-400">{formatDate(estimate.txn_date)}</td>
      <td
        className="px-3 py-1.5 text-right tabular-nums text-zinc-500"
        title={`Net ${formatMoney(contract.net_total)} + Tax ${formatMoney(contract.tax_total)}`}
      >
        {formatMoney(estimate.total_amount)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
        {contract.sub_net === 0 ? "—" : formatMoney(contract.sub_net)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
        {contract.svc_net === 0 ? "—" : formatMoney(contract.svc_net)}
      </td>
      <td className="px-3 py-1.5">
        <DateInput
          value={start}
          onCommit={(v) => save({ start_date: v || null })}
          disabled={upsert.isPending}
        />
      </td>
      <td className="px-3 py-1.5">
        <DateInput
          value={end}
          onCommit={(v) => save({ end_date: v || null })}
          disabled={upsert.isPending}
        />
      </td>
      <td
        className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300"
        title={subMonths > 0 ? `${subMonths} months` : undefined}
      >
        {monthlySub == null ? "—" : formatMoney(monthlySub)}
      </td>
      <td className="px-3 py-1.5">
        <DateInput
          value={svcStart}
          placeholder={start || undefined}
          onCommit={(v) => save({ svc_start_date: v || null })}
          disabled={upsert.isPending || contract.svc_net === 0}
        />
      </td>
      <td className="px-3 py-1.5">
        <DateInput
          value={svcEnd}
          placeholder={end || undefined}
          onCommit={(v) => save({ svc_end_date: v || null })}
          disabled={upsert.isPending || contract.svc_net === 0}
        />
      </td>
      <td
        className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300"
        title={svcMonths > 0 ? `${svcMonths} months` : undefined}
      >
        {monthlySvc == null ? "—" : formatMoney(monthlySvc)}
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={overlay?.auto_renewal ?? false}
          onChange={(e) => save({ auto_renewal: e.target.checked })}
          disabled={upsert.isPending}
        />
      </td>
    </tr>
  );
}

function DateInput({
  value,
  onCommit,
  disabled,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setLocal(value);
  }
  return (
    <input
      type="date"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      disabled={disabled}
      title={!value && placeholder ? `Defaults to ${placeholder}` : undefined}
      className={cn(
        "text-xs px-1.5 py-1 rounded border bg-white dark:bg-zinc-900 w-[7.5rem]",
        !value && placeholder
          ? "border-zinc-200 dark:border-zinc-800 text-zinc-400"
          : "border-zinc-300 dark:border-zinc-700",
      )}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Accepted" ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
    : status === "Pending" ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
    : status === "Closed" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600";
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium", tone)}>
      {status || "—"}
    </span>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "neutral";
}) {
  const cls = {
    ok: "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    warn: "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    neutral: "bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800",
  }[tone];
  return (
    <div className={cn("rounded-md border p-3", cls)}>
      <div className="text-[10px] uppercase tracking-wide font-medium opacity-70">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function computeMonths(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  const months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth()) +
    1; // inclusive
  return Math.max(0, months);
}
