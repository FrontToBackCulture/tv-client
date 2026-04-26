// Expense Review — P&L expense lines from QBO Bills + Expenses, grouped by
// FS line (same order as FY Review P&L) with per-payee drill-down.
//
// Left sidebar: sections → FS lines (Cost of Sales / Expenses / Other
// Expenses). Click a line to filter the grid. Click "All" to see everything.
// Main grid: payee rows (vendor or individual) with per-payee subtotals and
// expandable line details. View modes across the top (needs review, Staff
// CC, cap candidates, capitalised, anomalies).
//
// Source: SQL view expense_lines_unified (joins fy_fs_mapping + overlay).

import { useMemo, useState, useRef, useEffect, useCallback, Fragment } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CreditCard,
  Layers,
  Package,
  Receipt,
  RefreshCw,
  Search,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import {
  useExpenseLinesUnified,
  useExpenseReviewConfig,
  useUpsertExpenseLineReview,
  useCapitalisationJes,
  buildCapJePreview,
  type ExpenseLineUnified,
  type ExpenseAnomalyFlag,
  type ExpenseClaimStatus,
} from "../../hooks/finance/useExpenseReview";
import { useQboAccounts } from "../../hooks/finance/useQboData";
import { useTriggerSync, usePostAccrual } from "../../hooks/finance/useTriggerSync";
import {
  displaySection,
  sectionOrder,
  sectionLabel,
  fsLineDisplayLabel,
} from "./fsLineLabels";
import { formatDate, formatMoney } from "./formatters";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";

// ─── Date ranges ─────────────────────────────────────────────────────────

type DatePreset = "fy24" | "fy25" | "ytd" | "all" | "custom";
type ViewMode = "all" | "needs_review" | "staff_cc" | "cap_candidates" | "capitalised" | "anomalies";

interface DateRange { start: string; end: string; label: string }

const FY_RANGES: Record<Exclude<DatePreset, "custom">, DateRange> = {
  fy24: { start: "2023-08-01", end: "2024-07-31", label: "FY24" },
  fy25: { start: "2024-08-01", end: "2025-07-31", label: "FY25" },
  ytd:  { start: "", end: "", label: "YTD" },
  all:  { start: "2020-01-01", end: "", label: "All time" },
};

function lastDayOfPrevMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return d.toISOString().slice(0, 10);
}

function resolveRange(preset: DatePreset, custom: { start: string; end: string }): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  if (preset === "ytd") {
    const t = new Date();
    const y = t.getFullYear();
    const fyStart = t.getMonth() >= 7 ? `${y}-08-01` : `${y - 1}-08-01`;
    return { start: fyStart, end: today, label: "YTD" };
  }
  if (preset === "all") return { start: "2020-01-01", end: today, label: "All time" };
  if (preset === "custom") return { start: custom.start, end: custom.end, label: "Custom" };
  return FY_RANGES[preset];
}

interface MonthCol { key: string; label: string; fy: number; isFyStart: boolean }

// Fiscal year: Aug N → Jul N+1 is FY(N+1). E.g. Aug 2023 – Jul 2024 = FY24.
function fyOfMonth(year: number, month1: number): number {
  return month1 >= 8 ? year + 1 : year;
}

function monthsForRange(r: { start: string; end: string }): MonthCol[] {
  if (!r.start || !r.end) return [];
  const out: MonthCol[] = [];
  const s = new Date(r.start + "T00:00:00Z");
  const e = new Date(r.end + "T00:00:00Z");
  const cursor = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  let prevFy: number | null = null;
  while (cursor <= e) {
    const yyyy = cursor.getUTCFullYear();
    const m1 = cursor.getUTCMonth() + 1;
    const mm = String(m1).padStart(2, "0");
    const fy = fyOfMonth(yyyy, m1);
    out.push({
      key: `${yyyy}-${mm}`,
      label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      fy,
      isFyStart: prevFy !== null && fy !== prevFy,
    });
    prevFy = fy;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

// ─── Row consistency highlighter ─────────────────────────────────────────
// For a row's ordered monthly values, flag each cell as:
//   • "high" — ≥50% above the row's nonzero median (spike)
//   • "low"  — ≥50% below the row's nonzero median (dip)
//   • "gap"  — zero cell sitting *between* nonzero months (a missed month)
// Early/late zeros (before the first or after the last nonzero month) are
// intentionally left unflagged so newly-started or ended recurring items
// don't look like problems.

type OutlierClass = "high" | "low" | "gap" | null;

function classifyRowValues(values: number[]): OutlierClass[] {
  const nonZero = values.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
  if (nonZero.length < 2) return values.map(() => null);
  const sorted = nonZero.map((x) => x.v).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return values.map(() => null);
  const first = nonZero[0].i;
  const last = nonZero[nonZero.length - 1].i;
  return values.map((v, i) => {
    if (v === 0) {
      if (i > first && i < last && nonZero.length >= 3) return "gap";
      return null;
    }
    const rel = (v - median) / median;
    if (rel >= 0.5) return "high";
    if (rel <= -0.5) return "low";
    return null;
  });
}

function outlierCellClass(cls: OutlierClass): string {
  if (cls === "high") return "bg-rose-100/70 dark:bg-rose-950/50";
  if (cls === "low") return "bg-amber-100/70 dark:bg-amber-950/50";
  if (cls === "gap") return "bg-sky-100/50 dark:bg-sky-950/30 outline outline-1 outline-dashed outline-sky-300/60 dark:outline-sky-800/60";
  return "";
}

function buildOutlierMap(monthKeys: string[], get: (k: string) => number): Map<string, OutlierClass> {
  const values = monthKeys.map(get);
  const classes = classifyRowValues(values);
  const out = new Map<string, OutlierClass>();
  monthKeys.forEach((k, i) => out.set(k, classes[i]));
  return out;
}

// Subtle alternating tint per FY, applied to month header + data cells.
function fyCellClass(m: MonthCol): string {
  return cn(
    m.fy % 2 === 0 ? "bg-sky-50/50 dark:bg-sky-950/20" : "",
    m.isFyStart && "border-l-2 border-l-zinc-300 dark:border-l-zinc-700",
  );
}

function monthKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 7);
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

// ─── Anomaly detection ───────────────────────────────────────────────────

interface AnomalySuggestion { flag: ExpenseAnomalyFlag; note: string }
const lineKey = (l: ExpenseLineUnified) => `${l.source_type}:${l.source_qbo_id}:${l.qbo_line_id}`;

function detectAnomalies(lines: ExpenseLineUnified[]): Map<string, AnomalySuggestion> {
  const out = new Map<string, AnomalySuggestion>();
  for (const l of lines) {
    if (l.anomaly_flag || l.is_reviewed) continue;
    if (l.account_name && /uncategori[sz]ed/i.test(l.account_name)) {
      out.set(lineKey(l), { flag: "uncategorised", note: `Posted to "${l.account_name}"` });
    }
  }
  const byPayee = new Map<string, ExpenseLineUnified[]>();
  for (const l of lines) {
    const p = l.payee_qbo_id ?? "_";
    const arr = byPayee.get(p) ?? [];
    arr.push(l);
    byPayee.set(p, arr);
  }
  for (const arr of byPayee.values()) {
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.anomaly_flag || a.is_reviewed) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (b.source_qbo_id === a.source_qbo_id) continue;
        if (Number(a.amount) !== Number(b.amount)) continue;
        if (a.account_qbo_id !== b.account_qbo_id) continue;
        const da = new Date(a.txn_date).getTime();
        const db = new Date(b.txn_date).getTime();
        if (Math.abs(da - db) <= 3 * 86400000) {
          out.set(lineKey(a), { flag: "duplicate", note: `Possible duplicate of ${b.doc_number ?? b.source_qbo_id} on ${b.txn_date}` });
          out.set(lineKey(b), { flag: "duplicate", note: `Possible duplicate of ${a.doc_number ?? a.source_qbo_id} on ${a.txn_date}` });
        }
      }
    }
  }
  return out;
}

// ─── Action menu ─────────────────────────────────────────────────────────

interface ContextMenu { x: number; y: number; line: ExpenseLineUnified }

// Popup for drilling a specific (payee × account × month) cell into its
// underlying individual bills / expense entries.
interface BillPopup {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  lines: ExpenseLineUnified[];
}

function ActionMenu({
  menu, onClose, assetAccounts,
}: {
  menu: ContextMenu;
  onClose: () => void;
  assetAccounts: Array<{ qbo_id: string; name: string }>;
}) {
  const upsert = useUpsertExpenseLineReview();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const l = menu.line;
  const keyArgs = {
    source_type: l.source_type,
    source_qbo_id: l.source_qbo_id,
    qbo_line_id: l.qbo_line_id,
  };

  async function action(patch: Parameters<typeof upsert.mutateAsync>[0]) {
    try {
      await upsert.mutateAsync(patch);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div
      ref={ref}
      style={{ top: menu.y, left: menu.x }}
      className="fixed z-50 w-64 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm"
    >
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500">
        {l.doc_number ?? l.source_qbo_id} · {formatMoney(l.amount, l.currency ?? "SGD")}
      </div>
      <div className="py-1">
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => action({ ...keyArgs, reviewed: !l.is_reviewed })}
        >
          {l.is_reviewed ? "Unreview line" : "Mark reviewed ✓"}
        </button>
        <div className="mt-1 px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500">Anomaly</div>
        {(["duplicate", "miscoded", "uncategorised", "round_number", "personal_use", "other"] as ExpenseAnomalyFlag[]).map((f) => (
          <button
            key={f}
            className={cn(
              "w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              l.anomaly_flag === f && "bg-amber-50 dark:bg-amber-950/40",
            )}
            onClick={() => action({ ...keyArgs, anomaly_flag: l.anomaly_flag === f ? null : f })}
          >
            {l.anomaly_flag === f ? "✓ " : "  "}{f.replace("_", " ")}
          </button>
        ))}
        {l.is_personal_cc && (
          <>
            <div className="mt-1 px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500">Claim (Staff CC)</div>
            {(["unclaimed", "claimed", "reimbursed"] as ExpenseClaimStatus[]).map((c) => (
              <button
                key={c}
                className={cn(
                  "w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  l.claim_status === c && "bg-sky-50 dark:bg-sky-950/40",
                )}
                onClick={() => action({ ...keyArgs, claim_status: c })}
              >
                {l.claim_status === c ? "✓ " : "  "}{c}
              </button>
            ))}
          </>
        )}
        <div className="mt-1 px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500">Capitalise</div>
        <button
          className={cn(
            "w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            l.cap_candidate && "bg-violet-50 dark:bg-violet-950/40",
          )}
          onClick={() => action({ ...keyArgs, cap_candidate: !l.cap_candidate })}
        >
          {l.cap_candidate ? "✓ Tagged as cap candidate" : "Tag as cap candidate"}
        </button>
        {l.cap_candidate && (
          <>
            <div className="px-3 py-1 text-[10px] text-zinc-500">Target asset:</div>
            {assetAccounts.map((a) => (
              <button
                key={a.qbo_id}
                className={cn(
                  "w-full text-left px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[12px]",
                  l.cap_target_account_qbo_id === a.qbo_id && "bg-violet-50 dark:bg-violet-950/40",
                )}
                onClick={() => action({ ...keyArgs, cap_target_account_qbo_id: a.qbo_id })}
              >
                {l.cap_target_account_qbo_id === a.qbo_id ? "✓ " : "  "}{a.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── FS-line sidebar ─────────────────────────────────────────────────────

interface LineStat {
  lines: number;
  unreviewed: number;
  anomalies: number;
  total: number;
}

function Sidebar({
  lines,
  fsLineFilter,
  setFsLineFilter,
  view,
  setView,
  viewCounts,
}: {
  lines: ExpenseLineUnified[];
  fsLineFilter: string | "all";
  setFsLineFilter: (v: string | "all") => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  viewCounts: Record<ViewMode, number>;
}) {
  // Aggregate stats per (displaySection, fs_line).
  const { sections, totals } = useMemo(() => {
    const perLine = new Map<string, LineStat>();
    for (const l of lines) {
      const k = l.fs_line ?? "unmapped";
      const s = perLine.get(k) ?? { lines: 0, unreviewed: 0, anomalies: 0, total: 0 };
      s.lines += 1;
      if (!l.is_reviewed) s.unreviewed += 1;
      if (l.anomaly_flag) s.anomalies += 1;
      s.total += Number(l.amount ?? 0);
      perLine.set(k, s);
    }
    // Bucket fs_lines under their displaySection.
    const sectionMap = new Map<string, Array<{ fsLine: string; stat: LineStat }>>();
    const sectionTotals = new Map<string, LineStat>();
    for (const l of lines) {
      const sec = displaySection(l.fs_section);
      const st = sectionTotals.get(sec) ?? { lines: 0, unreviewed: 0, anomalies: 0, total: 0 };
      st.lines += 1;
      if (!l.is_reviewed) st.unreviewed += 1;
      if (l.anomaly_flag) st.anomalies += 1;
      st.total += Number(l.amount ?? 0);
      sectionTotals.set(sec, st);
    }
    for (const [fsLine, stat] of perLine) {
      const sec = displaySection(lines.find((l) => (l.fs_line ?? "unmapped") === fsLine)?.fs_section);
      const arr = sectionMap.get(sec) ?? [];
      arr.push({ fsLine, stat });
      sectionMap.set(sec, arr);
    }
    const sections = Array.from(sectionMap.entries())
      .map(([sec, rows]) => ({
        section: sec,
        rows: rows.sort((a, b) => fsLineDisplayLabel(a.fsLine).localeCompare(fsLineDisplayLabel(b.fsLine))),
      }))
      .sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section));
    return { sections, totals: sectionTotals };
  }, [lines]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (s: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const VIEWS: { id: ViewMode; label: string; icon: typeof Circle }[] = [
    { id: "all",             label: "All",             icon: Layers },
    { id: "needs_review",    label: "Needs review",    icon: Circle },
    { id: "staff_cc",        label: "Staff CC claims", icon: CreditCard },
    { id: "cap_candidates",  label: "Cap candidates",  icon: Package },
    { id: "capitalised",     label: "Capitalised",     icon: CheckCircle2 },
    { id: "anomalies",       label: "Anomalies",       icon: AlertTriangle },
  ];

  const grandTotal = useMemo(
    () => Array.from(totals.values()).reduce((a, b) => a + b.total, 0),
    [totals],
  );

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <CollapsibleSection title="View" storageKey="expense-review:view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
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

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <button
          onClick={() => setFsLineFilter("all")}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[12.5px] mb-1",
            fsLineFilter === "all"
              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          <span className="font-medium">All P&amp;L lines</span>
          <span className="text-[11px] font-mono text-zinc-500">{formatMoney(grandTotal)}</span>
        </button>

        {sections.map(({ section, rows }) => {
          const st = totals.get(section);
          const isCollapsed = collapsed.has(section);
          return (
            <div key={section} className="mt-3">
              <button
                onClick={() => toggleSection(section)}
                className="w-full flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <span className="flex items-center gap-1">
                  {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                  {sectionLabel(section)}
                </span>
                <span className="font-mono normal-case tracking-normal">{formatMoney(st?.total ?? 0)}</span>
              </button>
              {!isCollapsed && rows.map(({ fsLine, stat }) => (
                <button
                  key={fsLine}
                  onClick={() => setFsLineFilter(fsLine)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 pl-4 pr-2 py-1 rounded text-[12px] text-left",
                    fsLineFilter === fsLine
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  )}
                  title={`${stat.lines} lines · ${formatMoney(stat.total)}`}
                >
                  <span className="truncate">{fsLineDisplayLabel(fsLine)}</span>
                  <span className="flex items-center gap-1.5 shrink-0 text-[11px]">
                    {stat.anomalies > 0 && <span className="text-amber-600">{stat.anomalies}!</span>}
                    {stat.unreviewed > 0 && <span className="text-zinc-500">{stat.unreviewed}</span>}
                    <span className="font-mono text-zinc-600 dark:text-zinc-400">{formatMoney(stat.total)}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Bills popup ─────────────────────────────────────────────────────────
// Shown when a user clicks an account × month cell on a drill row. Lists
// the individual bills / expenses making up that aggregated amount.

function BillsPopup({
  popup,
  onClose,
  onContextLine,
}: {
  popup: BillPopup;
  onClose: () => void;
  onContextLine: (e: React.MouseEvent, line: ExpenseLineUnified) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const total = popup.lines.reduce((a, b) => a + Number(b.amount ?? 0), 0);
  // Header ~50, thead ~32, footer ~30, plus 28 per row. Cap at 80% viewport.
  const maxH = Math.floor(window.innerHeight * 0.8);
  const h = Math.min(50 + 32 + 30 + Math.max(1, popup.lines.length) * 28 + 8, maxH);
  const w = Math.min(880, window.innerWidth - 24);
  const top = Math.max(12, Math.min(popup.y + 6, window.innerHeight - h - 12));
  const left = Math.max(12, Math.min(popup.x - 20, window.innerWidth - w - 12));

  return (
    <div
      ref={ref}
      style={{ top, left, maxHeight: h, width: w }}
      className="fixed z-40 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 shadow-xl overflow-hidden flex flex-col"
    >
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{popup.title}</div>
          <div className="text-[11px] text-zinc-500">
            {popup.subtitle} · {popup.lines.length} line{popup.lines.length === 1 ? "" : "s"} · {formatMoney(total)}
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs">Close</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {popup.lines.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-zinc-500">No underlying entries.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5 w-[60px]">Type</th>
                <th className="text-left px-2 py-1.5 w-[96px]">Date</th>
                <th className="text-left px-2 py-1.5 w-[130px]">Doc / Ref</th>
                <th className="text-left px-2 py-1.5">Memo</th>
                <th className="text-right px-3 py-1.5 w-[96px]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {popup.lines.map((l) => {
                const k = lineKey(l);
                // Fall back to source_qbo_id when doc_number is blank —
                // QBO expenses (Purchase entity) often lack a user-visible
                // doc number, but the internal id is still useful for
                // looking the transaction up in QBO.
                const ref = l.doc_number ?? `#${l.source_qbo_id}`;
                const refLabel = l.doc_number ? "" : "qbo id · ";
                return (
                  <tr
                    key={k}
                    onContextMenu={(e) => onContextLine(e, l)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-default border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-3 py-1 whitespace-nowrap">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase",
                        l.source_type === "bill"
                          ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
                      )}>
                        {l.source_type === "bill" ? <Receipt size={10} /> : <CreditCard size={10} />}
                        {l.source_type}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {formatDate(l.txn_date)}
                        {l.is_reviewed && <CheckCircle2 size={10} className="text-emerald-500" />}
                        {l.anomaly_flag && <AlertTriangle size={10} className="text-amber-500" />}
                        {l.cap_candidate && <Package size={10} className="text-violet-500" />}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap truncate max-w-[130px]" title={`${refLabel}${ref}`}>
                      <span className={l.doc_number ? "" : "text-zinc-500 italic"}>{ref}</span>
                    </td>
                    <td className="px-2 py-1 truncate max-w-[520px]" title={`${l.account_name ?? ""} — ${l.description ?? ""}`}>
                      {l.description || l.account_name || <span className="text-zinc-500">—</span>}
                    </td>
                    <td className="px-3 py-1 text-right font-mono whitespace-nowrap">{formatMoney(l.amount, l.currency ?? "SGD")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="px-3 py-1 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500">
        Right-click a row to mark reviewed, flag anomaly, or tag as cap candidate.
      </div>
    </div>
  );
}

// ─── Cap JE Builder Modal (unchanged) ────────────────────────────────────

function CapJeBuilder({
  lines,
  assetAccounts,
  onClose,
}: {
  lines: ExpenseLineUnified[];
  assetAccounts: Array<{ qbo_id: string; name: string }>;
  onClose: () => void;
}) {
  const previews = assetAccounts
    .map((a) => buildCapJePreview(lines, a))
    .filter((p) => p.tagged_line_keys.length > 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <div className="font-semibold">Batch Capitalisation JE Preview</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Review before posting. One JE per target asset. Credits grouped by source expense account.
            </div>
          </div>
          <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">Close</button>
        </div>
        <div className="p-5 space-y-5">
          {previews.length === 0 && (
            <div className="text-sm text-zinc-500">No tagged, un-capitalised lines. Right-click lines → Tag as cap candidate, then assign a target asset.</div>
          )}
          {previews.map((p) => (
            <div key={p.target_account_qbo_id} className="border border-zinc-200 dark:border-zinc-800 rounded-md">
              <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
                <div>
                  <div className="font-medium text-sm">→ {p.target_account_name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {p.tagged_line_keys.length} lines · {formatMoney(p.total)}
                  </div>
                </div>
                <button
                  disabled
                  title="Posting wired up after mgmt edge function review — for now this shows the preview"
                  className="text-xs px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 disabled:opacity-60"
                >
                  Post JE (TBD)
                </button>
              </div>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="text-left px-3 py-1.5">Type</th>
                    <th className="text-left px-3 py-1.5">Account</th>
                    <th className="text-right px-3 py-1.5">Amount</th>
                    <th className="text-left px-3 py-1.5">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lines.map((ln, i) => (
                    <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-1.5">
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium",
                          ln.posting_type === "Debit"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
                        )}>
                          {ln.posting_type === "Debit" ? "DR" : "CR"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{ln.account_name}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatMoney(ln.amount)}</td>
                      <td className="px-3 py-1.5 text-zinc-500">{ln.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reversal Accrual Modal ──────────────────────────────────────────────
// Pulls a mis-dated expense amount back into the prior month by posting a
// matched accrual + reversal JE pair to QBO.
//
// Mechanics:
//   - User right-clicks a drill-row cell (e.g. Jul 24 CPF $2,400 where $1,200
//     belongs to Jun 24).
//   - Suggested amount = cell total − row median (the excess).
//   - Accrual JE dated last day of previous month: Dr expense / Cr liability.
//   - Reversal JE dated first day of clicked month: Dr liability / Cr expense.
//   - Last-used liability account is remembered in localStorage.

const ACCRUAL_LIABILITY_KEY = "tv-expense-accrual-liability-qbo-id";

interface ReversalCell {
  payee_qbo_id: string | null;
  payee_type: string | null;
  payee_name: string;
  account_qbo_id: string | null;
  account_name: string;
  month_key: string;          // YYYY-MM — the clicked cell's month
  month_label: string;        // e.g. "Jul 24"
  cell_total: number;
  suggested_amount: number;   // cell - median (or cell if not an outlier)
  currency: string | null;
}

function lastDayOfPriorMonth(monthKey: string): string {
  // monthKey = YYYY-MM; prior month's last day = day 0 of this month.
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 0));  // day 0 of month m = last day of m-1
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

function ReversalAccrualModal({
  cell,
  liabilityAccounts,
  onClose,
}: {
  cell: ReversalCell;
  liabilityAccounts: Array<{ qbo_id: string; name: string; account_type: string }>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<string>(cell.suggested_amount.toFixed(2));
  const [liabilityAccountQboId, setLiabilityAccountQboId] = useState<string>(() => {
    // Name-based defaults for common payroll accruals. CPF Employee / Employer
    // Contribution and the Skills Development Levy should all map to
    // "CPF Payable" automatically so the user doesn't have to re-pick each time.
    if (/\bCPF\b|Skills Development Levy/i.test(cell.account_name)) {
      const cpfPayable = liabilityAccounts.find((a) => /^CPF Payable$/i.test(a.name));
      if (cpfPayable) return cpfPayable.qbo_id;
    }
    return localStorage.getItem(ACCRUAL_LIABILITY_KEY) ?? "";
  });
  const postAccrual = usePostAccrual();

  const amountNum = Number(amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const canPost =
    validAmount &&
    !!cell.account_qbo_id &&
    !!liabilityAccountQboId &&
    !postAccrual.isPending;

  const accrualDate = lastDayOfPriorMonth(cell.month_key);
  const reversalDate = firstDayOfMonth(cell.month_key);

  // Compute prior-month label from accrualDate for the display summary.
  const priorLabel = new Date(accrualDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

  const liabilityAccount = liabilityAccounts.find((a) => a.qbo_id === liabilityAccountQboId);
  const currency = cell.currency ?? "SGD";

  const description = `${cell.payee_name} · ${cell.account_name} · ${priorLabel} accrual (shifted from ${cell.month_label})`;

  // DocNumber prefix must stay ≤10 chars so the suffix fits within QBO's
  // 21-char limit. Example: "AC-202506".
  const docPrefix = `AC-${accrualDate.slice(0, 4)}${accrualDate.slice(5, 7)}`;

  const handlePost = async () => {
    if (!canPost || !cell.account_qbo_id) return;
    try {
      await postAccrual.mutateAsync({
        description,
        amount: amountNum,
        currency,
        expense_account_qbo_id: cell.account_qbo_id,
        liability_account_qbo_id: liabilityAccountQboId,
        entity_qbo_id: cell.payee_qbo_id ?? undefined,
        entity_type: cell.payee_type === "Customer" ? "Customer" : "Vendor",
        accrual_date: accrualDate,
        reversal_date: reversalDate,
        doc_prefix: docPrefix,
      });
      localStorage.setItem(ACCRUAL_LIABILITY_KEY, liabilityAccountQboId);
      toast.success(`Posted accrual → ${priorLabel}, reversed ${cell.month_label}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 w-[720px] max-w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-semibold text-sm">Post reversal accrual</div>
            <div className="text-[11px] text-zinc-500 truncate">
              {cell.payee_name} · {cell.account_name} · {cell.month_label} ({formatMoney(cell.cell_total, currency)})
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm">Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Amount to shift</div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono"
              />
              <div className="text-[10px] text-zinc-500 mt-1">
                Pre-filled with the cell's deviation from the row's median.
              </div>
            </label>

            <label className="block">
              <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Liability account</div>
              <select
                value={liabilityAccountQboId}
                onChange={(e) => setLiabilityAccountQboId(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
              >
                <option value="">— select —</option>
                {liabilityAccounts.map((a) => (
                  <option key={a.qbo_id} value={a.qbo_id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-zinc-500 mt-1">
                Remembered for future accruals.
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Accrual date (prior month-end)</div>
              <div className="px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 font-mono text-xs">
                {accrualDate} · {priorLabel}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Reversal date (clicked month start)</div>
              <div className="px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 font-mono text-xs">
                {reversalDate} · {cell.month_label}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">Preview</div>
            <div className="rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase text-zinc-500 tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-1.5 w-[110px]">Date</th>
                    <th className="text-left px-3 py-1.5 w-[70px]">Type</th>
                    <th className="text-left px-3 py-1.5">Account</th>
                    <th className="text-right px-3 py-1.5 w-[110px]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-1.5 font-mono" rowSpan={2}>{accrualDate}</td>
                    <td className="px-3 py-1.5"><span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[9px] font-semibold">DR</span></td>
                    <td className="px-3 py-1.5">{cell.account_name}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{validAmount ? formatMoney(amountNum, currency) : "—"}</td>
                  </tr>
                  <tr className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-1.5"><span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 text-[9px] font-semibold">CR</span></td>
                    <td className="px-3 py-1.5">{liabilityAccount?.name ?? <span className="text-zinc-400 italic">pick a liability account</span>}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{validAmount ? formatMoney(amountNum, currency) : "—"}</td>
                  </tr>
                  <tr className="border-t-2 border-zinc-200 dark:border-zinc-700">
                    <td className="px-3 py-1.5 font-mono" rowSpan={2}>{reversalDate}</td>
                    <td className="px-3 py-1.5"><span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[9px] font-semibold">DR</span></td>
                    <td className="px-3 py-1.5">{liabilityAccount?.name ?? <span className="text-zinc-400 italic">pick a liability account</span>}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{validAmount ? formatMoney(amountNum, currency) : "—"}</td>
                  </tr>
                  <tr className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-1.5"><span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 text-[9px] font-semibold">CR</span></td>
                    <td className="px-3 py-1.5">{cell.account_name}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{validAmount ? formatMoney(amountNum, currency) : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-zinc-500 mt-2">
              Net effect: <strong>{priorLabel}</strong> expense ↑ {validAmount ? formatMoney(amountNum, currency) : "…"},{" "}
              <strong>{cell.month_label}</strong> expense ↓ {validAmount ? formatMoney(amountNum, currency) : "…"}. Liability nets to zero.
              Description: <em className="text-zinc-600 dark:text-zinc-400">{description}</em>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={postAccrual.isPending}
            className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handlePost}
            disabled={!canPost}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {postAccrual.isPending ? "Posting…" : "Post accrual + reversal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Reversal Accrual Modal ────────────────────────────────────────
// Posts N reversal-accrual pairs sequentially. Each selected cell is one
// pair; amounts are editable per row, liability account is shared.

type BatchRowStatus = "pending" | "posting" | "ok" | "failed";

interface BatchRow {
  key: string;
  cell: ReversalCell;
  amount: string;
  status: BatchRowStatus;
  error?: string;
}

function BatchReversalModal({
  cells,
  liabilityAccounts,
  onClose,
}: {
  cells: Map<string, ReversalCell>;
  liabilityAccounts: Array<{ qbo_id: string; name: string; account_type: string }>;
  onClose: () => void;
}) {
  const postAccrual = usePostAccrual();
  const [liabilityAccountQboId, setLiabilityAccountQboId] = useState<string>(() => {
    // If every selected cell is CPF-related, default to CPF Payable.
    const allCpf = Array.from(cells.values()).every((c) =>
      /\bCPF\b|Skills Development Levy/i.test(c.account_name),
    );
    if (allCpf) {
      const cpfPayable = liabilityAccounts.find((a) => /^CPF Payable$/i.test(a.name));
      if (cpfPayable) return cpfPayable.qbo_id;
    }
    return localStorage.getItem(ACCRUAL_LIABILITY_KEY) ?? "";
  });

  const [rows, setRows] = useState<BatchRow[]>(() =>
    Array.from(cells.entries())
      .sort(([, a], [, b]) => a.month_key.localeCompare(b.month_key) || a.payee_name.localeCompare(b.payee_name))
      .map(([key, cell]) => ({
        key,
        cell,
        amount: cell.suggested_amount.toFixed(2),
        status: "pending" as const,
      })),
  );
  const [isPosting, setIsPosting] = useState(false);

  const updateRow = (key: string, patch: Partial<BatchRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const pending = rows.filter((r) => r.status === "pending" || r.status === "failed");
  const allDone = rows.length > 0 && rows.every((r) => r.status === "ok");
  const canPost =
    !isPosting &&
    !!liabilityAccountQboId &&
    pending.length > 0 &&
    pending.every((r) => {
      const n = Number(r.amount);
      return Number.isFinite(n) && n > 0 && r.cell.account_qbo_id;
    });

  const postAll = async () => {
    setIsPosting(true);
    let okCount = 0;
    let failCount = 0;
    for (const row of pending) {
      updateRow(row.key, { status: "posting", error: undefined });
      const accrualDate = lastDayOfPriorMonth(row.cell.month_key);
      const reversalDate = firstDayOfMonth(row.cell.month_key);
      const priorLabel = new Date(accrualDate + "T00:00:00Z").toLocaleDateString("en-GB", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
      const description = `${row.cell.payee_name} · ${row.cell.account_name} · ${priorLabel} accrual (shifted from ${row.cell.month_label})`;
      const docPrefix = `AC-${accrualDate.slice(0, 4)}${accrualDate.slice(5, 7)}`;
      try {
        await postAccrual.mutateAsync({
          description,
          amount: Number(row.amount),
          currency: row.cell.currency ?? "SGD",
          expense_account_qbo_id: row.cell.account_qbo_id!,
          liability_account_qbo_id: liabilityAccountQboId,
          entity_qbo_id: row.cell.payee_qbo_id ?? undefined,
          entity_type: row.cell.payee_type === "Customer" ? "Customer" : "Vendor",
          accrual_date: accrualDate,
          reversal_date: reversalDate,
          doc_prefix: docPrefix,
        });
        updateRow(row.key, { status: "ok" });
        okCount++;
      } catch (err) {
        updateRow(row.key, { status: "failed", error: err instanceof Error ? err.message : String(err) });
        failCount++;
      }
    }
    setIsPosting(false);
    localStorage.setItem(ACCRUAL_LIABILITY_KEY, liabilityAccountQboId);
    if (okCount > 0 && failCount === 0) {
      toast.success(`Posted ${okCount} accrual pair${okCount === 1 ? "" : "s"}`);
    } else if (okCount > 0 && failCount > 0) {
      toast.error(`Posted ${okCount}, failed ${failCount} — see rows for detail`);
    } else if (failCount > 0) {
      toast.error(`All ${failCount} posts failed — see rows for detail`);
    }
  };

  const liabilityAccount = liabilityAccounts.find((a) => a.qbo_id === liabilityAccountQboId);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={isPosting ? undefined : onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 w-[960px] max-w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Post batch reversal accruals</div>
            <div className="text-[11px] text-zinc-500">
              {rows.length} cell{rows.length === 1 ? "" : "s"} · each cell posts an accrual (prior month-end) + reversal (cell month start)
            </div>
          </div>
          <button onClick={onClose} disabled={isPosting} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm disabled:opacity-40">
            {allDone ? "Done" : "Close"}
          </button>
        </div>

        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-end gap-4">
          <label className="block flex-1">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Shared liability account</div>
            <select
              value={liabilityAccountQboId}
              onChange={(e) => setLiabilityAccountQboId(e.target.value)}
              disabled={isPosting}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
            >
              <option value="">— select —</option>
              {liabilityAccounts.map((a) => (
                <option key={a.qbo_id} value={a.qbo_id}>{a.name}</option>
              ))}
            </select>
          </label>
          <div className="text-[11px] text-zinc-500 pb-1">
            Total shift: <strong className="text-zinc-700 dark:text-zinc-300 font-mono">{formatMoney(rows.reduce((s, r) => s + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0), 0))}</strong>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-3 py-2">Payee</th>
                <th className="text-left px-3 py-2">Expense account</th>
                <th className="text-center px-3 py-2">Shift</th>
                <th className="text-right px-3 py-2 w-[110px]">Amount</th>
                <th className="text-left px-3 py-2 w-[110px]">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const priorLabel = new Date(lastDayOfPriorMonth(r.cell.month_key) + "T00:00:00Z").toLocaleDateString("en-GB", {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                });
                const acctLeaf = r.cell.account_name.includes(":")
                  ? r.cell.account_name.split(":").slice(-1).join("")
                  : r.cell.account_name;
                return (
                  <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-1.5 truncate max-w-[160px]" title={r.cell.payee_name}>
                      {r.cell.payee_name}
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-[220px]" title={r.cell.account_name}>
                      {acctLeaf}
                    </td>
                    <td className="px-3 py-1.5 text-center text-zinc-500 whitespace-nowrap font-mono text-[11px]">
                      {r.cell.month_label} → {priorLabel}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.amount}
                        onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                        disabled={isPosting || r.status === "ok"}
                        className="w-full px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-right text-xs disabled:opacity-60"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      {r.status === "pending" && <span className="text-zinc-400">queued</span>}
                      {r.status === "posting" && <span className="text-blue-600 dark:text-blue-400">posting…</span>}
                      {r.status === "ok" && <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 size={11} /> posted</span>}
                      {r.status === "failed" && (
                        <span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-1" title={r.error}>
                          <AlertTriangle size={11} /> failed
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.status !== "ok" && !isPosting && (
                        <button onClick={() => removeRow(r.key)} className="text-zinc-400 hover:text-rose-500 text-xs">✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500">
            {liabilityAccount ? <>CR leg will post to <strong>{liabilityAccount.name}</strong></> : <em className="text-zinc-400">pick a liability account to begin</em>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isPosting}
              className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              {allDone ? "Done" : "Cancel"}
            </button>
            {!allDone && (
              <button
                onClick={postAll}
                disabled={!canPost}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPosting ? `Posting ${rows.filter((r) => r.status === "posting" || r.status === "ok").length}/${rows.length}…` : `Post ${pending.length} pair${pending.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────

export function ExpenseReviewView() {
  const DEFAULT_START = "2023-08-01";
  const DEFAULT_END = useMemo(() => lastDayOfPrevMonth(), []);
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");
  const [customStartInput, setCustomStartInput] = useState<string>(DEFAULT_START);
  const [customEndInput, setCustomEndInput] = useState<string>(DEFAULT_END);
  const customStart = isValidIsoDate(customStartInput) ? customStartInput : DEFAULT_START;
  const customEnd = isValidIsoDate(customEndInput) ? customEndInput : DEFAULT_END;
  const range = useMemo(
    () => resolveRange(datePreset, { start: customStart, end: customEnd }),
    [datePreset, customStart, customEnd],
  );

  const [view, setView] = useState<ViewMode>("all");
  const [fsLineFilter, setFsLineFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [popup, setPopup] = useState<BillPopup | null>(null);
  const [reversalCell, setReversalCell] = useState<ReversalCell | null>(null);
  // Multi-cell selection for batch reversal accruals. Keyed by
  // `${account_qbo_id}::${payee_qbo_id ?? "_"}::${month_key}` so the same
  // (account × payee × month) never enters twice.
  const [selectedCells, setSelectedCells] = useState<Map<string, ReversalCell>>(new Map());
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const cellSelectKey = (c: { account_qbo_id: string | null; payee_qbo_id: string | null; month_key: string }) =>
    `${c.account_qbo_id ?? "_"}::${c.payee_qbo_id ?? "_"}::${c.month_key}`;
  const toggleCellSelection = useCallback((cell: ReversalCell) => {
    const k = cellSelectKey(cell);
    setSelectedCells((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, cell);
      return next;
    });
  }, []);
  const clearCellSelection = useCallback(() => setSelectedCells(new Map()), []);
  const [capBuilderOpen, setCapBuilderOpen] = useState(false);
  const [showFyTotals, setShowFyTotals] = useState(false);
  const [highlightOutliers, setHighlightOutliers] = useState(true);
  const triggerSync = useTriggerSync();
  const handleSyncExpenses = async () => {
    try {
      // Expense lines come from QBO bills + expenses + journal entries on
      // expense accounts (reversal accruals, reclass JEs, etc.). We also
      // pull accounts so newly-added liability accounts (e.g. CPF Payable
      // for accrual postings) land in the picker without a full-sync step.
      await Promise.all([
        triggerSync.mutateAsync("accounts"),
        triggerSync.mutateAsync("bills"),
        triggerSync.mutateAsync("expenses"),
        triggerSync.mutateAsync("journal_entries"),
      ]);
      toast.success("Synced accounts + bills + expenses + JEs from QBO");
    } catch (err) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  // Inline drill: clicking a payee expands one row per distinct account
  // across all months. Each row shows its monthly amounts spread across
  // month columns. key = `${fsLine}::${payeeKey}`.
  const [expandedPayees, setExpandedPayees] = useState<Set<string>>(new Set());

  const { data: linesRaw = [], isLoading } = useExpenseLinesUnified({
    startDate: range.start || undefined,
    endDate: range.end || undefined,
  });
  const { data: config } = useExpenseReviewConfig();
  const { data: accountsRaw = [] } = useQboAccounts();

  const accountsById = useMemo(
    () => new Map<string, { qbo_id: string; name: string; account_type: string }>(
      accountsRaw.map((a: { qbo_id: string; name: string; account_type: string }) => [a.qbo_id, a]),
    ),
    [accountsRaw],
  );

  const assetAccounts = useMemo(() => {
    const targets = config?.cap_target_account_ids ?? [];
    return targets
      .map((id) => accountsById.get(id))
      .filter((a): a is { qbo_id: string; name: string; account_type: string } => !!a)
      .map((a) => ({ qbo_id: a.qbo_id, name: a.name }));
  }, [config, accountsById]);

  // Liability accounts for accrual postings. QBO's account_type values:
  // "Other Current Liability", "Long Term Liability", "Accounts Payable",
  // "Credit Card". We surface all liability-class accounts so the user can
  // pick CPF Payable / Accrued Expenses / etc.
  const liabilityAccounts = useMemo(() => {
    const types = new Set([
      "Other Current Liability",
      "Long Term Liability",
      "Accounts Payable",
      "Credit Card",
    ]);
    return accountsRaw
      .map((a) => a as { qbo_id: string; name: string; account_type: string })
      .filter((a) => types.has(a.account_type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accountsRaw]);

  const suggestedAnomalies = useMemo(() => detectAnomalies(linesRaw), [linesRaw]);

  const expenseAcctIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of accountsRaw) {
      const typed = a as { qbo_id: string; account_type: string };
      if (["Expense", "Other Expense", "Cost of Goods Sold"].includes(typed.account_type)) {
        s.add(typed.qbo_id);
      }
    }
    return s;
  }, [accountsRaw]);
  useCapitalisationJes({
    assetAccountIds: config?.cap_target_account_ids ?? [],
    expenseAccountIds: expenseAcctIdSet,
    startDate: range.start || undefined,
    endDate: range.end || undefined,
  });

  const viewCounts: Record<ViewMode, number> = useMemo(() => {
    const c: Record<ViewMode, number> = {
      all: linesRaw.length,
      needs_review: 0,
      staff_cc: 0,
      cap_candidates: 0,
      capitalised: 0,
      anomalies: 0,
    };
    for (const l of linesRaw) {
      if (!l.is_reviewed) c.needs_review += 1;
      if (l.is_personal_cc) c.staff_cc += 1;
      if (l.cap_candidate && !l.capitalised_je_qbo_id) c.cap_candidates += 1;
      if (l.capitalised_je_qbo_id) c.capitalised += 1;
      if (l.anomaly_flag || suggestedAnomalies.has(lineKey(l))) c.anomalies += 1;
    }
    return c;
  }, [linesRaw, suggestedAnomalies]);

  const filteredLines = useMemo(() => {
    return linesRaw.filter((l) => {
      if (fsLineFilter !== "all" && (l.fs_line ?? "unmapped") !== fsLineFilter) return false;
      const k = lineKey(l);
      if (view === "needs_review" && l.is_reviewed) return false;
      if (view === "staff_cc" && !l.is_personal_cc) return false;
      if (view === "cap_candidates" && (!l.cap_candidate || l.capitalised_je_qbo_id)) return false;
      if (view === "capitalised" && !l.capitalised_je_qbo_id) return false;
      if (view === "anomalies" && !l.anomaly_flag && !suggestedAnomalies.has(k)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [l.description, l.account_name, l.doc_number, l.payee_name, l.private_note]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [linesRaw, fsLineFilter, view, search, suggestedAnomalies]);

  // Group filtered lines by (fs_line → payee). When fsLineFilter is a
  // specific line, the fs_line tier has just one entry — we render without
  // the extra header in that case.
  interface PayeeGroup {
    key: string;
    payee_qbo_id: string | null;
    payee_type: string | null;
    payee_name: string;
    lines: ExpenseLineUnified[];
    total: number;
    unreviewed: number;
    anomalies: number;
    cap_candidates: number;
  }
  interface FsLineGroup {
    fs_line: string;
    fs_section: string;
    label: string;
    payees: PayeeGroup[];
    total: number;
    lines: number;
    unreviewed: number;
    anomalies: number;
    cap_candidates: number;
  }

  const fsLineGroups: FsLineGroup[] = useMemo(() => {
    const byLine = new Map<string, {
      payees: Map<string, PayeeGroup>;
      fs_section: string;
      total: number;
      lines: number;
      unreviewed: number;
      anomalies: number;
      cap_candidates: number;
    }>();
    for (const l of filteredLines) {
      const fsLine = l.fs_line ?? "unmapped";
      const fsSection = displaySection(l.fs_section);
      const isAnomaly = !!l.anomaly_flag || suggestedAnomalies.has(lineKey(l));
      const isCapCand = !!l.cap_candidate && !l.capitalised_je_qbo_id;

      let entry = byLine.get(fsLine);
      if (!entry) {
        entry = { payees: new Map(), fs_section: fsSection, total: 0, lines: 0, unreviewed: 0, anomalies: 0, cap_candidates: 0 };
        byLine.set(fsLine, entry);
      }
      entry.lines += 1;
      entry.total += Number(l.amount ?? 0);
      if (!l.is_reviewed) entry.unreviewed += 1;
      if (isAnomaly) entry.anomalies += 1;
      if (isCapCand) entry.cap_candidates += 1;

      const pk = `${l.payee_type ?? "?"}:${l.payee_qbo_id ?? "_"}`;
      const p = entry.payees.get(pk) ?? {
        key: pk,
        payee_qbo_id: l.payee_qbo_id,
        payee_type: l.payee_type,
        payee_name: l.payee_name ?? "—",
        lines: [],
        total: 0,
        unreviewed: 0,
        anomalies: 0,
        cap_candidates: 0,
      };
      p.lines.push(l);
      p.total += Number(l.amount ?? 0);
      if (!l.is_reviewed) p.unreviewed += 1;
      if (isAnomaly) p.anomalies += 1;
      if (isCapCand) p.cap_candidates += 1;
      entry.payees.set(pk, p);
    }
    const out: FsLineGroup[] = [];
    for (const [fsLine, entry] of byLine) {
      const payees = Array.from(entry.payees.values())
        .map((p) => ({ ...p, lines: p.lines.slice().sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1)) }))
        .sort((a, b) => b.total - a.total);
      out.push({
        fs_line: fsLine,
        fs_section: entry.fs_section,
        label: fsLineDisplayLabel(fsLine),
        payees,
        total: entry.total,
        lines: entry.lines,
        unreviewed: entry.unreviewed,
        anomalies: entry.anomalies,
        cap_candidates: entry.cap_candidates,
      });
    }
    return out.sort((a, b) => {
      const so = sectionOrder(a.fs_section) - sectionOrder(b.fs_section);
      if (so !== 0) return so;
      return a.label.localeCompare(b.label);
    });
  }, [filteredLines, suggestedAnomalies]);

  const showFsLineTier = fsLineFilter === "all";
  const [expandedFsLines, setExpandedFsLines] = useState<Set<string>>(new Set());
  const toggleFsLine = useCallback((fs_line: string) => {
    setExpandedFsLines((prev) => {
      const next = new Set(prev);
      if (next.has(fs_line)) next.delete(fs_line); else next.add(fs_line);
      return next;
    });
  }, []);

  // Top-level sections (Cost of Sales / Expenses / Other Expenses). Only
  // shown when fsLineFilter is "all" — otherwise we're inside one line and
  // the section is implicit.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }, []);

  const toggleExpandedPayee = useCallback((key: string) => {
    setExpandedPayees((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent, line: ExpenseLineUnified) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, line });
  }, []);

  const totals = useMemo(() => {
    const sum = filteredLines.reduce((a, b) => a + Number(b.amount ?? 0), 0);
    return { count: filteredLines.length, sum };
  }, [filteredLines]);

  const months = useMemo(() => monthsForRange(range), [range]);

  // Consecutive runs of months sharing an FY — drives the colSpan'd FY
  // header row above the month headers. `monthKeys` is used to sum row
  // values into the FY-total column when that toggle is on.
  const fyGroups = useMemo(() => {
    const groups: { fy: number; label: string; count: number; monthKeys: string[] }[] = [];
    for (const m of months) {
      const last = groups[groups.length - 1];
      if (last && last.fy === m.fy) {
        last.count += 1;
        last.monthKeys.push(m.key);
      } else {
        groups.push({ fy: m.fy, label: `FY${String(m.fy).slice(-2)}`, count: 1, monthKeys: [m.key] });
      }
    }
    return groups;
  }, [months]);

  // Flat column list: month columns, optionally followed by an FY-total
  // column after the last month of each FY. All 6 row renders iterate this.
  type GridCol =
    | { kind: "month"; m: MonthCol }
    | { kind: "fyTotal"; fy: number; label: string; monthKeys: string[] };
  const gridColumns = useMemo<GridCol[]>(() => {
    const cols: GridCol[] = [];
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      cols.push({ kind: "month", m });
      const next = months[i + 1];
      const isLastOfFy = !next || next.fy !== m.fy;
      if (isLastOfFy && showFyTotals) {
        const g = fyGroups.find((x) => x.fy === m.fy);
        if (g) cols.push({ kind: "fyTotal", fy: g.fy, label: g.label, monthKeys: g.monthKeys });
      }
    }
    return cols;
  }, [months, fyGroups, showFyTotals]);

  const sumByKeys = (src: Map<string, number>, keys: string[]): number => {
    let s = 0;
    for (const k of keys) s += src.get(k) ?? 0;
    return s;
  };

  // Per-payee + per-fs-line monthly subtotals, keyed by fs_line key and
  // composite fs_line:payee key respectively.
  const payeeMonthlyTotals = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const fl of fsLineGroups) {
      for (const g of fl.payees) {
        const m = new Map<string, number>();
        for (const l of g.lines) {
          const mk = monthKeyOf(l.txn_date);
          if (!mk) continue;
          m.set(mk, (m.get(mk) ?? 0) + Number(l.amount ?? 0));
        }
        out.set(`${fl.fs_line}::${g.key}`, m);
      }
    }
    return out;
  }, [fsLineGroups]);

  const fsLineMonthlyTotals = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const fl of fsLineGroups) {
      const m = new Map<string, number>();
      for (const g of fl.payees) {
        for (const l of g.lines) {
          const mk = monthKeyOf(l.txn_date);
          if (!mk) continue;
          m.set(mk, (m.get(mk) ?? 0) + Number(l.amount ?? 0));
        }
      }
      out.set(fl.fs_line, m);
    }
    return out;
  }, [fsLineGroups]);

  // Group fs_lines by their display section (Cost of Sales / Expenses /
  // Other Expenses). Section rollups aggregate across contained fs_lines.
  interface SectionGroup {
    section: string;
    fsLines: FsLineGroup[];
    lines: number;
    total: number;
    unreviewed: number;
    anomalies: number;
    cap_candidates: number;
    monthly: Map<string, number>;
  }
  const sectionGroups: SectionGroup[] = useMemo(() => {
    const bySec = new Map<string, SectionGroup>();
    for (const fl of fsLineGroups) {
      const sec = fl.fs_section;
      const entry = bySec.get(sec) ?? {
        section: sec,
        fsLines: [],
        lines: 0,
        total: 0,
        unreviewed: 0,
        anomalies: 0,
        cap_candidates: 0,
        monthly: new Map<string, number>(),
      };
      entry.fsLines.push(fl);
      entry.lines += fl.lines;
      entry.total += fl.total;
      entry.unreviewed += fl.unreviewed;
      entry.anomalies += fl.anomalies;
      entry.cap_candidates += fl.cap_candidates;
      const flM = fsLineMonthlyTotals.get(fl.fs_line);
      if (flM) {
        for (const [mk, v] of flM) entry.monthly.set(mk, (entry.monthly.get(mk) ?? 0) + v);
      }
      bySec.set(sec, entry);
    }
    return Array.from(bySec.values()).sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section));
  }, [fsLineGroups, fsLineMonthlyTotals]);

  // Column-total row at the top — sum of all filtered lines per month.
  const columnTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filteredLines) {
      const mk = monthKeyOf(l.txn_date);
      if (!mk) continue;
      m.set(mk, (m.get(mk) ?? 0) + Number(l.amount ?? 0));
    }
    return m;
  }, [filteredLines]);

  const headerLabel =
    fsLineFilter === "all" ? "All P&L expense lines" : fsLineDisplayLabel(fsLineFilter);

  return (
    <div className="h-[calc(100vh-120px)] flex bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
      {sidebarOpen && (
        <Sidebar
          lines={linesRaw}
          fsLineFilter={fsLineFilter}
          setFsLineFilter={setFsLineFilter}
          view={view}
          setView={setView}
          viewCounts={viewCounts}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md border transition-colors flex-shrink-0",
              sidebarOpen
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )}
            title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
          </button>
          <div className="mr-auto min-w-0">
            <div className="font-semibold truncate">{headerLabel}</div>
            <div className="text-[11px] text-zinc-500">
              {range.label} · {range.start || "—"} → {range.end || "—"} · {totals.count} lines · {formatMoney(totals.sum)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Period</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="text-sm px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
            >
              <option value="fy24">FY24</option>
              <option value="fy25">FY25</option>
              <option value="ytd">YTD</option>
              <option value="all">All time</option>
              <option value="custom">Custom range…</option>
            </select>
            {datePreset === "custom" && (
              <>
                <input
                  type="date"
                  value={customStartInput}
                  onChange={(e) => setCustomStartInput(e.target.value)}
                  className="text-sm px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
                <span className="text-zinc-400">→</span>
                <input
                  type="date"
                  value={customEndInput}
                  onChange={(e) => setCustomEndInput(e.target.value)}
                  className="text-sm px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </>
            )}
          </div>
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memo, doc, payee…"
              className="w-full pl-8 pr-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
            />
          </div>
          <button
            onClick={() => setSelectMode((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border",
              selectMode
                ? "border-blue-400/60 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
            )}
            title="When on, clicking a drill-row cell toggles its selection instead of opening the bills popup."
          >
            {selectMode ? "Select: ON" : "Select cells"}
            {selectedCells.size > 0 && (
              <span className="ml-1 px-1.5 rounded bg-blue-600 text-white text-[10px]">{selectedCells.size}</span>
            )}
          </button>
          <button
            onClick={() => setHighlightOutliers((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border",
              highlightOutliers
                ? "border-rose-400/60 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
            )}
            title="Flag cells that deviate ≥50% from the row's nonzero median. Red = spike, amber = dip, blue dashed = missed month."
          >
            {highlightOutliers ? "Hide anomalies" : "Highlight anomalies"}
          </button>
          <button
            onClick={() => setShowFyTotals((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border",
              showFyTotals
                ? "border-sky-400/60 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
            )}
            title="Show FY total column at the end of each fiscal year"
          >
            {showFyTotals ? "Hide FY totals" : "Show FY totals"}
          </button>
          <button
            onClick={handleSyncExpenses}
            disabled={triggerSync.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-emerald-400/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Re-sync bills and expenses from QuickBooks"
          >
            <RefreshCw size={13} className={triggerSync.isPending ? "animate-spin" : ""} />
            {triggerSync.isPending ? "Syncing…" : "Sync expenses"}
          </button>
          <button
            onClick={() => setCapBuilderOpen(true)}
            disabled={viewCounts.cap_candidates === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-violet-400/60 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Package size={13} />
            Build Cap JE
            <span className="ml-1 px-1 rounded bg-violet-500 text-white text-[10px]">{viewCounts.cap_candidates}</span>
          </button>
        </div>

        {/* Grouped grid */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="px-6 py-12 text-center text-zinc-500 text-sm">Loading expense lines…</div>
          )}
          {!isLoading && fsLineGroups.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-500 text-sm">No lines match the current filters.</div>
          )}
          {!isLoading && fsLineGroups.length > 0 && (
            <table className="text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                {fyGroups.length > 0 && (
                  <tr>
                    <th
                      colSpan={3}
                      className="sticky left-0 z-30 px-3 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                      style={{ width: 552, minWidth: 552 }}
                    />
                    {fyGroups.map((g, i) => (
                      <th
                        key={g.fy}
                        colSpan={g.count + (showFyTotals ? 1 : 0)}
                        className={cn(
                          "text-center px-2 py-1 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-[10px] tracking-wide whitespace-nowrap",
                          g.fy % 2 === 0 ? "bg-sky-50/70 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300" : "text-zinc-700 dark:text-zinc-300",
                          i > 0 && "border-l-2 border-l-zinc-300 dark:border-l-zinc-700",
                        )}
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                )}
                <tr>
                  <th
                    className="sticky left-0 z-30 text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                    style={{ width: 360, minWidth: 360 }}
                  >
                    Payee / Line
                  </th>
                  <th
                    className="sticky z-30 text-right px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                    style={{ left: 360, width: 72, minWidth: 72 }}
                  >
                    Lines
                  </th>
                  <th
                    className="sticky z-30 text-right px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                    style={{ left: 432, width: 120, minWidth: 120 }}
                  >
                    Total
                  </th>
                  {gridColumns.map((c) => c.kind === "month" ? (
                    <th
                      key={c.m.key}
                      className={cn(
                        "text-right px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap",
                        fyCellClass(c.m),
                      )}
                      style={{ minWidth: 82 }}
                    >
                      {c.m.label}
                    </th>
                  ) : (
                    <th
                      key={`fyt-${c.fy}`}
                      className="text-right px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap bg-zinc-200/60 dark:bg-zinc-800/60 font-bold text-[10px] border-l-2 border-l-zinc-400 dark:border-l-zinc-600"
                      style={{ minWidth: 96 }}
                    >
                      {c.label} TOTAL
                    </th>
                  ))}
                </tr>
                <tr className="text-[10px] text-zinc-500">
                  <th
                    className="sticky left-0 z-30 text-left px-3 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 font-normal"
                    style={{ width: 360, minWidth: 360 }}
                  >
                    Column totals
                  </th>
                  <th
                    className="sticky z-30 text-right px-3 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 font-normal"
                    style={{ left: 360, width: 72, minWidth: 72 }}
                  >
                    {totals.count}
                  </th>
                  <th
                    className="sticky z-30 text-right px-3 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 font-mono font-semibold"
                    style={{ left: 432, width: 120, minWidth: 120 }}
                  >
                    {formatMoney(totals.sum)}
                  </th>
                  {gridColumns.map((c) => {
                    if (c.kind === "month") {
                      const t = columnTotals.get(c.m.key) ?? 0;
                      return (
                        <th
                          key={c.m.key}
                          className={cn(
                            "text-right px-2 py-1 border-b border-zinc-200 dark:border-zinc-800 font-mono font-normal whitespace-nowrap",
                            fyCellClass(c.m),
                          )}
                        >
                          {t > 0 ? formatMoney(t) : ""}
                        </th>
                      );
                    }
                    const t = sumByKeys(columnTotals, c.monthKeys);
                    return (
                      <th
                        key={`fyt-${c.fy}`}
                        className="text-right px-2 py-1 border-b border-zinc-200 dark:border-zinc-800 font-mono font-semibold whitespace-nowrap bg-zinc-200/60 dark:bg-zinc-800/60 border-l-2 border-l-zinc-400 dark:border-l-zinc-600"
                      >
                        {t > 0 ? formatMoney(t) : ""}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sectionGroups.map((sec) => {
                  const sectionOpen = !showFsLineTier || !collapsedSections.has(sec.section);
                  return (
                    <Fragment key={sec.section}>
                      {showFsLineTier && (
                        <tr
                          onClick={() => toggleSection(sec.section)}
                          className="cursor-pointer bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 group"
                        >
                          <td
                            className="sticky left-0 z-10 bg-zinc-200 dark:bg-zinc-800 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700 pl-2 pr-3 py-2 border-b border-zinc-400/60 dark:border-zinc-600"
                            style={{ width: 360, minWidth: 360 }}
                          >
                            <div className="flex items-center gap-2">
                              {sectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span className="font-bold text-[13px] uppercase tracking-wide">
                                {sectionLabel(sec.section)}
                              </span>
                              {sec.unreviewed > 0 && (
                                <span className="text-[10px] text-zinc-600 dark:text-zinc-400 shrink-0">· {sec.unreviewed} unreviewed</span>
                              )}
                              {sec.anomalies > 0 && (
                                <span className="text-[10px] text-amber-600 shrink-0">· {sec.anomalies}!</span>
                              )}
                            </div>
                          </td>
                          <td
                            className="sticky z-10 bg-zinc-200 dark:bg-zinc-800 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700 px-3 py-2 text-right border-b border-zinc-400/60 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400"
                            style={{ left: 360, width: 72, minWidth: 72 }}
                          >
                            {sec.lines}
                          </td>
                          <td
                            className="sticky z-10 bg-zinc-200 dark:bg-zinc-800 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700 px-3 py-2 text-right font-mono font-bold border-b border-zinc-400/60 dark:border-zinc-600"
                            style={{ left: 432, width: 120, minWidth: 120 }}
                          >
                            {formatMoney(sec.total)}
                          </td>
                          {gridColumns.map((c) => {
                            if (c.kind === "month") {
                              const v = sec.monthly.get(c.m.key) ?? 0;
                              return (
                                <td
                                  key={c.m.key}
                                  className={cn(
                                    "px-2 py-2 text-right font-mono font-bold border-b border-zinc-400/60 dark:border-zinc-600 whitespace-nowrap text-[11px]",
                                    fyCellClass(c.m),
                                  )}
                                >
                                  {v > 0 ? formatMoney(v) : ""}
                                </td>
                              );
                            }
                            const v = sumByKeys(sec.monthly, c.monthKeys);
                            return (
                              <td
                                key={`fyt-${c.fy}`}
                                className="px-2 py-2 text-right font-mono font-bold border-b border-zinc-400/60 dark:border-zinc-600 whitespace-nowrap text-[11px] bg-zinc-300/60 dark:bg-zinc-700/60 border-l-2 border-l-zinc-400 dark:border-l-zinc-600"
                              >
                                {v > 0 ? formatMoney(v) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {sectionOpen && sec.fsLines.map((fl) => {
                  const fsOpen = !showFsLineTier || expandedFsLines.has(fl.fs_line);
                  const flMonthly = fsLineMonthlyTotals.get(fl.fs_line) ?? new Map<string, number>();
                  return (
                    <Fragment key={fl.fs_line}>
                      {showFsLineTier && (
                        <tr
                          onClick={() => toggleFsLine(fl.fs_line)}
                          className="cursor-pointer bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 group"
                        >
                          <td
                            className="sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-900 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 pl-6 pr-3 py-2 border-b border-zinc-300 dark:border-zinc-700"
                            style={{ width: 360, minWidth: 360 }}
                          >
                            <div className="flex items-center gap-2">
                              {fsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <span className="font-semibold text-[13px] truncate">{fl.label}</span>
                              {fl.unreviewed > 0 && (
                                <span className="text-[10px] text-zinc-500 shrink-0">· {fl.unreviewed} unreviewed</span>
                              )}
                              {fl.anomalies > 0 && (
                                <span className="text-[10px] text-amber-600 shrink-0">· {fl.anomalies}!</span>
                              )}
                            </div>
                          </td>
                          <td
                            className="sticky z-10 bg-zinc-100 dark:bg-zinc-900 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 px-3 py-2 text-right border-b border-zinc-300 dark:border-zinc-700 text-zinc-500"
                            style={{ left: 360, width: 72, minWidth: 72 }}
                          >
                            {fl.lines}
                          </td>
                          <td
                            className="sticky z-10 bg-zinc-100 dark:bg-zinc-900 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 px-3 py-2 text-right font-mono font-bold border-b border-zinc-300 dark:border-zinc-700"
                            style={{ left: 432, width: 120, minWidth: 120 }}
                          >
                            {formatMoney(fl.total)}
                          </td>
                          {gridColumns.map((c) => {
                            if (c.kind === "month") {
                              const v = flMonthly.get(c.m.key) ?? 0;
                              return (
                                <td
                                  key={c.m.key}
                                  className={cn(
                                    "px-2 py-2 text-right font-mono font-semibold border-b border-zinc-300 dark:border-zinc-700 whitespace-nowrap text-[11px]",
                                    fyCellClass(c.m),
                                  )}
                                >
                                  {v > 0 ? formatMoney(v) : ""}
                                </td>
                              );
                            }
                            const v = sumByKeys(flMonthly, c.monthKeys);
                            return (
                              <td
                                key={`fyt-${c.fy}`}
                                className="px-2 py-2 text-right font-mono font-semibold border-b border-zinc-300 dark:border-zinc-700 whitespace-nowrap text-[11px] bg-zinc-200/60 dark:bg-zinc-800/60 border-l-2 border-l-zinc-400 dark:border-l-zinc-600"
                              >
                                {v > 0 ? formatMoney(v) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {fsOpen && fl.payees.map((g) => {
                        const payeeKey = `${fl.fs_line}::${g.key}`;
                        const monthly = payeeMonthlyTotals.get(payeeKey) ?? new Map<string, number>();
                        const payeeOutliers = highlightOutliers
                          ? buildOutlierMap(months.map((mm) => mm.key), (k) => monthly.get(k) ?? 0)
                          : null;
                        const isOpen = expandedPayees.has(payeeKey);
                        // When expanded: one drill row per distinct account
                        // across all months. Each row carries a per-month
                        // amount map + per-month underlying-lines map.
                        interface DrillRow {
                          key: string;
                          account_qbo_id: string | null;
                          account_name: string;
                          total: number;
                          monthly: Map<string, number>;
                          linesByMonth: Map<string, ExpenseLineUnified[]>;
                          entries: number;
                          unreviewed: number;
                          anomalies: number;
                          cap_candidates: number;
                          capitalised: number;
                        }
                        const drillRows: DrillRow[] = [];
                        if (isOpen) {
                          const byAcct = new Map<string, DrillRow>();
                          for (const l of g.lines) {
                            const ak = l.account_qbo_id ?? "_unmapped";
                            const mk = monthKeyOf(l.txn_date);
                            const row = byAcct.get(ak) ?? {
                              key: `${payeeKey}::${ak}`,
                              account_qbo_id: l.account_qbo_id,
                              account_name: l.account_name ?? "—",
                              total: 0,
                              monthly: new Map<string, number>(),
                              linesByMonth: new Map<string, ExpenseLineUnified[]>(),
                              entries: 0,
                              unreviewed: 0,
                              anomalies: 0,
                              cap_candidates: 0,
                              capitalised: 0,
                            };
                            const amt = Number(l.amount ?? 0);
                            row.total += amt;
                            row.entries += 1;
                            if (!l.is_reviewed) row.unreviewed += 1;
                            if (l.anomaly_flag || suggestedAnomalies.has(lineKey(l))) row.anomalies += 1;
                            if (l.cap_candidate && !l.capitalised_je_qbo_id) row.cap_candidates += 1;
                            if (l.capitalised_je_qbo_id) row.capitalised += 1;
                            if (mk) {
                              row.monthly.set(mk, (row.monthly.get(mk) ?? 0) + amt);
                              const arr = row.linesByMonth.get(mk) ?? [];
                              arr.push(l);
                              row.linesByMonth.set(mk, arr);
                            }
                            byAcct.set(ak, row);
                          }
                          for (const r of byAcct.values()) drillRows.push(r);
                          drillRows.sort((a, b) => b.total - a.total);
                        }
                        return (
                          <Fragment key={payeeKey}>
                            <tr
                              onClick={() => toggleExpandedPayee(payeeKey)}
                              onContextMenu={(e) => {
                                // Right-click on the payee row surfaces the
                                // action menu on the most recent line.
                                const last = g.lines[g.lines.length - 1];
                                if (last) onContextMenu(e, last);
                              }}
                              className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 group"
                            >
                              <td
                                className={cn(
                                  "sticky left-0 z-10 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900 py-2 border-b border-zinc-100 dark:border-zinc-900",
                                  showFsLineTier ? "pl-12 pr-3" : "px-3",
                                )}
                                style={{ width: 360, minWidth: 360 }}
                              >
                                <div className="flex items-center gap-2">
                                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  <span className="font-medium truncate">{g.payee_name}</span>
                                  {g.payee_type && (
                                    <span className="text-[10px] uppercase text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0">
                                      {g.payee_type}
                                    </span>
                                  )}
                                  {g.unreviewed > 0 && (
                                    <span className="text-[10px] text-zinc-500 shrink-0">· {g.unreviewed} unreviewed</span>
                                  )}
                                  {g.anomalies > 0 && (
                                    <span className="text-[10px] text-amber-600 shrink-0">· {g.anomalies}!</span>
                                  )}
                                  {g.cap_candidates > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 shrink-0">
                                      {g.cap_candidates} cap
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="sticky z-10 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900 px-3 py-2 text-right border-b border-zinc-100 dark:border-zinc-900 text-zinc-500"
                                style={{ left: 360, width: 72, minWidth: 72 }}
                              >
                                {g.lines.length}
                              </td>
                              <td
                                className="sticky z-10 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900 px-3 py-2 text-right font-mono font-semibold border-b border-zinc-100 dark:border-zinc-900"
                                style={{ left: 432, width: 120, minWidth: 120 }}
                              >
                                {formatMoney(g.total)}
                              </td>
                              {gridColumns.map((c) => {
                                if (c.kind === "month") {
                                  const v = monthly.get(c.m.key) ?? 0;
                                  return (
                                    <td
                                      key={c.m.key}
                                      className={cn(
                                        "px-2 py-2 text-right font-mono border-b border-zinc-100 dark:border-zinc-900 whitespace-nowrap text-[11px]",
                                        fyCellClass(c.m),
                                        outlierCellClass(payeeOutliers?.get(c.m.key) ?? null),
                                      )}
                                    >
                                      {v > 0 ? formatMoney(v) : ""}
                                    </td>
                                  );
                                }
                                const v = sumByKeys(monthly, c.monthKeys);
                                return (
                                  <td
                                    key={`fyt-${c.fy}`}
                                    className="px-2 py-2 text-right font-mono font-semibold border-b border-zinc-100 dark:border-zinc-900 whitespace-nowrap text-[11px] bg-zinc-100 dark:bg-zinc-800/40 border-l-2 border-l-zinc-400 dark:border-l-zinc-600"
                                  >
                                    {v > 0 ? formatMoney(v) : ""}
                                  </td>
                                );
                              })}
                            </tr>
                            {drillRows.map((dr) => {
                              const acctLeaf = dr.account_name.includes(":")
                                ? dr.account_name.split(":").slice(-1).join("")
                                : dr.account_name;
                              const drOutliers = highlightOutliers
                                ? buildOutlierMap(months.map((mm) => mm.key), (k) => dr.monthly.get(k) ?? 0)
                                : null;
                              const rowCls = cn(
                                "group bg-zinc-50 dark:bg-zinc-900",
                                dr.anomalies > 0 && "bg-amber-50/60 dark:bg-amber-950/30",
                                dr.cap_candidates > 0 && "bg-violet-50/60 dark:bg-violet-950/30",
                                dr.capitalised > 0 && "bg-violet-100/70 dark:bg-violet-950/50",
                              );
                              return (
                                <tr
                                  key={dr.key}
                                  onContextMenu={(e) => {
                                    const last = g.lines[g.lines.length - 1];
                                    if (last) onContextMenu(e, last);
                                  }}
                                  className={rowCls}
                                >
                                  <td
                                    className={cn(
                                      "sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900 group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900 py-1 border-b border-zinc-100 dark:border-zinc-900",
                                      showFsLineTier ? "pl-20 pr-3" : "pl-10 pr-3",
                                    )}
                                    style={{ width: 360, minWidth: 360 }}
                                  >
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                      <span className="truncate" title={dr.account_name}>{acctLeaf}</span>
                                      {dr.unreviewed > 0 && (
                                        <span className="text-[9px] text-zinc-500 shrink-0">· {dr.unreviewed} unrev</span>
                                      )}
                                      {dr.anomalies > 0 && (
                                        <span className="text-[9px] text-amber-600 shrink-0">· {dr.anomalies}!</span>
                                      )}
                                      {dr.cap_candidates > 0 && <Package size={10} className="text-violet-500 shrink-0" />}
                                    </div>
                                  </td>
                                  <td
                                    className="sticky z-10 bg-zinc-50 dark:bg-zinc-900 group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900 px-3 py-1 text-right border-b border-zinc-100 dark:border-zinc-900 text-zinc-400 text-[11px]"
                                    style={{ left: 360, width: 72, minWidth: 72 }}
                                  >
                                    {dr.entries}
                                  </td>
                                  <td
                                    className="sticky z-10 bg-zinc-50 dark:bg-zinc-900 group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900 px-3 py-1 text-right font-mono border-b border-zinc-100 dark:border-zinc-900 whitespace-nowrap text-[11px]"
                                    style={{ left: 432, width: 120, minWidth: 120 }}
                                  >
                                    {formatMoney(dr.total)}
                                  </td>
                                  {gridColumns.map((c) => {
                                    if (c.kind === "month") {
                                      const m = c.m;
                                      const v = dr.monthly.get(m.key) ?? 0;
                                      // Build this cell's context so the click handlers can
                                      // push it into single-post state or the multi-select map.
                                      const buildReversalCell = (): ReversalCell => {
                                        const rowValues = months.map((mm) => dr.monthly.get(mm.key) ?? 0);
                                        const nonZero = rowValues.filter((x) => x > 0).sort((a, b) => a - b);
                                        const median = nonZero.length > 0 ? nonZero[Math.floor(nonZero.length / 2)] : 0;
                                        const excess = median > 0 && v > median ? v - median : v;
                                        return {
                                          payee_qbo_id: g.payee_qbo_id,
                                          payee_type: g.payee_type,
                                          payee_name: g.payee_name,
                                          account_qbo_id: dr.account_qbo_id,
                                          account_name: dr.account_name,
                                          month_key: m.key,
                                          month_label: m.label,
                                          cell_total: v,
                                          suggested_amount: Math.round(excess * 100) / 100,
                                          currency: (dr.linesByMonth.get(m.key)?.[0]?.currency) ?? null,
                                        };
                                      };
                                      const selectionKey = cellSelectKey({
                                        account_qbo_id: dr.account_qbo_id,
                                        payee_qbo_id: g.payee_qbo_id,
                                        month_key: m.key,
                                      });
                                      const isSelected = selectedCells.has(selectionKey);
                                      return (
                                        <td
                                          key={m.key}
                                          onMouseDownCapture={(e) => {
                                            // Some webviews intercept Cmd+click for URL-drag
                                            // handling before React sees it. Consume the event
                                            // here so onClick still reaches us with modifiers.
                                            if ((e.metaKey || e.ctrlKey || e.altKey) && e.button === 0) {
                                              e.preventDefault();
                                            }
                                          }}
                                          onClick={(e) => {
                                            if (v <= 0) return;
                                            e.stopPropagation();
                                            // Multi-select: (a) select-mode toggle in toolbar,
                                            // (b) any modifier key held during click.
                                            if (selectMode || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
                                              toggleCellSelection(buildReversalCell());
                                              return;
                                            }
                                            setPopup({
                                              x: e.clientX,
                                              y: e.clientY,
                                              title: `${g.payee_name} · ${acctLeaf}`,
                                              subtitle: m.label,
                                              lines: dr.linesByMonth.get(m.key) ?? [],
                                            });
                                          }}
                                          onContextMenu={(e) => {
                                            if (v <= 0) return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setReversalCell(buildReversalCell());
                                          }}
                                          className={cn(
                                            "px-2 py-1 text-right font-mono border-b border-zinc-100 dark:border-zinc-900 whitespace-nowrap text-[11px]",
                                            fyCellClass(m),
                                            outlierCellClass(drOutliers?.get(m.key) ?? null),
                                            v > 0 && "cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
                                            isSelected && "ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-950/40",
                                          )}
                                          title={v > 0 ? "Click: view bills · Cmd/Ctrl+click: add to batch · Right-click: post reversal" : undefined}
                                        >
                                          {v > 0 ? formatMoney(v) : ""}
                                        </td>
                                      );
                                    }
                                    const v = sumByKeys(dr.monthly, c.monthKeys);
                                    const fyLines: ExpenseLineUnified[] = [];
                                    for (const k of c.monthKeys) {
                                      const arr = dr.linesByMonth.get(k);
                                      if (arr) fyLines.push(...arr);
                                    }
                                    return (
                                      <td
                                        key={`fyt-${c.fy}`}
                                        onClick={(e) => {
                                          if (v <= 0) return;
                                          e.stopPropagation();
                                          setPopup({
                                            x: e.clientX,
                                            y: e.clientY,
                                            title: `${g.payee_name} · ${acctLeaf}`,
                                            subtitle: `${c.label} total`,
                                            lines: fyLines,
                                          });
                                        }}
                                        className={cn(
                                          "px-2 py-1 text-right font-mono font-semibold border-b border-zinc-100 dark:border-zinc-900 whitespace-nowrap text-[11px] bg-zinc-100 dark:bg-zinc-800/40 border-l-2 border-l-zinc-400 dark:border-l-zinc-600",
                                          v > 0 && "cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
                                        )}
                                      >
                                        {v > 0 ? formatMoney(v) : ""}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {popup && (
        <BillsPopup
          popup={popup}
          onClose={() => setPopup(null)}
          onContextLine={(e, line) => {
            setPopup(null);
            onContextMenu(e, line);
          }}
        />
      )}
      {menu && <ActionMenu menu={menu} onClose={() => setMenu(null)} assetAccounts={assetAccounts} />}
      {reversalCell && (
        <ReversalAccrualModal
          cell={reversalCell}
          liabilityAccounts={liabilityAccounts}
          onClose={() => setReversalCell(null)}
        />
      )}
      {batchOpen && (
        <BatchReversalModal
          cells={selectedCells}
          liabilityAccounts={liabilityAccounts}
          onClose={() => {
            setBatchOpen(false);
            clearCellSelection();
          }}
        />
      )}
      {selectedCells.size > 0 && !batchOpen && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border border-blue-400/60 bg-blue-600 text-white text-xs">
          <span className="font-semibold">{selectedCells.size} cell{selectedCells.size === 1 ? "" : "s"} selected</span>
          <button
            onClick={() => setBatchOpen(true)}
            className="ml-2 px-3 py-1 rounded bg-white text-blue-700 hover:bg-blue-50 font-semibold"
          >
            Post reversals…
          </button>
          <button
            onClick={clearCellSelection}
            className="px-2 py-1 rounded hover:bg-blue-700 text-white/80"
            title="Clear selection"
          >
            Clear
          </button>
        </div>
      )}
      {capBuilderOpen && (
        <CapJeBuilder
          lines={linesRaw}
          assetAccounts={assetAccounts}
          onClose={() => setCapBuilderOpen(false)}
        />
      )}
    </div>
  );
}
