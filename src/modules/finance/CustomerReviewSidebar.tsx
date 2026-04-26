// Customer-review sidebar for the Invoice Recognition view.
//
// Lists every customer with invoice lines in the currently-loaded period,
// each annotated with:
//   * how many lines they have and how many are reconciled (JEs tie to
//     invoice amount, or line is marked reviewed)
//   * total unreconciled invoice amount
//   * a status pill: emerald if everything's clean, rose otherwise
//
// Clicking a customer sets the page-level Customer filter; clicking "All"
// clears it. Unreconciled customers sort to the top so the user's eye
// jumps to what still needs attention.

import { useMemo, useState } from "react";
import { PanelLeftClose, Search, Layers, AlertTriangle, Circle, Package, CreditCard, CheckCircle2 } from "lucide-react";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { cn } from "../../lib/cn";
import { formatMoney } from "./formatters";
import type { InvoiceLineWithRecognition, ParsedRecognitionJe } from "../../hooks/finance/useFyReview";

type ViewMode = "all" | "issues" | "partial" | "acceptedVariance" | "jeOnly" | "clean";

function CustomerRow({
  stat,
  selected,
  onSelect,
}: {
  stat: CustomerStats;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const status = statusOf(stat);
  const dot = status === "issues" ? "bg-rose-500"
    : status === "partial" ? "bg-amber-500"
    : status === "acceptedVariance" ? "bg-violet-500"
    : status === "jeOnly" ? "bg-sky-500"
    : "bg-emerald-500";
  const tone = status === "issues" ? "text-rose-600 dark:text-rose-400"
    : status === "partial" ? "text-amber-600 dark:text-amber-400"
    : status === "acceptedVariance" ? "text-violet-600 dark:text-violet-400"
    : status === "jeOnly" ? "text-sky-600 dark:text-sky-400"
    : "text-emerald-600 dark:text-emerald-400";
  const variance = stat.totalInvoiced - stat.totalJeSum;
  const resolvedLines = stat.tiedLines + stat.acceptedLines;
  return (
    <button
      onClick={() => onSelect(stat.customerId)}
      className={cn(
        "w-full flex flex-col gap-0.5 px-2 py-1 rounded text-[12px] transition-colors text-left",
        selected
          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
      )}
    >
      <div className="flex items-center gap-1.5 w-full">
        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)} />
        <span className="truncate flex-1" title={stat.customerName}>
          {stat.customerName}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-3 text-[10px]">
        <span className={cn("tabular-nums", tone)}>
          {resolvedLines}/{stat.totalLines} lines
        </span>
        {status === "issues" && (
          <span className="tabular-nums text-rose-600 dark:text-rose-400" title="Customer-total variance (invoiced − JEs)">
            · {formatMoney(variance)}
          </span>
        )}
        {status === "partial" && (
          <span className="tabular-nums text-amber-600 dark:text-amber-400" title="Customer-total ties; individual lines don't">
            · total ties
          </span>
        )}
        {status === "acceptedVariance" && (
          <span className="tabular-nums text-violet-600 dark:text-violet-400" title="Accepted-as-adjustment lines present">
            · 📌 {stat.acceptedLines} accepted
          </span>
        )}
        {status === "jeOnly" && (
          <span className="tabular-nums text-sky-600 dark:text-sky-400" title="No invoices in this period — only JE activity">
            · JE only
          </span>
        )}
      </div>
    </button>
  );
}

interface CustomerStats {
  customerId: string;
  customerName: string;
  totalLines: number;
  tiedLines: number;          // lines that actually tie (or are $0)
  acceptedLines: number;      // lines flagged accepted_as_adjustment
  unreconciledAmount: number; // sum of line.amount for problem lines
  totalInvoiced: number;      // sum of line.amount across all lines
  totalJeSum: number;         // sum of JE amounts across all lines
}

// Five-state status:
//   clean            — every line genuinely ties
//   acceptedVariance — resolved but via "accepted as adjustment" (auditable)
//   partial          — per-line variance exists, but customer-total ties
//   issues           — customer-total doesn't tie (real missing/excess JEs)
//   jeOnly           — no invoices in the period but JEs are present (orphan
//                      adjustment JEs, migration entries, or invoices that
//                      fall outside the visible window)
type CustomerStatus = "clean" | "acceptedVariance" | "partial" | "issues" | "jeOnly";
function statusOf(s: CustomerStats): CustomerStatus {
  if (s.totalLines === 0) return "jeOnly";
  const resolved = s.tiedLines + s.acceptedLines;
  if (resolved < s.totalLines) {
    return Math.abs(s.totalInvoiced - s.totalJeSum) < 0.01 ? "partial" : "issues";
  }
  if (s.acceptedLines > 0) return "acceptedVariance";
  return "clean";
}

interface Props {
  groupedInvoices: { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }[];
  matchedByLineKey: Map<string, ParsedRecognitionJe[]>;
  unmatchedJes: ParsedRecognitionJe[];
  standaloneJes: ParsedRecognitionJe[];
  customerNameById: Map<string, string>;
  selectedCustomer: string; // "all" or qbo_id
  onSelect: (customerId: string) => void;
  onCollapse: () => void;
}

export function CustomerReviewSidebar({
  groupedInvoices,
  matchedByLineKey,
  unmatchedJes,
  standaloneJes,
  customerNameById,
  selectedCustomer,
  onSelect,
  onCollapse,
}: Props) {
  const [query, setQuery] = useState("");

  const stats = useMemo<CustomerStats[]>(() => {
    const byCustomer = new Map<string, CustomerStats>();
    for (const g of groupedInvoices) {
      for (const line of g.lines) {
        const amt = Number(line.amount ?? 0);
        const customerId = line.customer_qbo_id ?? "";
        const customerName = customerId
          ? customerNameById.get(customerId) ?? "(unknown)"
          : "(no customer)";
        let s = byCustomer.get(customerId);
        if (!s) {
          s = { customerId, customerName, totalLines: 0, tiedLines: 0, acceptedLines: 0, unreconciledAmount: 0, totalInvoiced: 0, totalJeSum: 0 };
          byCustomer.set(customerId, s);
        }
        s.totalLines += 1;
        s.totalInvoiced += amt;
        const matched = matchedByLineKey.get(`${line.qbo_invoice_id}-${line.qbo_line_id}`) ?? [];
        const jeSum = matched.reduce((t, j) => t + Number(j.amount ?? 0), 0);
        s.totalJeSum += jeSum;
        const isZero = amt === 0;
        const ties = matched.length > 0 && Math.abs(amt - jeSum) < 0.01;
        // Review = the user has explicitly looked at this line and locked it
        // in. Treat as tied regardless of cent-level drift — the sidebar is
        // about "who still needs attention", not bookkeeping precision.
        if (isZero || ties || line.is_reviewed) {
          s.tiedLines += 1;
        } else if (line.accepted_as_adjustment) {
          s.acceptedLines += 1;
        } else {
          s.unreconciledAmount += amt;
        }
      }
    }

    // Augment with customers who have JEs in the period (unmatched orphans
    // or accepted-as-adjustment standalones) but no invoice line in view.
    // These show up as "JE-only" so the user can see + select them in the
    // sidebar, even though they have nothing to reconcile against.
    const addJeCustomer = (j: ParsedRecognitionJe) => {
      const customerId = j.customer_qbo_id ?? "";
      if (byCustomer.has(customerId)) return;
      const customerName = customerId
        ? customerNameById.get(customerId) ?? j.customer_name ?? "(unknown)"
        : (j.customer_name ?? "(no customer)");
      byCustomer.set(customerId, {
        customerId, customerName,
        totalLines: 0, tiedLines: 0, acceptedLines: 0,
        unreconciledAmount: 0, totalInvoiced: 0, totalJeSum: 0,
      });
    };
    for (const j of unmatchedJes) addJeCustomer(j);
    for (const j of standaloneJes) addJeCustomer(j);

    const order: Record<CustomerStatus, number> = { issues: 0, partial: 1, acceptedVariance: 2, jeOnly: 3, clean: 4 };
    return [...byCustomer.values()].sort((a, b) => {
      const sa = statusOf(a), sb = statusOf(b);
      if (sa !== sb) return order[sa] - order[sb];
      return a.customerName.localeCompare(b.customerName);
    });
  }, [groupedInvoices, matchedByLineKey, unmatchedJes, standaloneJes, customerNameById]);

  const filtered = useMemo(() => {
    if (!query) return stats;
    const needle = query.toLowerCase();
    return stats.filter((s) => s.customerName.toLowerCase().includes(needle));
  }, [stats, query]);

  // Status buckets — used both for VIEW button counts and for flat-list
  // rendering when a single view is selected. Search is applied first
  // (`filtered`) so counts reflect what the search actually hits.
  const withIssues = filtered.filter((s) => statusOf(s) === "issues");
  const partialMatch = filtered.filter((s) => statusOf(s) === "partial");
  const acceptedVariance = filtered.filter((s) => statusOf(s) === "acceptedVariance");
  const jeOnly = filtered.filter((s) => statusOf(s) === "jeOnly");
  const fullyMatched = filtered.filter((s) => statusOf(s) === "clean");

  // VIEW filter (persisted). Mirrors ExpenseReview's top-level "VIEW" menu.
  // "all" shows every customer; the others narrow to a single status.
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem("tv-finance-cust-view");
      if (raw === "issues" || raw === "partial" || raw === "acceptedVariance" || raw === "jeOnly" || raw === "clean" || raw === "all") return raw;
    } catch { /* ignore */ }
    return "all";
  });
  const setViewPersist = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem("tv-finance-cust-view", v); } catch { /* ignore */ }
  };

  const viewCounts: Record<ViewMode, number> = {
    all: filtered.length,
    issues: withIssues.length,
    partial: partialMatch.length,
    acceptedVariance: acceptedVariance.length,
    jeOnly: jeOnly.length,
    clean: fullyMatched.length,
  };

  const displayed = view === "all" ? filtered
    : view === "issues" ? withIssues
    : view === "partial" ? partialMatch
    : view === "acceptedVariance" ? acceptedVariance
    : view === "jeOnly" ? jeOnly
    : fullyMatched;

  const totalCustomers = stats.length;
  const problemCustomers = stats.filter((s) => statusOf(s) === "issues").length;
  const totalUnreconciled = stats.filter((s) => statusOf(s) === "issues").reduce((t, s) => t + s.unreconciledAmount, 0);
  const grandTotal = useMemo(() => stats.reduce((a, b) => a + b.totalInvoiced, 0), [stats]);

  const VIEWS: { id: ViewMode; label: string; icon: typeof Layers }[] = [
    { id: "all",              label: "All",               icon: Layers },
    { id: "issues",           label: "With issues",       icon: AlertTriangle },
    { id: "partial",          label: "Partial match",     icon: Circle },
    { id: "acceptedVariance", label: "Accepted variance", icon: Package },
    { id: "jeOnly",           label: "JE only",           icon: CreditCard },
    { id: "clean",            label: "Fully matched",     icon: CheckCircle2 },
  ];

  return (
    <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden">
      {/* Header — mirrors ExpenseReview sidebar's "VIEW" label pattern
          (small uppercase, count on right). Collapse button tucks in front of
          the label. Summary line below preserves the reconciled/issues state. */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 mb-1">
          <button
            onClick={onCollapse}
            className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors shrink-0"
            title="Collapse panel"
          >
            <PanelLeftClose size={12} />
          </button>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 flex-1">Customers</div>
          <span className="text-[10px] text-zinc-500 tabular-nums">{totalCustomers}</span>
        </div>
        {problemCustomers > 0 ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">
            {problemCustomers} with issues · {formatMoney(totalUnreconciled)} unreconciled
          </p>
        ) : totalCustomers > 0 ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">All reconciled ✓</p>
        ) : (
          <p className="text-[11px] text-zinc-500">No invoices in period</p>
        )}
        {/* Search — inside the header block so it sits flush with the label,
            matching the chrome density of ExpenseReview's header. */}
        <div className="relative mt-2">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter customers…"
            className="w-full text-[12px] pl-6 pr-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* VIEW section — flat status filter buttons (mirrors ExpenseReview
          "VIEW" top menu). Replaces the collapsible status sections; the same
          status groupings are now expressed as a top-level filter. */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <CollapsibleSection title="View" storageKey="customer-review:view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewPersist(v.id)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                view === v.id
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
              )}
            >
              <span className="flex items-center gap-2">
                <v.icon size={13} />
                {v.label}
              </span>
              <span className="text-[11px] text-zinc-500">{viewCounts[v.id]}</span>
            </button>
          ))}
        </CollapsibleSection>
      </div>

      {/* Scroll region — "All customers" anchor (grand total $) + flat list
          of customers in the currently selected VIEW. */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <button
          onClick={() => onSelect("all")}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px] mb-1",
            selectedCustomer === "all"
              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          <span className="font-medium">All customers</span>
          <span className="text-[11px] font-mono text-zinc-500">{formatMoney(grandTotal)}</span>
        </button>

        {displayed.map((s) => (
          <CustomerRow
            key={s.customerId || `no-customer-${statusOf(s)}`}
            stat={s}
            selected={selectedCustomer === s.customerId}
            onSelect={onSelect}
          />
        ))}
        {displayed.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-zinc-500 text-center italic">
            {query ? "No matches" : "—"}
          </div>
        )}
      </div>
    </div>
  );
}

