// Invoice Recognition — timeline grid view.
//
// Each invoice line is a row, with the invoice net amount placed in its
// txn_date month column. Below each line, one row per matched recognition JE
// (joined via doc_number prefix + line_type), each placing its own amount in
// its txn_date month. Columns auto-extend to cover the selected period (e.g.
// FY24 → Aug-23 .. Jul-24).
//
// Reads from the SQL view `invoice_lines_with_recognition` and
// `qbo_journal_entries` (parsed via the recognition memo regex).

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useInvoiceLinesWithRecognition,
  useOrderforms,
  useFyRecognitionJes,
  useJeOverrides,
  useUpsertJeOverride,
  useDeleteJeOverride,
  useReviewInvoiceLine,
  useUnreviewInvoiceLine,
  useUpsertInvoiceLineRecognition,
  useCreateJournalEntries,
  useUpdateJeDocNumber,
  useUpdateJeTxnDate,
  useUpdateJeAmount,
  useDeleteJe,
  useDeleteInvoice,
  useSyncInvoice,
  useSetInvoiceLineAdjustment,
  useFyAccountConfig,
  classifyLineType,
  type InvoiceLineWithRecognition,
  type ParsedRecognitionJe,
  type JeOverride,
  type FyAccountConfig,
} from "../../hooks/finance/useFyReview";
import { useQboCustomers, useQboAccounts } from "../../hooks/finance/useQboData";
import { useTriggerSync } from "../../hooks/finance/useTriggerSync";
import { AccountConfigCard } from "./AccountConfigCard";
import { CustomerReviewSidebar } from "./CustomerReviewSidebar";
import { formatDate, formatMoney } from "./formatters";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";
import { useCollapsiblePanel } from "../../hooks/useCollapsiblePanel";
import { PanelLeftOpen, Trash2, RefreshCw, Settings2, ChevronDown, Info } from "lucide-react";

// Sticky-left columns. The first 8 columns (Kind … Net) freeze; the month
// columns scroll horizontally underneath. Each frozen cell needs:
//   * position: sticky
//   * left: cumulative width of preceding frozen columns
//   * a non-transparent bg (so it overlays scrolling cells)
//   * z-index higher than scrolling cells (and headers higher still)
//
// Two of these are user-resizable (Customer, Item/Memo); the others have
// fixed defaults. Cumulative offsets recompute when widths change.
const FROZEN_COLS = ["kind", "doc", "date", "customer", "item", "period", "type", "net"] as const;
type ColId = typeof FROZEN_COLS[number];

const FROZEN_DEFAULT_WIDTHS: Record<ColId, number> = {
  kind:     150,
  doc:      110,
  date:      96,
  customer: 220,  // resizable
  item:     320,  // resizable
  period:   140,
  type:      60,
  net:       96,
};

// Local-storage-persisted overrides (only Customer + Item are user-resizable
// for now, but the storage shape is generic so we can add more).
// v3 — period column widened to fit "09 Aug 23 → 08 Sep 24" extracted-date subtitle.
const COL_WIDTH_STORAGE_KEY = "invoice-recognition-col-widths-v3";
const DEFAULT_COL_WIDTHS: Record<ColId, number> = { ...FROZEN_DEFAULT_WIDTHS };

function cumulativeLefts(widths: Record<ColId, number>): Record<ColId, number> {
  let offset = 0;
  const out = {} as Record<ColId, number>;
  for (const c of FROZEN_COLS) {
    out[c] = offset;
    offset += widths[c];
  }
  return out;
}

function stickyCls(_col: ColId, bg: string): string {
  return `sticky z-10 ${bg}`;
}
function stickyStyle(col: ColId, widths: Record<ColId, number>, lefts: Record<ColId, number>): React.CSSProperties {
  return { left: lefts[col], width: widths[col], minWidth: widths[col], maxWidth: widths[col] };
}

function useColumnWidths() {
  const [widths, setWidths] = useState<Record<ColId, number>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(COL_WIDTH_STORAGE_KEY) : null;
      return raw ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(raw) } : DEFAULT_COL_WIDTHS;
    } catch {
      return DEFAULT_COL_WIDTHS;
    }
  });
  const setWidth = (col: ColId, width: number) => {
    setWidths((prev) => {
      const next = { ...prev, [col]: Math.max(80, Math.round(width)) };
      try { localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  return { widths, setWidth };
}

function ResizeHandle({ onResize }: { onResize: (newWidth: number) => void }) {
  function handleMouseDown(e: React.MouseEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget.parentElement as HTMLElement | null);
    if (!th) return;
    const startX = e.clientX;
    const startWidth = th.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    function move(ev: MouseEvent) {
      onResize(startWidth + ev.clientX - startX);
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  return (
    <span
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
      title="Drag to resize column"
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-emerald-400/60 transition-colors"
    />
  );
}

type StatusFilter = "all" | "Paid" | "Sent" | "Partial" | "NotSent";
type DatePreset =
  | "fy24"
  | "fy24_ext"
  | "fy25"
  | "fy25_ext"
  | "ytd"
  | "all"
  | "custom";
type TypeFilter = "all" | "SUB" | "SVC";
type SortDir = "desc" | "asc";

interface DateRange { start: string; end: string; label: string }

const FY_RANGES: Record<Exclude<DatePreset, "custom">, DateRange> = {
  fy24:     { start: "2023-08-01", end: "2024-07-31", label: "FY24 (Aug-23 → Jul-24)" },
  fy24_ext: { start: "2023-02-01", end: "2025-01-31", label: "FY24 ±6 mo (24 mo window)" },
  fy25:     { start: "2024-08-01", end: "2025-07-31", label: "FY25 (Aug-24 → Jul-25)" },
  fy25_ext: { start: "2024-02-01", end: "2026-01-31", label: "FY25 ±6 mo (24 mo window)" },
  ytd:      { start: "", end: "", label: "YTD" },                       // computed at runtime
  all:      { start: "2020-01-01", end: "", label: "All time" },        // computed at runtime
};

function resolveRange(preset: DatePreset, custom: { start: string; end: string }): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  if (preset === "ytd") {
    const t = new Date();
    const y = t.getFullYear();
    const fyStart = t.getMonth() >= 7 ? `${y}-08-01` : `${y - 1}-08-01`;
    return { start: fyStart, end: today, label: "YTD" };
  }
  if (preset === "all") {
    return { start: "2020-01-01", end: extendDate(today, 12), label: "All time" };
  }
  if (preset === "custom") {
    return { start: custom.start, end: custom.end, label: "Custom" };
  }
  return FY_RANGES[preset];
}

interface MonthCol {
  key: string;        // "2023-08"
  label: string;      // "Aug 23"
  start: string;      // "2023-08-01"
  end: string;        // "2023-08-31"
  fy: number;         // 2024 for Aug-23..Jul-24 (FY24)
  isFyStart: boolean; // true for the first month of a new FY within `months`
}

// Fiscal year: Aug N → Jul N+1 is FY(N+1). E.g. Aug 2023 – Jul 2024 = FY24.
function fyOfMonth(year: number, month1: number): number {
  return month1 >= 8 ? year + 1 : year;
}

// Grid column — either a real month (the default grid) or a fiscal-year
// subtotal column that appears after the last month of each FY when the
// "Show FY totals" toggle is on. Row renders iterate `gridColumns` to paint
// cells in order so the data table and headers stay aligned.
type GridCol =
  | { kind: "month"; m: MonthCol }
  | { kind: "fyTotal"; fy: number; label: string; monthKeys: string[] };

// Sum a `byMonth` record across a list of month keys. Used everywhere a row
// renders an FY-total cell: the row already has per-month values, and the
// fy column value is just the sum of those months within the FY.
function sumByKeys(byMonth: Record<string, number> | Map<string, number>, keys: string[]): number {
  let s = 0;
  if (byMonth instanceof Map) {
    for (const k of keys) s += byMonth.get(k) ?? 0;
  } else {
    for (const k of keys) s += byMonth[k] ?? 0;
  }
  return s;
}

function monthsForRange(range: { start: string; end: string }): MonthCol[] {
  const out: MonthCol[] = [];
  const s = new Date(range.start + "T00:00:00Z");
  const e = new Date(range.end + "T00:00:00Z");
  const cursor = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  let prevFy: number | null = null;
  while (cursor <= e) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const yyyy = cursor.getUTCFullYear();
    const m1 = cursor.getUTCMonth() + 1;
    const mm = String(m1).padStart(2, "0");
    const fy = fyOfMonth(yyyy, m1);
    out.push({
      key: `${yyyy}-${mm}`,
      label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      start: `${yyyy}-${mm}-01`,
      end: monthEnd.toISOString().slice(0, 10),
      fy,
      isFyStart: prevFy !== null && fy !== prevFy,
    });
    prevFy = fy;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

// Last day of the previous calendar month, ISO YYYY-MM-DD.
// e.g. invoked on 2026-04-19 → "2026-03-31".
function lastDayOfPrevMonth(): string {
  const now = new Date();
  // Day 0 of (current month) === last day of previous month.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return d.toISOString().slice(0, 10);
}

// Strict YYYY-MM-DD validation. The browser's <input type="date"> can fire
// onChange with empty/partial values during typing (especially when the user
// edits the year digit-by-digit), and downstream code that calls
// .toISOString() will throw RangeError on invalid Dates → blank screen.
function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip to catch e.g. "2025-02-31" which Date silently rolls over.
  return d.toISOString().slice(0, 10) === s;
}

function monthKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 7);
}

function ViewMenu({
  statusFilter, setStatusFilter,
  showZeroLines, setShowZeroLines,
  recognisedOnly, setRecognisedOnly,
  sortDir, setSortDir,
  onExpandAll, onCollapseAll,
  showCustomerCollapseControls,
  onCollapseAllCustomers, onExpandAllCustomers,
}: {
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
  showZeroLines: boolean;
  setShowZeroLines: (v: boolean) => void;
  recognisedOnly: boolean;
  setRecognisedOnly: (v: boolean) => void;
  sortDir: SortDir;
  setSortDir: React.Dispatch<React.SetStateAction<SortDir>>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  showCustomerCollapseControls: boolean;
  onCollapseAllCustomers: () => void;
  onExpandAllCustomers: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const activeCount =
    (statusFilter !== "all" ? 1 : 0) +
    (showZeroLines ? 1 : 0) +
    (recognisedOnly ? 1 : 0) +
    (sortDir !== "asc" ? 1 : 0);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        title="View options"
      >
        <Settings2 size={13} />
        View
        {activeCount > 0 && (
          <span className="ml-0.5 px-1 rounded text-[10px] bg-emerald-500 text-white">{activeCount}</span>
        )}
        <ChevronDown size={12} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 z-40 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full text-sm px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
            >
              <option value="all">All statuses</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Sent">Sent</option>
              <option value="NotSent">NotSent</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={showZeroLines} onChange={(e) => setShowZeroLines(e.target.checked)} />
              Show $0 lines
            </label>
            <label
              className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
              title="Hide invoice header rows, show only JE rows and adjustment JEs"
            >
              <input type="checkbox" checked={recognisedOnly} onChange={(e) => setRecognisedOnly(e.target.checked)} />
              Recognised only
            </label>
          </div>
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2 space-y-1.5">
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Sort: Date {sortDir === "desc" ? "↓ newest first" : "↑ oldest first"}
            </button>
            <button
              onClick={() => { onExpandAll(); setOpen(false); }}
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Expand all rows
            </button>
            <button
              onClick={() => { onCollapseAll(); setOpen(false); }}
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Collapse all rows
            </button>
            {showCustomerCollapseControls && (
              <>
                <button
                  onClick={() => { onCollapseAllCustomers(); setOpen(false); }}
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Collapse all customers
                </button>
                <button
                  onClick={() => { onExpandAllCustomers(); setOpen(false); }}
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Expand all customers
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function InvoiceRecognitionView() {
  const syncJes = useTriggerSync();
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");
  // Custom range — start defaults to start of FY24 (Aug 2023). End defaults
  // to the last day of the PREVIOUS calendar month (current month minus one).
  // Why previous month: ongoing month is mid-recognition and tends to look
  // half-done in the variance, so anchoring to the last fully-closed month
  // gives a cleaner "what should be done by now" view.
  const DEFAULT_START = "2023-08-01";
  const DEFAULT_END = useMemo(() => lastDayOfPrevMonth(), []);
  // Two layers: *Input* tracks what's literally in the <input type="date">
  // box (can be momentarily empty/partial as the user types each digit).
  // *customStart/End* are the SANITIZED values that flow into queries and
  // computations. Without this split, typing the year digit-by-digit can
  // briefly produce an invalid Date which trips .toISOString() → blank screen.
  const [customStartInput, setCustomStartInput] = useState<string>(DEFAULT_START);
  const [customEndInput, setCustomEndInput] = useState<string>(DEFAULT_END);
  const customStart = useMemo(
    () => (isValidIsoDate(customStartInput) ? customStartInput : DEFAULT_START),
    [customStartInput],
  );
  const customEnd = useMemo(
    () => (isValidIsoDate(customEndInput) ? customEndInput : DEFAULT_END),
    [customEndInput, DEFAULT_END],
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all"); // "all" or qbo_id
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupBy, setGroupBy] = useState<"date" | "customer">(() => {
    try { return (localStorage.getItem("tv-finance-group-by") === "date" ? "date" : "customer"); }
    catch { return "customer"; }
  });
  const setGroupByPersist = (v: "date" | "customer") => {
    setGroupBy(v);
    try { localStorage.setItem("tv-finance-group-by", v); } catch { /* ignore */ }
  };
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Per-customer expanded state (only meaningful in "By customer" view).
  // Default: all customers COLLAPSED — only customers the user has explicitly
  // opened are tracked here, and that selection persists across reloads.
  const EXPANDED_CUSTOMERS_KEY = "tv-finance-expanded-customers";
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_CUSTOMERS_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleCustomerExpanded = (custId: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) next.delete(custId);
      else next.add(custId);
      try { localStorage.setItem(EXPANDED_CUSTOMERS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };
  // QBO emits $0 lines for bundled extras (e.g. complimentary Setup with a SUB
  // line). They have no revenue to recognize, so hide by default — toggle on
  // to inspect.
  const [showZeroLines, setShowZeroLines] = useState(false);
  // "Recognised only" view: hides invoice header rows so only the JE rows and
  // adjustment JEs are visible. Useful for seeing just the revenue-recognition
  // flow month-by-month. Auto-expands every line since JE rows live inside
  // the per-line expand fold.
  const [recognisedOnly, setRecognisedOnly] = useState(false);
  const { widths: colWidths, setWidth: setColWidth } = useColumnWidths();
  const lefts = useMemo(() => cumulativeLefts(colWidths), [colWidths]);

  // Sticky-top: filter bar pins to top of FinanceModule's scroll container,
  // table headers pin just below it. Measure filter-bar height so the headers
  // know how much to offset. The totals summary then pins below the headers
  // using headerH (column-header row height).
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [filterBarH, setFilterBarH] = useState(0);
  useLayoutEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const update = () => setFilterBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Header row ref attaches via callback so the ResizeObserver picks it up
  // even when the table appears AFTER the initial render (e.g. when
  // isLoading flips false after data arrives — a normal useLayoutEffect with
  // an empty dep list would have already missed it).
  const [headerH, setHeaderH] = useState(0);
  const headerObserverRef = useRef<ResizeObserver | null>(null);
  const headerRowRef = useCallback((el: HTMLTableRowElement | null) => {
    headerObserverRef.current?.disconnect();
    if (!el) return;
    setHeaderH(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    headerObserverRef.current = ro;
  }, []);

  // Right-click on a JE row → show floating "assign to invoice line" menu.
  const [jeMenu, setJeMenu] = useState<{ x: number; y: number; je: ParsedRecognitionJe } | null>(null);
  function openJeMenu(e: React.MouseEvent, je: ParsedRecognitionJe) {
    e.preventDefault();
    setJeMenu({ x: e.clientX, y: e.clientY, je });
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const range = useMemo(
    () => resolveRange(datePreset, { start: customStart, end: customEnd }),
    [datePreset, customStart, customEnd],
  );
  const months = useMemo(() => monthsForRange(range), [range]);

  // "Show FY totals" toggle — mirrors ExpenseReview's identical feature.
  // When on, a per-FY subtotal column follows the last month of each fiscal
  // year in the grid. Persisted so the setting survives reloads.
  const [showFyTotals, setShowFyTotals] = useState<boolean>(() => {
    try { return localStorage.getItem("tv-finance-invoice-recognition-show-fy-totals") === "true"; }
    catch { return false; }
  });
  const setShowFyTotalsPersist = (v: boolean) => {
    setShowFyTotals(v);
    try { localStorage.setItem("tv-finance-invoice-recognition-show-fy-totals", String(v)); }
    catch { /* ignore */ }
  };

  // Consecutive runs of months sharing an FY — drives the colSpan'd FY
  // header row above the month headers and the monthKeys list used to sum
  // each row's values into its FY-total column.
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

  // Flat column list: each month is a column; when `showFyTotals`, an extra
  // fyTotal column follows the last month of its FY. All row renders iterate
  // this so the grid stays aligned across the thead, summary rows, line
  // rows, JE rows, customer subtotals, schedule rows, and adjustments.
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

  // "Compact rows" toggle — mirrors ExpenseReview's one-row-per-line pattern.
  // When on (default), every invoice line renders as a single row; month cells
  // show the RECOGNISED distribution per month (sum of matched JE amounts) so
  // the recognition schedule is visible directly on the invoice row. Click a
  // cell to open a popover with the matched JEs + actions. When off, the
  // original detail view renders (invoice row + matched JE sub-rows + variance
  // controls), and month cells show invoice amount in its own txn month only.
  const [compactRows, setCompactRows] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("tv-finance-invoice-recognition-compact-rows");
      return raw == null ? true : raw === "true";
    } catch { return true; }
  });
  const setCompactRowsPersist = (v: boolean) => {
    setCompactRows(v);
    try { localStorage.setItem("tv-finance-invoice-recognition-compact-rows", String(v)); }
    catch { /* ignore */ }
  };

  const { data: lines, isLoading } = useInvoiceLinesWithRecognition({
    startDate: range.start,
    endDate: range.end,
  });
  useOrderforms(); // pre-warm cache for future contract linking
  const { data: customers } = useQboCustomers();
  const { data: accounts } = useQboAccounts();
  const { data: overrides, isSuccess: overridesLoaded } = useJeOverrides();
  // Pull recognition JEs across the period + a generous 60-month tail so
  // long recognition schedules (multi-year subscriptions invoiced just
  // before the filter end date) don't appear broken purely because their
  // later periods fall past the filter cutoff. We only extend forward —
  // extending backward would drag in JEs for invoices not in the current
  // view, inflating the Unmatched count. Additionally, always include any
  // JE the user has explicitly attributed via an override so narrowing
  // the period filter can't hide a manually-pinned attribution.
  const overrideJeIds = useMemo(() => (overrides ?? []).map((o) => o.qbo_je_id), [overrides]);
  const { data: jes, isSuccess: jesLoaded } = useFyRecognitionJes({
    startDate: range.start,
    endDate: extendDate(range.end, 60),
    alwaysIncludeIds: overrideJeIds,
  });
  // Auto-revoke stale review should only consider the matcher settled AFTER
  // both JEs and overrides have loaded. Without this guard it fires during
  // the initial load window (when matched=0 for every line) and wipes every
  // reviewed flag.
  const matcherReady = jesLoaded && overridesLoaded;
  const { data: accountConfig } = useFyAccountConfig();

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of (accounts ?? []) as Array<{ qbo_id: string; name: string }>) {
      m.set(a.qbo_id, a.name);
    }
    return m;
  }, [accounts]);

  const customerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers ?? []) {
      m.set(c.qbo_id, c.display_name ?? c.company_name ?? "(unknown)");
    }
    return m;
  }, [customers]);

  // Doc# → JE map across ALL JEs in the loaded window. Passed into the
  // Generate modal so it can flag doc# collisions BEFORE the user pushes
  // (e.g. trying to create "1095-SUB-1" when 1095-1's existing JE already
  // owns that doc#).
  const allJeByDocNumber = useMemo(() => {
    const m = new Map<string, ParsedRecognitionJe>();
    for (const j of jes ?? []) {
      if (j.doc_number) m.set(j.doc_number, j);
    }
    return m;
  }, [jes]);

  // ALL invoice lines (within the loaded period), grouped by invoice. Used as
  // the matcher's full universe so attribution stays consistent regardless of
  // which UI filters are on. Without this, toggling Subscription/Services
  // would wrongly mark every JE for the hidden type as "unmatched".
  const allGroupedInvoices = useMemo(() => {
    const groups = new Map<string, { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }>();
    for (const l of lines ?? []) {
      if (!showZeroLines && Number(l.amount ?? 0) === 0) continue;
      const g = groups.get(l.qbo_invoice_id);
      if (g) g.lines.push(l);
      else groups.set(l.qbo_invoice_id, { header: l, lines: [l] });
    }
    return Array.from(groups.values());
  }, [lines, showZeroLines]);

  // Filter lines, then group by invoice for sorted rendering.
  const groupedInvoices = useMemo(() => {
    const filtered = (lines ?? []).filter((l) => {
      if (!showZeroLines && Number(l.amount ?? 0) === 0) return false;
      if (statusFilter !== "all" && l.invoice_status !== statusFilter) return false;
      if (customerFilter !== "all" && l.customer_qbo_id !== customerFilter) return false;
      if (typeFilter !== "all") {
        const eff = l.line_type ?? classifyLineType(l.item_ref);
        if (eff !== typeFilter) return false;
      }
      if (search) {
        const needle = search.toLowerCase();
        const customer = l.customer_qbo_id ? (customerNameById.get(l.customer_qbo_id) ?? "") : "";
        const haystack = `${l.doc_number ?? ""} ${l.description ?? ""} ${l.item_ref ?? ""} ${customer}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    const groups = new Map<string, { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }>();
    for (const l of filtered) {
      const g = groups.get(l.qbo_invoice_id);
      if (g) g.lines.push(l);
      else groups.set(l.qbo_invoice_id, { header: l, lines: [l] });
    }
    const arr = Array.from(groups.values());
    const dir = sortDir === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      if (groupBy === "customer") {
        const aCust = a.header.customer_qbo_id ? (customerNameById.get(a.header.customer_qbo_id) ?? "") : "";
        const bCust = b.header.customer_qbo_id ? (customerNameById.get(b.header.customer_qbo_id) ?? "") : "";
        const cCmp = aCust.localeCompare(bCust);
        if (cCmp !== 0) return cCmp;
      }
      const dCmp = (a.header.txn_date ?? "").localeCompare(b.header.txn_date ?? "");
      if (dCmp !== 0) return dir * dCmp;
      return dir * (a.header.doc_number ?? "").localeCompare(b.header.doc_number ?? "", undefined, { numeric: true });
    });
    return arr;
  }, [lines, statusFilter, typeFilter, customerFilter, search, sortDir, groupBy, customerNameById, showZeroLines]);

  // Distinct customer list for the dropdown — derived from BOTH invoices
  // and JEs in the loaded period. Including JE customers surfaces accounts
  // that have recognition activity (or orphan adjustment JEs) in the period
  // even when no invoice was issued — common for migration JEs and customers
  // whose invoices fall outside the visible window.
  const customerOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const l of lines ?? []) {
      if (l.customer_qbo_id) ids.add(l.customer_qbo_id);
    }
    for (const j of jes ?? []) {
      if (j.customer_qbo_id) ids.add(j.customer_qbo_id);
    }
    return Array.from(ids)
      .map((id) => ({ id, name: customerNameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lines, jes, customerNameById]);

  // The central JE → invoice line matcher. Layered logic: overrides take
  // precedence, then strong (regex prefix + customer + window), then fuzzy
  // (customer + window + amount). Outputs both per-line matches and the
  // unmatched pool so the UI can render an "Unmatched JEs" section.
  const matchPlan = useMemo(
    () => buildMatchPlan({
      groups: allGroupedInvoices,
      jes: jes ?? [],
      overrides: overrides ?? [],
      accountConfig: accountConfig ?? null,
    }),
    [allGroupedInvoices, jes, overrides, accountConfig],
  );

  // Apply the page-level Customer + Type filters to the standalone adjustment
  // JEs so the Adjustments section and the Recognised summary both reflect
  // what the user is actually looking at.
  const filteredMatchPlan = useMemo<MatchPlan>(() => {
    const standalone = matchPlan.standalone.filter((j) => {
      if (customerFilter !== "all" && j.customer_qbo_id !== customerFilter) return false;
      if (typeFilter !== "all") {
        const t = j.type ?? "OTHER";
        if (typeFilter === "SUB" && t !== "SUB") return false;
        if (typeFilter === "SVC" && t === "SUB") return false; // SVC filter includes SVC+OTHER
      }
      return true;
    });
    return { ...matchPlan, standalone };
  }, [matchPlan, customerFilter, typeFilter]);

  const totals = useMemo(() => computePeriodTotals(groupedInvoices, filteredMatchPlan, months), [groupedInvoices, filteredMatchPlan, months]);

  // Per-customer Invoiced + Recognised totals — used to render a 2-row monthly
  // summary under each customer header (mirrors the top totals at customer
  // scope). Each JE counted once even when it appears on multiple lines.
  const customerTotalsById = useMemo(() => {
    const monthKeys = new Set(months.map((m) => m.key));
    const out = new Map<string, { invoice: { total: number; byMonth: Record<string, number> }; je: { total: number; byMonth: Record<string, number> } }>();
    const seenJes = new Set<string>();
    const ensure = (id: string) => {
      let entry = out.get(id);
      if (!entry) {
        entry = { invoice: { total: 0, byMonth: {} }, je: { total: 0, byMonth: {} } };
        out.set(id, entry);
      }
      return entry;
    };
    const add = (b: { total: number; byMonth: Record<string, number> }, amt: number, k: string | null) => {
      b.total += amt;
      if (k && monthKeys.has(k)) b.byMonth[k] = (b.byMonth[k] ?? 0) + amt;
    };
    for (const g of groupedInvoices) {
      const custId = g.header.customer_qbo_id ?? "";
      if (!custId) continue;
      const entry = ensure(custId);
      for (const line of g.lines) {
        const amt = Number(line.amount ?? 0);
        add(entry.invoice, amt, monthKeyOf(line.txn_date));
        const matched = matchPlan.byLineKey.get(`${line.qbo_invoice_id}-${line.qbo_line_id}`) ?? [];
        for (const j of matched) {
          if (seenJes.has(j.qbo_id)) continue;
          seenJes.add(j.qbo_id);
          add(entry.je, Number(j.amount ?? 0), monthKeyOf(j.txn_date));
        }
      }
    }
    for (const j of filteredMatchPlan.standalone) {
      if (!j.customer_qbo_id || seenJes.has(j.qbo_id)) continue;
      seenJes.add(j.qbo_id);
      const entry = ensure(j.customer_qbo_id);
      add(entry.je, Number(j.amount ?? 0), monthKeyOf(j.txn_date));
    }
    return out;
  }, [groupedInvoices, matchPlan, filteredMatchPlan.standalone, months]);

  // Adjustment JEs split for "By customer" view:
  //   - orphans (no customer_qbo_id) → top block (always)
  //   - per-customer → fold into matching customer's group
  //   - customers with adjustments but no invoices in view → rendered as
  //     virtual customer blocks at the end so the audit picture is complete.
  const adjustmentsByCustomer = useMemo(() => {
    const m = new Map<string, ParsedRecognitionJe[]>();
    if (groupBy !== "customer") return m;
    for (const j of filteredMatchPlan.standalone) {
      if (!j.customer_qbo_id) continue;
      const arr = m.get(j.customer_qbo_id);
      if (arr) arr.push(j);
      else m.set(j.customer_qbo_id, [j]);
    }
    return m;
  }, [filteredMatchPlan.standalone, groupBy]);

  const topBlockAdjustments = useMemo(() => {
    if (groupBy !== "customer") return filteredMatchPlan.standalone;
    return filteredMatchPlan.standalone.filter((j) => !j.customer_qbo_id);
  }, [filteredMatchPlan.standalone, groupBy]);

  // Customers that ONLY have adjustment JEs (no invoices in groupedInvoices)
  // — render at the end so they aren't lost when adjustments are folded
  // into per-customer blocks.
  const adjustmentOnlyCustomers = useMemo(() => {
    if (groupBy !== "customer") return [] as string[];
    const invoiceCustIds = new Set<string>();
    for (const g of groupedInvoices) {
      if (g.header.customer_qbo_id) invoiceCustIds.add(g.header.customer_qbo_id);
    }
    return Array.from(adjustmentsByCustomer.keys())
      .filter((id) => !invoiceCustIds.has(id))
      .sort((a, b) => (customerNameById.get(a) ?? "").localeCompare(customerNameById.get(b) ?? ""));
  }, [groupBy, groupedInvoices, adjustmentsByCustomer, customerNameById]);

  // Customer review sidebar — collapsible, persisted in localStorage.
  // Match the sidebar pattern used by InboxModule (PanelLeftClose collapse,
  // bg-zinc-50 chrome, teal active state).
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useCollapsiblePanel(
    "tv-finance-invoice-recognition-sidebar-collapsed",
  );

  if (isLoading) return <div className="text-sm text-zinc-500">Loading invoices…</div>;

  return (
    <div className="h-[calc(100vh-120px)] flex bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
      {/* Sidebar — fills the card height naturally; the card's overflow-hidden
          + fixed height replace the prior sticky/self-start/max-h-screen trick. */}
      {sidebarCollapsed ? (
        <div className="w-10 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center py-2">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
            title="Expand customers panel"
          >
            <PanelLeftOpen size={14} />
          </button>
        </div>
      ) : (
        <CustomerReviewSidebar
          groupedInvoices={allGroupedInvoices}
          matchedByLineKey={matchPlan.byLineKey}
          unmatchedJes={matchPlan.unmatched}
          standaloneJes={matchPlan.standalone}
          customerNameById={customerNameById}
          selectedCustomer={customerFilter}
          onSelect={setCustomerFilter}
          onCollapse={toggleSidebar}
        />
      )}
      {/* Main content — overflow-auto creates a new scroll context so the
          title, AccountConfigCard, sticky filter bar, and grid all scroll
          inside the card (matching ExpenseReview's h-[calc(100vh-120px)]
          overflow-hidden pattern). */}
      <div className="flex-1 min-w-0 px-6 py-6 space-y-4 overflow-auto">
      {/* Title row — anchors the page with a clear label + period summary,
          mirroring the ExpenseReview header pattern. The description that used
          to sit here as a paragraph is now tucked into the (i) tooltip. */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-semibold truncate">
              {customerFilter === "all"
                ? "All customers"
                : (customerNameById.get(customerFilter) ?? "Customer")}
            </div>
            <span
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-help"
              title="Invoices and matched recognition JEs side-by-side, on a calendar grid. Each row's amount sits in the column for its own date — invoice in the invoice's month, JE in the JE's month. Mismatched timing is visible at a glance."
            >
              <Info size={13} />
            </span>
          </div>
          <div className="text-[11px] text-zinc-500">
            {range.label} · {range.start || "—"} → {range.end || "—"} · {groupedInvoices.length} invoices · {formatMoney(totals.invoice.all.total)}
          </div>
        </div>
      </div>

      <AccountConfigCard />

      <div
        ref={filterBarRef}
        className="sticky top-0 left-0 z-30 -mx-6 px-6 py-2 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto whitespace-nowrap"
        style={{ minHeight: 48 }}
      >
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          className="text-sm px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          title="Period"
        >
          <option value="fy24">{FY_RANGES.fy24.label}</option>
          <option value="fy24_ext">{FY_RANGES.fy24_ext.label}</option>
          <option value="fy25">{FY_RANGES.fy25.label}</option>
          <option value="fy25_ext">{FY_RANGES.fy25_ext.label}</option>
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
              className="text-sm px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              title="Range start"
            />
            <span className="text-xs text-zinc-400">→</span>
            <input
              type="date"
              value={customEndInput}
              onChange={(e) => setCustomEndInput(e.target.value)}
              className="text-sm px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              title="Range end"
            />
          </>
        )}
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="text-sm px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 max-w-[200px]"
          title="Customer"
        >
          <option value="all">All customers ({customerOptions.length})</option>
          {customerOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden">
          {([
            { id: "all", label: "All" },
            { id: "SUB", label: "Sub" },
            { id: "SVC", label: "Svc" },
          ] as { id: TypeFilter; label: string }[]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTypeFilter(opt.id)}
              title={opt.id === "all" ? "Both Subscription and Services" : opt.id === "SUB" ? "Subscription only" : "Services only"}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors",
                typeFilter === opt.id
                  ? "bg-emerald-500 text-white"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden" title="Group by">
          {([
            { id: "customer", label: "By customer" },
            { id: "date", label: "By date" },
          ] as { id: "customer" | "date"; label: string }[]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setGroupByPersist(opt.id)}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors",
                groupBy === opt.id
                  ? "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="text-sm px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-1 min-w-[140px] max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-zinc-500 mr-1">{groupedInvoices.length} invoices</div>
          <button
            onClick={() => setCompactRowsPersist(!compactRows)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border",
              compactRows
                ? "border-emerald-400/60 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
            )}
            title="Compact: one row per invoice line with recognised distribution per month (click a cell to see JEs). Toggle off to see matched JEs as sub-rows."
          >
            {compactRows ? "Compact rows" : "Detail rows"}
          </button>
          <button
            onClick={() => setShowFyTotalsPersist(!showFyTotals)}
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
            onClick={async () => {
              try {
                await syncJes.mutateAsync("journal_entries");
                toast.success("✅ JEs synced from QuickBooks");
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                toast.error(`Sync failed: ${msg}`);
              }
            }}
            disabled={syncJes.isPending}
            className="p-1.5 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950 disabled:opacity-50"
            title="Re-pull all Journal Entries from QuickBooks"
          >
            <RefreshCw size={14} className={syncJes.isPending ? "animate-spin" : ""} />
          </button>
          <ViewMenu
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            showZeroLines={showZeroLines}
            setShowZeroLines={setShowZeroLines}
            recognisedOnly={recognisedOnly}
            setRecognisedOnly={setRecognisedOnly}
            sortDir={sortDir}
            setSortDir={setSortDir}
            onExpandAll={() => {
              const all = new Set<string>();
              for (const g of groupedInvoices) for (const l of g.lines) all.add(`${l.qbo_invoice_id}-${l.qbo_line_id}`);
              setExpanded(all);
            }}
            onCollapseAll={() => setExpanded(new Set())}
            showCustomerCollapseControls={groupBy === "customer"}
            onCollapseAllCustomers={() => {
              setExpandedCustomers(new Set());
              try { localStorage.setItem(EXPANDED_CUSTOMERS_KEY, JSON.stringify([])); } catch { /* ignore */ }
            }}
            onExpandAllCustomers={() => {
              const all = new Set<string>();
              for (const g of groupedInvoices) {
                if (g.header.customer_qbo_id) all.add(g.header.customer_qbo_id);
              }
              for (const id of adjustmentOnlyCustomers) all.add(id);
              setExpandedCustomers(all);
              try { localStorage.setItem(EXPANDED_CUSTOMERS_KEY, JSON.stringify(Array.from(all))); } catch { /* ignore */ }
            }}
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
        <table className="text-xs min-w-full">
          <thead>
            <tr ref={headerRowRef} className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-2 py-2 text-left font-medium relative sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                  style={{ left: lefts.kind, top: filterBarH, width: colWidths.kind, minWidth: 80 }}>
                Kind
                <ResizeHandle onResize={(w) => setColWidth("kind", w)} />
              </th>
              <th className="px-2 py-2 text-left font-medium relative sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                  style={{ left: lefts.doc, top: filterBarH, width: colWidths.doc, minWidth: 80 }}>
                Doc #
                <ResizeHandle onResize={(w) => setColWidth("doc", w)} />
              </th>
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                  style={{ left: lefts.date, top: filterBarH, width: colWidths.date, minWidth: colWidths.date }}>
                Date
              </th>
              <th
                className="px-2 py-2 text-left font-medium relative sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                style={{ left: lefts.customer, top: filterBarH, width: colWidths.customer, minWidth: 80 }}
              >
                Customer
                <ResizeHandle onResize={(w) => setColWidth("customer", w)} />
              </th>
              <th
                className="px-2 py-2 text-left font-medium relative sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                style={{ left: lefts.item, top: filterBarH, width: colWidths.item, minWidth: 80 }}
              >
                Item / Memo
                <ResizeHandle onResize={(w) => setColWidth("item", w)} />
              </th>
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap relative sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                  style={{ left: lefts.period, top: filterBarH, width: colWidths.period, minWidth: 80 }}>
                Period
                <ResizeHandle onResize={(w) => setColWidth("period", w)} />
              </th>
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap sticky bg-zinc-50 dark:bg-zinc-950 z-30"
                  style={{ left: lefts.type, top: filterBarH, width: colWidths.type, minWidth: colWidths.type }}>
                Type
              </th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap sticky bg-zinc-50 dark:bg-zinc-950 z-30 border-r border-zinc-200 dark:border-zinc-800"
                  style={{ left: lefts.net, top: filterBarH, width: colWidths.net, minWidth: colWidths.net }}>
                Net
              </th>
              {gridColumns.map((c) => c.kind === "month" ? (
                <th key={c.m.key} className="px-2 py-2 text-right font-medium whitespace-nowrap min-w-[80px] bg-zinc-50 dark:bg-zinc-950 sticky z-20" style={{ top: filterBarH }}>{c.m.label}</th>
              ) : (
                <th key={`fyt-${c.fy}`} className="px-2 py-2 text-right font-bold whitespace-nowrap min-w-[100px] bg-zinc-100 dark:bg-zinc-900 sticky z-20 border-l-2 border-l-zinc-300 dark:border-l-zinc-700" style={{ top: filterBarH }}>{c.label} TOTAL</th>
              ))}
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap bg-zinc-100 dark:bg-zinc-900 sticky z-20" style={{ top: filterBarH }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {groupedInvoices.length === 0 ? null : (() => {
              // Sticky summary rows pinned just below the column header row.
              // Six rows in total: Invoiced {Both/Sub/Svc} then Recognised
              // {Both/Sub/Svc}. Each cell uses position:sticky with the
              // computed cumulative top so the summary persists while the
              // user scrolls through the invoice/JE rows beneath.
              // Map each Invoiced row to its "problem" bucket — the subset
              // of invoiced amount whose own line doesn't reconcile (no JEs
              // or amounts diverge). Bucketed by the line's invoice month,
              // so highlighting in the Invoiced row is timing-correct
              // (unlike a naive Invoiced-minus-Recognised which would flag
              // the invoice month for all multi-month recognitions).
              const problemByBucket: Record<string, TypedTotals> = {
                "Invoiced · Both":         totals.problem.all,
                "Invoiced · Subscription": totals.problem.sub,
                "Invoiced · Services":     totals.problem.svc,
              };
              const summaryRows: Array<{
                label: string;
                bucket: TypedTotals;
                strong: boolean;
                tone: "invoice" | "je";
              }> = [
                { label: "Invoiced · Both",         bucket: totals.invoice.all, strong: true,  tone: "invoice" },
                { label: "Invoiced · Subscription", bucket: totals.invoice.sub, strong: false, tone: "invoice" },
                { label: "Invoiced · Services",     bucket: totals.invoice.svc, strong: false, tone: "invoice" },
                { label: "Recognised · Both",         bucket: totals.je.all, strong: true,  tone: "je" },
                { label: "Recognised · Subscription", bucket: totals.je.sub, strong: false, tone: "je" },
                { label: "Recognised · Services",     bucket: totals.je.svc, strong: false, tone: "je" },
              ];
              const ROW_H = 26;
              return summaryRows.map((r, i) => {
                const top = filterBarH + headerH + i * ROW_H;
                const problem = problemByBucket[r.label];
                const totalIsProblem = problem != null && Math.abs(problem.total) >= 0.01;
                // Dark-mode bg must be fully opaque: the summary-row label cell
                // is `sticky left-0 z-30` and spans 7 columns, so scrolling
                // month cells (z-20) pass underneath it. A /40 alpha lets
                // their text bleed through the sticky label during horizontal
                // scroll. Light-mode 50-level shades are already opaque.
                const bg = r.tone === "invoice" ? "bg-zinc-50 dark:bg-zinc-950" : "bg-sky-50 dark:bg-sky-950";
                const text = r.tone === "invoice"
                  ? (r.strong ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-500")
                  : (r.strong ? "text-sky-800 dark:text-sky-300" : "text-sky-600 dark:text-sky-500");
                const rowCls = cn(
                  r.strong && "font-medium",
                  r.strong && r.tone === "invoice" && i === 0 && "border-t-2 border-zinc-300 dark:border-zinc-700",
                  r.strong && r.tone === "je" && "border-t border-zinc-300 dark:border-zinc-700",
                );
                // For Invoiced rows, paint a cell rose if any unreconciled
                // invoice line falls in that month/type (i.e. invoiced money
                // that hasn't been turned into JEs yet).
                const monthIsProblem = (k: string): boolean => {
                  if (!problem) return false;
                  const v = problem.byMonth[k];
                  return v != null && Math.abs(v) >= 0.01;
                };
                const cellBgFor = (k: string) => monthIsProblem(k) ? "bg-rose-50 dark:bg-rose-950" : bg;
                const cellTextFor = (k: string) => monthIsProblem(k)
                  ? (r.strong ? "text-rose-800 dark:text-rose-200" : "text-rose-600 dark:text-rose-400")
                  : text;
                return (
                  <tr key={r.label} className={rowCls}>
                    <td
                      colSpan={7}
                      className={cn("px-2 py-1 text-right sticky z-30", bg, text)}
                      style={{ top, left: 0, width: lefts.net, minWidth: lefts.net, maxWidth: lefts.net, height: ROW_H }}
                    >
                      {r.label}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1 text-right tabular-nums sticky z-30 border-r border-zinc-200 dark:border-zinc-800",
                        totalIsProblem ? "bg-rose-50 dark:bg-rose-950" : bg,
                        totalIsProblem
                          ? (r.strong ? "text-rose-800 dark:text-rose-200" : "text-rose-600 dark:text-rose-400")
                          : text,
                      )}
                      style={{ top, left: lefts.net, width: colWidths.net, minWidth: colWidths.net, maxWidth: colWidths.net, height: ROW_H }}
                      title={totalIsProblem ? `Unreconciled invoiced amount: ${formatMoney(problem!.total)}` : undefined}
                    >
                      {formatMoney(r.bucket.total)}
                    </td>
                    {gridColumns.map((c) => {
                      if (c.kind === "month") {
                        const m = c.m;
                        return (
                          <td
                            key={`${r.label}-${m.key}`}
                            className={cn("px-2 py-1 text-right tabular-nums sticky z-20", cellBgFor(m.key), cellTextFor(m.key))}
                            style={{ top, height: ROW_H }}
                            title={monthIsProblem(m.key) ? `Unreconciled invoiced amount: ${formatMoney(problem!.byMonth[m.key])}` : undefined}
                          >
                            {r.bucket.byMonth[m.key] ? formatMoney(r.bucket.byMonth[m.key]) : "—"}
                          </td>
                        );
                      }
                      // FY-total column: sum this row's bucket across the FY's
                      // months. Mark rose if ANY month in the FY has unreconciled
                      // spillover (matches the per-month rose highlighting rule).
                      const fySum = sumByKeys(r.bucket.byMonth, c.monthKeys);
                      const fyHasProblem = problem != null && c.monthKeys.some((k) => {
                        const v = problem.byMonth[k];
                        return v != null && Math.abs(v) >= 0.01;
                      });
                      return (
                        <td
                          key={`${r.label}-fyt-${c.fy}`}
                          className={cn(
                            "px-2 py-1 text-right tabular-nums sticky z-20 border-l-2 border-l-zinc-300 dark:border-l-zinc-700 font-medium",
                            fyHasProblem ? "bg-rose-50 dark:bg-rose-950" : "bg-zinc-100 dark:bg-zinc-900",
                            fyHasProblem ? (r.strong ? "text-rose-800 dark:text-rose-200" : "text-rose-600 dark:text-rose-400") : text,
                          )}
                          style={{ top, height: ROW_H }}
                        >
                          {fySum ? formatMoney(fySum) : "—"}
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        "px-2 py-1 text-right tabular-nums sticky z-20 bg-zinc-100 dark:bg-zinc-900",
                        totalIsProblem ? (r.strong ? "text-rose-800 dark:text-rose-200" : "text-rose-600 dark:text-rose-400") : text,
                      )}
                      style={{ top, height: ROW_H }}
                    >
                      {formatMoney(r.bucket.total)}
                    </td>
                  </tr>
                );
              });
            })()}
            <AdjustmentJeRows
              jes={topBlockAdjustments}
              gridColumns={gridColumns}
              customerNameById={customerNameById}
              colWidths={colWidths}
              lefts={lefts}
              {...(groupBy === "customer" && topBlockAdjustments.length > 0
                ? {
                    headerLabel: `📌 Adjustment JEs · ${topBlockAdjustments.length} orphan · ${formatMoney(topBlockAdjustments.reduce((s, j) => s + Number(j.amount ?? 0), 0))}`,
                    headerSubtitle: "(no customer — pre-cutover migrations, manual adjustments)",
                  }
                : {})}
            />
            {(() => {
              // Debug probe — count lines per invoice going into render to
              // compare against what's visually appearing.
              const summary = groupedInvoices.flatMap((g) => g.lines.map((l) => `${l.doc_number}#${l.qbo_line_id}=${l.amount}`));
              // eslint-disable-next-line no-console
              console.log("[InvoiceRecognition] rendering", summary.length, "lines:", summary);
              return null;
            })()}
            {groupedInvoices.map((g, gi) => {
              const custId = g.header.customer_qbo_id ?? "";
              const prevCustId = gi > 0 ? (groupedInvoices[gi - 1].header.customer_qbo_id ?? "") : null;
              const isCustomerStart = groupBy === "customer" && custId !== prevCustId;
              const custName = custId ? (customerNameById.get(custId) ?? "(unknown)") : "—";
              const isCollapsed = groupBy === "customer" && !expandedCustomers.has(custId);
              // Count invoices for this customer block (for header summary).
              let custInvoiceCount = 0;
              if (isCustomerStart) {
                for (let k = gi; k < groupedInvoices.length; k++) {
                  if ((groupedInvoices[k].header.customer_qbo_id ?? "") !== custId) break;
                  custInvoiceCount++;
                }
              }
              return (
              <Fragment key={g.header.qbo_invoice_id}>
                {isCustomerStart && (
                  <>
                    <tr
                      className="cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                      onClick={() => toggleCustomerExpanded(custId)}
                    >
                      <td
                        colSpan={8 + gridColumns.length + 1}
                        className="sticky left-0 z-20 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/60 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 border-y border-zinc-200 dark:border-zinc-700"
                      >
                        <span className="inline-block w-3 mr-1">{isCollapsed ? "▶" : "▼"}</span>
                        {custName}
                        <span className="ml-2 text-[10px] font-normal normal-case text-zinc-500">
                          {custInvoiceCount} invoice{custInvoiceCount === 1 ? "" : "s"}
                          {(adjustmentsByCustomer.get(custId)?.length ?? 0) > 0 && (
                            <> · {adjustmentsByCustomer.get(custId)!.length} adj</>
                          )}
                        </span>
                      </td>
                    </tr>
                    {(() => {
                      const t = customerTotalsById.get(custId);
                      if (!t) return null;
                      return (
                        <CustomerSummaryRows
                          invoice={t.invoice}
                          je={t.je}
                          gridColumns={gridColumns}
                          colWidths={colWidths}
                          lefts={lefts}
                        />
                      );
                    })()}
                  </>
                )}
                {!isCollapsed && g.lines.map((line, li) => {
                  const key = `${line.qbo_invoice_id}-${line.qbo_line_id}`;
                  const matched = matchPlan.byLineKey.get(key) ?? [];
                  // In Recognised-only mode, drop lines with no JEs entirely
                  // (they'd render an empty fold with no recognised revenue).
                  if (recognisedOnly && matched.length === 0) return null;
                  return (
                    <InvoiceLineRows
                      key={key}
                      line={line}
                      docPrefix={g.header.doc_number ?? ""}
                      customerName={
                        g.header.customer_qbo_id
                          ? customerNameById.get(g.header.customer_qbo_id) ?? "(unknown)"
                          : "—"
                      }
                      gridColumns={gridColumns}
                      matchedJes={matched}
                      allJeByDocNumber={allJeByDocNumber}
                      isFirstLineOfInvoice={li === 0}
                      compactRows={compactRows}
                      isExpanded={!compactRows && (recognisedOnly || expanded.has(key))}
                      onToggle={() => toggleExpand(key)}
                      colWidths={colWidths}
                      lefts={lefts}
                      accountConfig={accountConfig ?? null}
                      accountNameById={accountNameById}
                      onJeContextMenu={openJeMenu}
                      recognisedOnly={recognisedOnly}
                      matcherReady={matcherReady}
                    />
                  );
                })}
                {!isCollapsed && (() => {
                  const nextCustId = gi < groupedInvoices.length - 1
                    ? (groupedInvoices[gi + 1].header.customer_qbo_id ?? "")
                    : null;
                  const isLastInvoiceForCustomer =
                    groupBy === "customer" && (nextCustId === null || nextCustId !== custId);
                  if (!isLastInvoiceForCustomer) return null;
                  const adjs = custId ? adjustmentsByCustomer.get(custId) ?? [] : [];
                  if (adjs.length === 0) return null;
                  const total = adjs.reduce((s, j) => s + Number(j.amount ?? 0), 0);
                  return (
                    <AdjustmentJeRows
                      jes={adjs}
                      gridColumns={gridColumns}
                      customerNameById={customerNameById}
                      colWidths={colWidths}
                      lefts={lefts}
                      headerLabel={`📌 ${adjs.length} adjustment JE${adjs.length === 1 ? "" : "s"} · ${formatMoney(total)}`}
                      headerSubtitle=""
                    />
                  );
                })()}
                {!isCollapsed && gi < groupedInvoices.length - 1 && (() => {
                  const nextCustId = groupedInvoices[gi + 1].header.customer_qbo_id ?? "";
                  const nextStartsCustomer = groupBy === "customer" && nextCustId !== custId;
                  if (nextStartsCustomer) return null;
                  return <tr><td colSpan={8 + gridColumns.length + 1} className="h-px bg-zinc-200 dark:bg-zinc-800 p-0" /></tr>;
                })()}
              </Fragment>
              );
            })}
            {/* Adjustment-only customers (have adjustments but no invoices in
                view) — surfaced at the end so they aren't silently dropped. */}
            {groupBy === "customer" && adjustmentOnlyCustomers.map((custId) => {
              const adjs = adjustmentsByCustomer.get(custId) ?? [];
              const custName = customerNameById.get(custId) ?? "(unknown)";
              const total = adjs.reduce((s, j) => s + Number(j.amount ?? 0), 0);
              const isCollapsed = !expandedCustomers.has(custId);
              return (
                <Fragment key={`adj-only-${custId}`}>
                  <tr
                    className="cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                    onClick={() => toggleCustomerExpanded(custId)}
                  >
                    <td
                      colSpan={8 + gridColumns.length + 1}
                      className="sticky left-0 z-20 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/60 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 border-y border-zinc-200 dark:border-zinc-700"
                    >
                      <span className="inline-block w-3 mr-1">{isCollapsed ? "▶" : "▼"}</span>
                      {custName}
                      <span className="ml-2 text-[10px] font-normal normal-case text-zinc-500">
                        {adjs.length} adj · {formatMoney(total)} (adjustments only)
                      </span>
                    </td>
                  </tr>
                  {(() => {
                    const t = customerTotalsById.get(custId);
                    if (!t) return null;
                    return (
                      <CustomerSummaryRows
                        invoice={t.invoice}
                        je={t.je}
                        gridColumns={gridColumns}
                        colWidths={colWidths}
                        lefts={lefts}
                      />
                    );
                  })()}
                  {!isCollapsed && (
                    <AdjustmentJeRows
                      jes={adjs}
                      gridColumns={gridColumns}
                      customerNameById={customerNameById}
                      colWidths={colWidths}
                      lefts={lefts}
                      headerLabel={`📌 ${adjs.length} adjustment JE${adjs.length === 1 ? "" : "s"} · ${formatMoney(total)}`}
                      headerSubtitle=""
                    />
                  )}
                </Fragment>
              );
            })}
            {groupedInvoices.length === 0 && adjustmentOnlyCustomers.length === 0 && topBlockAdjustments.length === 0 && (
              <tr><td colSpan={8 + gridColumns.length + 1} className="px-3 py-6 text-center text-zinc-500">No invoices match the filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <UnmatchedJesPanel
        jes={matchPlan.unmatched}
        ignored={matchPlan.ignored}
        groups={allGroupedInvoices}
        customerNameById={customerNameById}
        accountConfig={accountConfig ?? null}
        defaultDateFrom={range.start}
        defaultDateTo={range.end}
        onJeContextMenu={openJeMenu}
      />

      {jeMenu && (
        <JeAssignMenu
          x={jeMenu.x}
          y={jeMenu.y}
          je={jeMenu.je}
          groups={allGroupedInvoices}
          customerNameById={customerNameById}
          onClose={() => setJeMenu(null)}
        />
      )}
      </div>
    </div>
  );
}

// ─── Unmatched JEs panel ──────────────────────────────────────────────────
//
// Shows JEs that the auto-matcher couldn't attribute to any visible invoice
// line. Each row has an "Assign to invoice line…" picker that writes a manual
// override (which then takes precedence on the next render).

// ─── Inline-editable JE doc# ──────────────────────────────────────────────
//
// Click the doc# to edit. Save POSTs to QBO via qbo-update-je-docnumber,
// which fetches the current JE, replaces it with the new DocNumber, and
// mirrors the result back into qbo_journal_entries. Only the DocNumber
// changes — Lines, accounts, amounts, etc. are preserved verbatim.

function JeDocNumberCell({ je }: { je: ParsedRecognitionJe }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(je.doc_number);
  const update = useUpdateJeDocNumber();

  function save() {
    const next = draft.trim();
    if (!next || next === je.doc_number) {
      setEditing(false);
      setDraft(je.doc_number);
      return;
    }
    update.mutate(
      { qbo_id: je.qbo_id, doc_number: next },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(`✅ Renamed JE in QBO to ${res.doc_number} (id ${res.qbo_id})`);
            setEditing(false);
          } else {
            toast.error(`❌ QBO rejected rename: ${res.error ?? "unknown error"}`);
          }
        },
        onError: (err) => toast.error(`Failed to call QBO: ${err.message}`),
      },
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(je.doc_number); setEditing(true); }}
        className="text-left hover:text-sky-600 dark:hover:text-sky-400 hover:underline decoration-dotted underline-offset-2"
        title="Click to rename this JE in QBO"
      >
        {je.doc_number}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={draft}
        disabled={update.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setEditing(false); setDraft(je.doc_number); }
        }}
        className="font-mono text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-32"
      />
      <button
        onClick={save}
        disabled={update.isPending}
        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Save and update QBO"
      >
        {update.isPending ? "…" : "Save"}
      </button>
      <button
        onClick={() => { setEditing(false); setDraft(je.doc_number); }}
        disabled={update.isPending}
        className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900"
      >
        ✕
      </button>
    </span>
  );
}

// ─── Inline-editable JE txn_date ──────────────────────────────────────────
//
// Click the date to shift this JE to a different day. Useful when a
// recognition JE landed in the wrong calendar month.

function JeTxnDateCell({ je, display = "date" }: { je: ParsedRecognitionJe; display?: "date" | "month" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(je.txn_date);
  const update = useUpdateJeTxnDate();

  function save() {
    const next = draft.trim();
    if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next) || next === je.txn_date) {
      setEditing(false);
      setDraft(je.txn_date);
      return;
    }
    update.mutate(
      { qbo_id: je.qbo_id, txn_date: next },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(`✅ Moved JE ${je.doc_number} to ${res.txn_date}`);
            setEditing(false);
          } else {
            toast.error(`❌ QBO rejected date change: ${res.error ?? "unknown error"}`);
          }
        },
        onError: (err) => toast.error(`Failed to call QBO: ${err.message}`),
      },
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(je.txn_date); setEditing(true); }}
        className="text-left hover:text-sky-600 dark:hover:text-sky-400 hover:underline decoration-dotted underline-offset-2"
        title="Click to change this JE's TxnDate in QBO"
      >
        {display === "month" ? formatJeMonth(je.txn_date) : formatDate(je.txn_date)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        type="date"
        value={draft}
        disabled={update.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setEditing(false); setDraft(je.txn_date); }
        }}
        className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      />
      <button
        onClick={save}
        disabled={update.isPending}
        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Save and update QBO TxnDate"
      >
        {update.isPending ? "…" : "Save"}
      </button>
      <button
        onClick={() => { setEditing(false); setDraft(je.txn_date); }}
        disabled={update.isPending}
        className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900"
      >
        ✕
      </button>
    </span>
  );
}

// ─── Inline-editable JE amount ────────────────────────────────────────────
//
// Click the amount to edit. Save POSTs to QBO via qbo-update-je-amount,
// which fetches the current JE, replaces both posting lines (DR + CR) with
// the new amount, and mirrors the result back. Useful when a JE drifted a
// few cents off the invoice line and shows up as variance.

function JeAmountCell({ je }: { je: ParsedRecognitionJe }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(je.amount));
  const update = useUpdateJeAmount();

  function save() {
    const next = Number(draft);
    if (!Number.isFinite(next) || next <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    if (Math.abs(next - je.amount) < 0.005) {
      setEditing(false);
      return;
    }
    update.mutate(
      { qbo_id: je.qbo_id, amount: next },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(`✅ Updated JE ${je.doc_number} amount to ${formatMoney(res.amount ?? next)} in QBO`);
            setEditing(false);
          } else {
            toast.error(`❌ QBO rejected amount edit: ${res.error ?? "unknown error"}`);
          }
        },
        onError: (err) => toast.error(`Failed to call QBO: ${err.message}`),
      },
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(je.amount)); setEditing(true); }}
        className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline decoration-dotted underline-offset-2 tabular-nums"
        title="Click to edit this JE's amount in QBO"
      >
        {formatMoney(je.amount)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 justify-end">
      <input
        autoFocus
        type="number"
        step="0.01"
        min="0"
        value={draft}
        disabled={update.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setEditing(false); setDraft(String(je.amount)); }
        }}
        className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-24 text-right tabular-nums"
      />
      <button
        onClick={save}
        disabled={update.isPending}
        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Save and update QBO"
      >
        {update.isPending ? "…" : "Save"}
      </button>
      <button
        onClick={() => { setEditing(false); setDraft(String(je.amount)); }}
        disabled={update.isPending}
        className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900"
      >
        ✕
      </button>
    </span>
  );
}

// ─── Inline JE delete button ──────────────────────────────────────────────
//
// Soft-deletes the JE in QBO (QBO delete is really status=Deleted) and drops
// the row from the local mirror. After delete, the invoice line reverts to
// the "needs recognition" state so the Generate flow can recreate it.

function JeDeleteButton({ je }: { je: ParsedRecognitionJe }) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteJe();

  function doDelete() {
    del.mutate(
      { qbo_id: je.qbo_id },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(`🗑️ Deleted JE ${je.doc_number} in QBO`);
          } else {
            toast.error(`❌ QBO rejected delete: ${res.error ?? "unknown error"}`);
          }
          setConfirming(false);
        },
        onError: (err) => {
          toast.error(`Failed to call QBO: ${err.message}`);
          setConfirming(false);
        },
      },
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={doDelete}
          disabled={del.isPending}
          className="text-[10px] px-1.5 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          title="Confirm delete in QBO"
        >
          {del.isPending ? "…" : "Delete?"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={del.isPending}
          className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-0.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
      title={`Delete JE ${je.doc_number} in QBO`}
    >
      <Trash2 size={12} />
    </button>
  );
}

// ─── Right-click "assign JE → invoice line" floating menu ─────────────────
//
// Rendered to document.body via portal so it escapes any sticky/overflow
// containers. Closes on outside click, Escape, or successful assign.

function JeAssignMenu({
  x,
  y,
  je,
  groups,
  customerNameById,
  onClose,
}: {
  x: number;
  y: number;
  je: ParsedRecognitionJe;
  groups: { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }[];
  customerNameById: Map<string, string>;
  onClose: () => void;
}) {
  const upsert = useUpsertJeOverride();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp menu to viewport — don't overflow right/bottom edges.
  const MENU_W = 380;
  const MENU_H = 420;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - MENU_H - 8);

  const allLines = useMemo(() => {
    const same: { line: InvoiceLineWithRecognition; sameCustomer: boolean }[] = [];
    const other: { line: InvoiceLineWithRecognition; sameCustomer: boolean }[] = [];
    for (const g of groups) {
      for (const l of g.lines) {
        const same_ = g.header.customer_qbo_id === je.customer_qbo_id;
        (same_ ? same : other).push({ line: l, sameCustomer: same_ });
      }
    }
    return [...same, ...other];
  }, [groups, je.customer_qbo_id]);

  const filtered = useMemo(() => {
    if (!q.trim()) return allLines.slice(0, 80);
    const needle = q.toLowerCase();
    return allLines.filter(({ line }) => {
      const cust = line.customer_qbo_id ? customerNameById.get(line.customer_qbo_id) ?? "" : "";
      const hay = `${line.doc_number ?? ""} ${cust} ${line.item_ref ?? ""} ${line.description ?? ""} ${line.amount ?? ""}`.toLowerCase();
      return hay.includes(needle);
    }).slice(0, 80);
  }, [allLines, q, customerNameById]);

  function pick(line: InvoiceLineWithRecognition) {
    upsert.mutate(
      { qbo_je_id: je.qbo_id, qbo_invoice_id: line.qbo_invoice_id, qbo_line_id: line.qbo_line_id },
      { onSuccess: onClose },
    );
  }
  function markIgnore() {
    upsert.mutate(
      { qbo_je_id: je.qbo_id, qbo_invoice_id: null, qbo_line_id: null, notes: "IGNORE" },
      { onSuccess: onClose },
    );
  }
  function unassign() {
    // Force the JE out of any match (even strong auto-match) by writing a
    // null override with notes='UNASSIGN'. The matcher sees this and skips
    // passes 2/3, so the JE surfaces in Unmatched JEs for reassignment.
    upsert.mutate(
      { qbo_je_id: je.qbo_id, qbo_invoice_id: null, qbo_line_id: null, notes: "UNASSIGN" },
      { onSuccess: onClose },
    );
  }

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl"
      style={{ left, top, width: MENU_W, maxHeight: MENU_H }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <div className="text-[11px] text-zinc-500">Assign JE to invoice line</div>
        <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
          {je.doc_number} · {formatDate(je.txn_date)} · {formatMoney(je.amount)}
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {je.customer_qbo_id ? customerNameById.get(je.customer_qbo_id) ?? je.customer_name ?? "(unknown)" : je.customer_name ?? "—"}
        </div>
      </div>
      <div className="px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search doc#, customer, item, amount…"
          className="w-full text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: MENU_H - 130 }}>
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-500 italic">No invoice lines match.</div>
        )}
        {filtered.map(({ line, sameCustomer }) => {
          const cust = line.customer_qbo_id ? customerNameById.get(line.customer_qbo_id) ?? "?" : "—";
          return (
            <button
              key={`${line.qbo_invoice_id}-${line.qbo_line_id}`}
              onClick={() => pick(line)}
              disabled={upsert.isPending}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-900 flex items-center gap-2"
            >
              <span className={cn(
                "text-[9px] px-1 py-0.5 rounded font-medium shrink-0",
                sameCustomer
                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
              )}>
                {sameCustomer ? "same cust" : "other"}
              </span>
              <span className="font-mono text-zinc-700 dark:text-zinc-300 shrink-0">{line.doc_number}</span>
              <span className="text-zinc-500 truncate">{cust}</span>
              <span className="text-zinc-500 truncate">· {line.item_ref ?? "(no item)"}</span>
              <span className="ml-auto tabular-nums text-zinc-700 dark:text-zinc-300 shrink-0">{formatMoney(line.amount)}</span>
            </button>
          );
        })}
      </div>
      <div className="px-2 py-1.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <button
          onClick={unassign}
          disabled={upsert.isPending}
          className="text-[11px] px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          title="Force this JE off its current invoice line. It will show up in Unmatched JEs for you to reassign."
        >
          {upsert.isPending ? "…" : "Unassign"}
        </button>
        <button
          onClick={markIgnore}
          disabled={upsert.isPending}
          className="text-[11px] px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          title="Suppress this JE from auto-match entirely. It won't appear in Unmatched JEs."
        >
          Mark as ignore
        </button>
        <button
          onClick={onClose}
          className="text-[11px] px-2 py-1 rounded text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 ml-auto"
        >
          Cancel
        </button>
        {upsert.isError && (
          <span className="text-[11px] text-rose-600 dark:text-rose-400 truncate">
            {String(upsert.error?.message ?? upsert.error).slice(0, 60)}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Derive SUB/SVC/OTHER from a JE's debit account by matching against the
// configured deferred-revenue accounts. Recognition JEs always post
// `DR Deferred / CR Revenue`, so the DR account is the source of truth even
// when the memo doesn't follow the convention.
function deriveJeType(
  je: ParsedRecognitionJe,
  accountConfig: FyAccountConfig | null,
): "SUB" | "SVC" | "OTHER" | null {
  if (je.type) return je.type; // memo already told us
  if (!accountConfig || !je.dr_account_qbo_id) return null;
  if (je.dr_account_qbo_id === accountConfig.deferred_sub_account_qbo_id) return "SUB";
  if (je.dr_account_qbo_id === accountConfig.deferred_svc_account_qbo_id) return "SVC";
  if (je.dr_account_qbo_id === accountConfig.deferred_other_account_qbo_id) return "OTHER";
  return null;
}

// ─── Adjustment JE rows (top of main table) ───────────────────────────────
//
// Renders standalone adjustment JEs as rows in the main timeline grid, so
// their amounts land in the right monthly column and visually integrate with
// the rest of the Recognised flow. Collapsible via a single section header
// row; each row carries an "Un-accept" button that removes the override.

function AdjustmentRow({
  je,
  customerNameById,
  gridColumns,
  colWidths,
  lefts,
}: {
  je: ParsedRecognitionJe;
  customerNameById: Map<string, string>;
  gridColumns: GridCol[];
  colWidths: Record<ColId, number>;
  lefts: Record<ColId, number>;
}) {
  const del = useDeleteJeOverride();
  const rowBg = "bg-violet-50 dark:bg-violet-950/30";
  const customerLabel = je.customer_qbo_id
    ? customerNameById.get(je.customer_qbo_id) ?? je.customer_name ?? "(unknown)"
    : je.customer_name ?? "—";
  const jeMonth = monthKeyOf(je.txn_date);
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-900">
      <td className={`${stickyCls("kind", rowBg)} px-2 py-1.5`} style={stickyStyle("kind", colWidths, lefts)}>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-xs w-3 inline-block leading-none" />
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-violet-200 dark:bg-violet-900 text-violet-800 dark:text-violet-200">
            📌 ADJ
          </span>
        </div>
      </td>
      <td className={`${stickyCls("doc", rowBg)} px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300`} style={stickyStyle("doc", colWidths, lefts)}>
        <div>
          <JeDocNumberCell je={je} />
        </div>
        {/* Invisible spacer matches the PaymentBadge below invoice doc#s
            so adjustment rows render at the same height as invoice rows. */}
        <span className="text-[10px] px-1.5 py-0.5 rounded inline-block invisible">spacer</span>
      </td>
      <td className={`${stickyCls("date", rowBg)} px-2 py-1.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap`} style={stickyStyle("date", colWidths, lefts)}>
        <JeTxnDateCell je={je} />
      </td>
      <td className={`${stickyCls("customer", rowBg)} px-2 py-1.5 text-zinc-600 dark:text-zinc-400`} style={stickyStyle("customer", colWidths, lefts)}>
        <div className="truncate" title={customerLabel}>{customerLabel}</div>
      </td>
      <td className={`${stickyCls("item", rowBg)} px-2 py-1.5 text-zinc-500`} style={stickyStyle("item", colWidths, lefts)}>
        <div className="truncate" title={je.description ?? ""}>
          {je.description ?? "Adjustment (no invoice partner)"}
        </div>
      </td>
      <td className={`${stickyCls("period", rowBg)} px-2 py-1.5 text-zinc-500 whitespace-nowrap`} style={stickyStyle("period", colWidths, lefts)}>
        <JeTxnDateCell je={je} display="month" />
      </td>
      <td className={`${stickyCls("type", rowBg)} px-2 py-1.5`} style={stickyStyle("type", colWidths, lefts)}>
        <TypePill type={je.type ?? "OTHER"} muted={!je.type} />
      </td>
      <td className={`${stickyCls("net", rowBg + " border-r border-zinc-200 dark:border-zinc-800")} px-2 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300`} style={stickyStyle("net", colWidths, lefts)}>
        <span className="inline-flex items-center gap-1.5 justify-end">
          <button
            onClick={() => del.mutate(je.qbo_id)}
            disabled={del.isPending}
            className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
            title="Un-accept — JE returns to Unmatched."
          >
            ↶
          </button>
          <JeAmountCell je={je} />
        </span>
      </td>
      {gridColumns.map((c) => {
        if (c.kind === "month") {
          const m = c.m;
          return (
            <td key={m.key} className={cn(
              "px-2 py-1.5 text-right tabular-nums",
              jeMonth === m.key
                ? "bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 font-medium"
                : "text-zinc-300 dark:text-zinc-700",
            )}>
              {jeMonth === m.key ? formatMoney(je.amount) : "—"}
            </td>
          );
        }
        // FY-total column: an adjustment JE lives in exactly one month, so the
        // FY cell shows its amount when that month falls inside the FY,
        // matching how the month cell renders.
        const inFy = jeMonth != null && c.monthKeys.includes(jeMonth);
        return (
          <td key={`fyt-${c.fy}`} className={cn(
            "px-2 py-1.5 text-right tabular-nums border-l-2 border-l-zinc-300 dark:border-l-zinc-700 font-medium bg-zinc-100 dark:bg-zinc-900",
            inFy ? "text-violet-800 dark:text-violet-300" : "text-zinc-300 dark:text-zinc-700",
          )}>
            {inFy ? formatMoney(je.amount) : "—"}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-right tabular-nums bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300">
        {formatMoney(je.amount)}
      </td>
    </tr>
  );
}

function AdjustmentJeRows({
  jes,
  gridColumns,
  customerNameById,
  colWidths,
  lefts,
  headerLabel,
  headerSubtitle,
}: {
  jes: ParsedRecognitionJe[];
  gridColumns: GridCol[];
  customerNameById: Map<string, string>;
  colWidths: Record<ColId, number>;
  lefts: Record<ColId, number>;
  headerLabel?: string;
  headerSubtitle?: string;
}) {
  const [open, setOpen] = useState(true);
  if (jes.length === 0) return null;
  const total = jes.reduce((s, j) => s + Number(j.amount ?? 0), 0);
  const label = headerLabel ?? `📌 Adjustment JEs · ${jes.length} standalone · ${formatMoney(total)} counted toward Recognised`;
  const subtitle = headerSubtitle ?? "(no invoice partner — pre-cutover migrations, manual adjustments)";

  return (
    <Fragment>
      <tr
        className="border-b border-violet-200 dark:border-violet-900 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td
          colSpan={8}
          className="px-2 py-1.5 bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 font-medium text-xs sticky"
          style={{ left: 0, zIndex: 10 }}
        >
          <span className="text-xs w-3 inline-block leading-none mr-1">{open ? "▼" : "▶"}</span>
          {label}
          {subtitle && (
            <span className="ml-3 text-[10px] text-violet-600 dark:text-violet-400 italic font-normal">
              {subtitle}
            </span>
          )}
        </td>
        {gridColumns.map((c) => (
          <td key={c.kind === "month" ? c.m.key : `fyt-${c.fy}`} className={cn(
            "bg-violet-100 dark:bg-violet-950/60",
            c.kind === "fyTotal" && "border-l-2 border-l-violet-300 dark:border-l-violet-800",
          )} />
        ))}
        <td className="bg-violet-100 dark:bg-violet-950/60" />
      </tr>

      {open && jes.map((je) => (
        <AdjustmentRow
          key={je.qbo_id}
          je={je}
          customerNameById={customerNameById}
          gridColumns={gridColumns}
          colWidths={colWidths}
          lefts={lefts}
        />
      ))}

      {open && jes.length > 0 && (
        <tr><td colSpan={8 + gridColumns.length + 1} className="h-px bg-zinc-200 dark:bg-zinc-800 p-0" /></tr>
      )}
    </Fragment>
  );
}

function UnmatchedJesPanel({
  jes,
  ignored,
  groups,
  customerNameById,
  accountConfig,
  defaultDateFrom,
  defaultDateTo,
  onJeContextMenu,
}: {
  jes: ParsedRecognitionJe[];
  ignored: ParsedRecognitionJe[];
  groups: { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }[];
  customerNameById: Map<string, string>;
  accountConfig: FyAccountConfig | null;
  defaultDateFrom: string;
  defaultDateTo: string;
  onJeContextMenu: (e: React.MouseEvent, je: ParsedRecognitionJe) => void;
}) {
  // Default collapsed since this list can run into hundreds.
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "SUB" | "SVC" | "OTHER" | "unknown">("all");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");
  // Date range follows the page-level Period filter by default. Re-syncs when
  // that range changes (user picks a different FY) — users can still type in
  // these inputs to override locally until the next page-period change.
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  useEffect(() => { setDateFrom(defaultDateFrom); }, [defaultDateFrom]);
  useEffect(() => { setDateTo(defaultDateTo); }, [defaultDateTo]);

  // Distinct customers found in the unmatched pool — drives the dropdown.
  const customerOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const je of jes) {
      if (je.customer_qbo_id) ids.add(je.customer_qbo_id);
    }
    return Array.from(ids)
      .map((id) => ({ id, name: customerNameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jes, customerNameById]);

  const filtered = useMemo(() => {
    const min = amtMin.trim() === "" ? null : Number(amtMin);
    const max = amtMax.trim() === "" ? null : Number(amtMax);
    return jes.filter((je) => {
      if (customerFilter !== "all" && je.customer_qbo_id !== customerFilter) return false;
      if (typeFilter !== "all") {
        const t = deriveJeType(je, accountConfig);
        if (typeFilter === "unknown") {
          if (t !== null) return false;
        } else if (t !== typeFilter) {
          return false;
        }
      }
      const amt = Number(je.amount ?? 0);
      if (min !== null && !Number.isNaN(min) && amt < min) return false;
      if (max !== null && !Number.isNaN(max) && amt > max) return false;
      if (dateFrom && je.txn_date < dateFrom) return false;
      if (dateTo && je.txn_date > dateTo) return false;
      if (search.trim()) {
        const needle = search.toLowerCase();
        const cust = je.customer_qbo_id ? customerNameById.get(je.customer_qbo_id) ?? "" : (je.customer_name ?? "");
        const amtStr = String(je.amount ?? "");
        const amtNum = Number(je.amount ?? 0);
        const numericNeedle = Number(needle.replace(/[$,]/g, ""));
        const amtMatch = !Number.isNaN(numericNeedle) && Math.abs(amtNum - numericNeedle) < 1;
        const hay = `${je.doc_number} ${cust} ${amtStr}`.toLowerCase();
        if (!hay.includes(needle) && !amtMatch) return false;
      }
      return true;
    });
  }, [jes, search, customerFilter, typeFilter, amtMin, amtMax, dateFrom, dateTo, accountConfig, customerNameById]);

  if (jes.length === 0 && ignored.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 flex items-center gap-3 hover:bg-amber-100/60 dark:hover:bg-amber-950/60 text-left"
      >
        <span className="text-zinc-500 text-xs w-3 inline-block leading-none">{open ? "▼" : "▶"}</span>
        <span className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">Unmatched JEs</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {jes.length} not attributed{ignored.length > 0 ? ` · ${ignored.length} marked ignore` : ""}
        </span>
        <span className="text-xs text-zinc-500 ml-auto">
          Assign each JE to the invoice line it belongs to, or mark as ignore to skip from auto-match.
        </span>
      </button>
      {open && jes.length > 0 && (
        <>
          <div className="px-3 py-2 bg-amber-50/40 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-950 flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search JE doc#, customer, amount…"
              className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-72"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Customer</label>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 max-w-[260px]"
              >
                <option value="all">All ({customerOptions.length})</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              >
                <option value="all">All</option>
                <option value="SUB">SUB</option>
                <option value="SVC">SVC</option>
                <option value="OTHER">OTHER</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-500">Amount</label>
              <input
                type="number"
                inputMode="decimal"
                value={amtMin}
                onChange={(e) => setAmtMin(e.target.value)}
                placeholder="min"
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-20 tabular-nums"
              />
              <span className="text-xs text-zinc-400">–</span>
              <input
                type="number"
                inputMode="decimal"
                value={amtMax}
                onChange={(e) => setAmtMax(e.target.value)}
                placeholder="max"
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-20 tabular-nums"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-500">Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                title="JE posting date — from"
              />
              <span className="text-xs text-zinc-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                title="JE posting date — to"
              />
            </div>
            {(search || customerFilter !== "all" || typeFilter !== "all" || amtMin || amtMax || dateFrom !== defaultDateFrom || dateTo !== defaultDateTo) && (
              <button
                onClick={() => {
                  setSearch(""); setCustomerFilter("all"); setTypeFilter("all");
                  setAmtMin(""); setAmtMax("");
                  setDateFrom(defaultDateFrom); setDateTo(defaultDateTo);
                }}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-zinc-500 ml-auto">
              Showing {filtered.length} of {jes.length}
            </span>
          </div>
          <table className="text-xs min-w-full">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-2 py-2 text-left font-medium">JE doc#</th>
                <th className="px-2 py-2 text-left font-medium">Date</th>
                <th className="px-2 py-2 text-left font-medium">Customer</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Why unmatched?</th>
                <th className="px-2 py-2 text-left font-medium">Assign to invoice line</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((je) => (
                <UnmatchedJeRow
                  key={je.qbo_id}
                  je={je}
                  groups={groups}
                  customerNameById={customerNameById}
                  derivedType={deriveJeType(je, accountConfig)}
                  onJeContextMenu={onJeContextMenu}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500 italic">
                    No unmatched JEs match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function UnmatchedJeRow({
  je,
  groups,
  customerNameById,
  derivedType,
  onJeContextMenu,
}: {
  je: ParsedRecognitionJe;
  groups: { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }[];
  customerNameById: Map<string, string>;
  derivedType: "SUB" | "SVC" | "OTHER" | null;
  onJeContextMenu: (e: React.MouseEvent, je: ParsedRecognitionJe) => void;
}) {
  const upsert = useUpsertJeOverride();
  const customerLabel = je.customer_qbo_id
    ? customerNameById.get(je.customer_qbo_id) ?? je.customer_name ?? "(unknown)"
    : je.customer_name ?? "—";

  // Candidate lines: same customer first, then everything else.
  const sameCustGroups = groups.filter((g) => g.header.customer_qbo_id === je.customer_qbo_id);
  const otherGroups = groups.filter((g) => g.header.customer_qbo_id !== je.customer_qbo_id);

  function reason(): string {
    const bits: string[] = [];
    if (!je.prefix) bits.push("memo doesn't match recognition pattern");
    if (je.customer_qbo_id == null) bits.push("no customer ref on JE");
    if (bits.length === 0) bits.push("no invoice line in current view fits prefix + customer + window");
    return bits.join(" · ");
  }

  function pickLine(value: string) {
    if (value === "") return;
    if (value === "ignore") {
      upsert.mutate({ qbo_je_id: je.qbo_id, qbo_invoice_id: null, qbo_line_id: null, notes: "IGNORE" });
      return;
    }
    if (value === "standalone") {
      // Accept as adjustment — JE counts toward Recognised totals but has no
      // invoice partner (typically pre-cutover invoice that was migrated as
      // aggregate so the line isn't in the current dataset).
      upsert.mutate({ qbo_je_id: je.qbo_id, qbo_invoice_id: null, qbo_line_id: null, notes: "STANDALONE" });
      return;
    }
    const [qbo_invoice_id, qbo_line_id] = value.split("|");
    upsert.mutate({ qbo_je_id: je.qbo_id, qbo_invoice_id, qbo_line_id });
  }

  return (
    <tr
      className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-950"
      onContextMenu={(e) => onJeContextMenu(e, je)}
      title="Right-click to assign to invoice line"
    >
      <td className="px-2 py-1.5 font-mono text-zinc-800 dark:text-zinc-200">
        <JeDocNumberCell je={je} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(je.txn_date)}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">{customerLabel}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        <span className="inline-flex items-center gap-1.5 justify-end">
          <JeDeleteButton je={je} />
          {formatMoney(je.amount)}
        </span>
      </td>
      <td className="px-2 py-1.5">
        {derivedType ? (
          <span className="inline-flex items-center gap-1">
            <TypePill type={derivedType} muted={!je.type} />
            {!je.type && (
              <span className="text-[9px] text-zinc-400" title="Type derived from the JE's debit account, since the memo doesn't follow the convention.">
                from acct
              </span>
            )}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400 italic" title="Could not derive type — DR account doesn't match any of the configured deferred accounts.">
            unknown
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-zinc-500 italic">{reason()}</td>
      <td className="px-2 py-1.5">
        <select
          defaultValue=""
          onChange={(e) => pickLine(e.target.value)}
          disabled={upsert.isPending}
          className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 max-w-[28ch]"
        >
          <option value="">— assign to line —</option>
          <option value="standalone">📌 Accept as adjustment (counts toward Recognised)</option>
          <option value="ignore">Mark as ignore (skip from matcher)</option>
          {sameCustGroups.length > 0 && (
            <optgroup label="Same customer">
              {sameCustGroups.flatMap((g) => g.lines).map((l) => (
                <option key={`${l.qbo_invoice_id}-${l.qbo_line_id}`} value={`${l.qbo_invoice_id}|${l.qbo_line_id}`}>
                  {l.doc_number} · {l.item_ref ?? "(no item)"} · {formatMoney(l.amount)}
                </option>
              ))}
            </optgroup>
          )}
          {otherGroups.length > 0 && (
            <optgroup label="Other customers">
              {otherGroups.flatMap((g) => g.lines).map((l) => (
                <option key={`${l.qbo_invoice_id}-${l.qbo_line_id}`} value={`${l.qbo_invoice_id}|${l.qbo_line_id}`}>
                  {l.doc_number} · {customerNameById.get(l.customer_qbo_id ?? "") ?? "?"} · {l.item_ref ?? "(no item)"} · {formatMoney(l.amount)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </td>
    </tr>
  );
}

function InvoiceLineRows({
  line,
  docPrefix,
  customerName,
  gridColumns,
  matchedJes,
  allJeByDocNumber,
  isFirstLineOfInvoice,
  compactRows,
  isExpanded,
  onToggle,
  colWidths,
  lefts,
  accountConfig,
  accountNameById,
  onJeContextMenu,
  recognisedOnly,
  matcherReady,
}: {
  line: InvoiceLineWithRecognition;
  docPrefix: string;
  customerName: string;
  gridColumns: GridCol[];
  matchedJes: ParsedRecognitionJe[];
  // Map of every QBO JE doc# → JE (across all customers/lines) so the
  // Generate modal can detect doc# collisions before pushing.
  allJeByDocNumber: Map<string, ParsedRecognitionJe>;
  isFirstLineOfInvoice: boolean;
  // Compact mode: main row month cells show recognised distribution (sum of
  // matched JE amounts per month) instead of invoice amount in txn month.
  // Parent forces isExpanded=false when compact, so JE sub-rows don't render.
  compactRows: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  colWidths: Record<ColId, number>;
  lefts: Record<ColId, number>;
  accountConfig: FyAccountConfig | null;
  accountNameById: Map<string, string>;
  onJeContextMenu: (e: React.MouseEvent, je: ParsedRecognitionJe) => void;
  // When true, the invoice header row is hidden — only JE rows and the
  // variance/action row render. Rows are force-expanded so JEs are visible.
  recognisedOnly: boolean;
  // True once both JE and override queries have settled at least once. The
  // auto-revoke-when-0-matched effect checks this to avoid firing during the
  // initial load window (when matched=0 for every row).
  matcherReady: boolean;
}) {
  // Stored "OTHER" is the default `upsertInvoiceLineRecognition` sets when no
  // line_type is passed — it's effectively "unset", not an explicit choice.
  // So: an explicit stored SUB/SVC wins, stored OTHER defers to the classifier
  // (so QBO item changes propagate without needing to clear the override).
  const classifiedType = classifyLineType(line.item_ref);
  const effectiveType = line.line_type && line.line_type !== "OTHER"
    ? line.line_type
    : classifiedType;
  const invoiceMonth = monthKeyOf(line.txn_date);
  const window = useMemo(() => inferRecognitionWindow(line), [line]);
  const reviewMut = useReviewInvoiceLine();
  const unreviewMut = useUnreviewInvoiceLine();
  const syncInvoice = useSyncInvoice();
  const deleteInvoice = useDeleteInvoice();
  const updateTxnDate = useUpdateJeTxnDate();
  const adjustmentMut = useSetInvoiceLineAdjustment();
  const isReviewed = line.is_reviewed;
  const isAdjustment = line.accepted_as_adjustment;

  const jeTotal = matchedJes.reduce((s, j) => s + Number(j.amount ?? 0), 0);
  const variance = Number(line.amount ?? 0) - jeTotal;

  // Per-month recognition map: monthKey → { sum, jes[] }. Used in compact mode
  // to paint the main invoice row's month cells with the recognised
  // distribution (rather than the invoice amount in its own txn month) and to
  // drive the cell-click popover that lists the JEs in a given month.
  const jesByMonth = useMemo(() => {
    const m = new Map<string, { sum: number; jes: ParsedRecognitionJe[] }>();
    for (const j of matchedJes) {
      const k = monthKeyOf(j.txn_date);
      if (!k) continue;
      const bucket = m.get(k) ?? { sum: 0, jes: [] };
      bucket.sum += Number(j.amount ?? 0);
      bucket.jes.push(j);
      m.set(k, bucket);
    }
    return m;
  }, [matchedJes]);

  // Compact-mode month-cell popover state: when a user clicks a cell with
  // recognised activity, render a floating list of the matched JEs for that
  // month, preserving the delete + reassign (right-click) actions that would
  // otherwise live on JE sub-rows in detail mode.
  const [cellPopover, setCellPopover] = useState<{ x: number; y: number; monthLabel: string; jes: ParsedRecognitionJe[] } | null>(null);
  useEffect(() => {
    if (!cellPopover) return;
    const close = () => setCellPopover(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [cellPopover]);
  // Problem state: nothing matched OR matched JEs don't tie to the invoice
  // amount. These rows get a rose tint so the eye jumps straight to them.
  // $0 invoice lines, reviewed lines, and lines accepted as billing-only
  // adjustments are all excluded (nothing needs reconciling / user signed off).
  const hasProblem = Number(line.amount ?? 0) !== 0 && !isReviewed && !isAdjustment
    && (matchedJes.length === 0 || Math.abs(variance) >= 0.01);
  // Dark-mode bg must be opaque: this rowBg is consumed by every sticky-left
  // cell on the invoice line row (via stickyCls), so a semi-transparent value
  // would let scrolling month cells bleed through on horizontal scroll.
  const rowBg = hasProblem
    ? "bg-rose-50 dark:bg-rose-950"
    : "bg-white dark:bg-zinc-900";
  const amountText = hasProblem
    ? "text-rose-700 dark:text-rose-300"
    : "text-zinc-800 dark:text-zinc-200";

  // Compute proposed JEs for any periods within the recognition window that
  // don't have a matched JE yet. Used by the "Generate JEs" preview.
  const proposed = useMemo(
    () => computeProposedJes({ line, docPrefix, type: effectiveType, window, matchedJes, accountConfig }),
    [line, docPrefix, effectiveType, window, matchedJes, accountConfig],
  );
  const [showGenerate, setShowGenerate] = useState(false);

  // Auto-revoke stale review state: if a line was locked-in but then all its
  // JEs got deleted upstream (or the matcher no longer sees any), the
  // "Reviewed" pill is misleading. Drop it once so the user sees the real
  // state. Guarded by a ref so we don't fight an in-flight unreview.
  const autoUnreviewedRef = useRef(false);
  useEffect(() => {
    if (
      matcherReady
      && isReviewed
      && matchedJes.length === 0
      && Number(line.amount ?? 0) !== 0
      && !isAdjustment
      && !autoUnreviewedRef.current
      && !unreviewMut.isPending
    ) {
      autoUnreviewedRef.current = true;
      unreviewMut.mutate({ qbo_invoice_id: line.qbo_invoice_id, qbo_line_id: line.qbo_line_id });
    }
    if (matchedJes.length > 0) {
      autoUnreviewedRef.current = false;
    }
  }, [matcherReady, isReviewed, matchedJes.length, line.amount, line.qbo_invoice_id, line.qbo_line_id, isAdjustment, unreviewMut]);

  function doSyncInvoice(e: React.MouseEvent) {
    e.stopPropagation();
    const doc = line.doc_number;
    if (!doc) return;
    syncInvoice.mutate(
      { doc_number: doc },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(
              `🔄 Synced invoice ${doc}: ${res.je_synced ?? 0} JE(s) refreshed`
              + (res.je_deleted ? `, ${res.je_deleted} removed` : ""),
            );
          } else {
            toast.error(`❌ Sync failed: ${res.error ?? "unknown error"}`);
          }
        },
        onError: (err) => toast.error(`Sync failed: ${err.message}`),
      },
    );
  }

  return (
    <Fragment>
      {/* Invoice line row — hidden in Recognised-only mode */}
      {!recognisedOnly && <tr
        className={cn(
          "group border-b border-zinc-100 dark:border-zinc-900 cursor-pointer",
          isFirstLineOfInvoice && "border-t-2 border-t-zinc-200 dark:border-t-zinc-800",
        )}
        onClick={onToggle}
      >
        <td className={`${stickyCls("kind", rowBg)} px-2 py-1.5`} style={stickyStyle("kind", colWidths, lefts)}>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-zinc-500 text-xs w-3 inline-block leading-none">{isExpanded ? "▼" : "▶"}</span>
            <KindPill kind="invoice" />
            <JeStatusBadge count={matchedJes.length} variance={variance} />
            {isReviewed && <ReviewedPill />}
            {isAdjustment && <AdjustmentPill />}
            {isFirstLineOfInvoice && (
              <>
                <button
                  onClick={doSyncInvoice}
                  disabled={syncInvoice.isPending}
                  className={cn(
                    "p-0.5 text-zinc-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors disabled:opacity-50",
                    syncInvoice.isPending && "animate-spin",
                  )}
                  title={`Pull latest ${line.doc_number} + its JEs from QBO`}
                >
                  <RefreshCw size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const ok = confirm(
                      `Delete invoice ${line.doc_number} (${customerName}, ${formatMoney(line.invoice_total)}) from QuickBooks?\n\nThis only deletes the invoice. Any recognition JEs attached to it stay until you delete them separately.`,
                    );
                    if (!ok) return;
                    deleteInvoice.mutate(
                      { qbo_id: line.qbo_invoice_id },
                      {
                        onSuccess: (res) => {
                          if (res.success) toast.success(`✅ Deleted invoice ${line.doc_number} in QuickBooks`);
                          else toast.error(`❌ ${res.error ?? "delete failed"}`);
                        },
                        onError: (err) => toast.error(`Failed: ${err.message}`),
                      },
                    );
                  }}
                  disabled={deleteInvoice.isPending}
                  className="p-0.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                  title={`Delete invoice ${line.doc_number} from QBO (does NOT delete attached JEs)`}
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </div>
        </td>
        <td className={cn(stickyCls("doc", rowBg), "px-2 py-1.5 font-mono", hasProblem ? "text-rose-800 dark:text-rose-200" : "text-zinc-800 dark:text-zinc-200")} style={stickyStyle("doc", colWidths, lefts)}>
          <div>{line.doc_number ?? "—"}</div>
          <PaymentBadge status={line.invoice_status} balance={line.invoice_balance} total={line.invoice_total} />
        </td>
        <td className={cn(stickyCls("date", rowBg), "px-2 py-1.5 whitespace-nowrap", hasProblem ? "text-rose-700 dark:text-rose-300" : "text-zinc-700 dark:text-zinc-300")} style={stickyStyle("date", colWidths, lefts)}>
          {formatDate(line.txn_date)}
        </td>
        <td className={cn(stickyCls("customer", rowBg), "px-2 py-1.5", hasProblem ? "text-rose-800 dark:text-rose-200" : "text-zinc-800 dark:text-zinc-200")} style={stickyStyle("customer", colWidths, lefts)}>
          <div className="truncate" title={customerName}>{customerName}</div>
        </td>
        <td className={cn(stickyCls("item", rowBg), "px-2 py-1.5", hasProblem ? "text-rose-700 dark:text-rose-300" : "text-zinc-700 dark:text-zinc-300")} style={stickyStyle("item", colWidths, lefts)}>
          <div className="truncate" title={line.item_ref ?? ""}>{line.item_ref ?? "—"}</div>
          {line.description && (
            <div className={cn("text-[10px] truncate", hasProblem ? "text-rose-600 dark:text-rose-400" : "text-zinc-500")} title={line.description}>{line.description}</div>
          )}
        </td>
        <td className={`${stickyCls("period", rowBg)} px-2 py-1.5 whitespace-nowrap`} style={stickyStyle("period", colWidths, lefts)}>
          <PeriodCell window={window} line={line} effectiveType={effectiveType} isAdjustment={isAdjustment} />
        </td>
        <td className={`${stickyCls("type", rowBg)} px-2 py-1.5`} style={stickyStyle("type", colWidths, lefts)}>
          <TypePill type={effectiveType} />
        </td>
        <td className={cn(stickyCls("net", rowBg), "px-2 py-1.5 text-right tabular-nums font-medium border-r border-zinc-200 dark:border-zinc-800", amountText)} style={stickyStyle("net", colWidths, lefts)}>
          {formatMoney(line.amount)}
        </td>
        {gridColumns.map((c) => {
          if (c.kind === "month") {
            const m = c.m;
            if (compactRows) {
              // Compact: month cell shows the SUM of matched JE amounts in
              // this month (the recognised distribution). Cell is clickable
              // when there's activity — opens a popover listing the JEs so
              // the user can inspect/delete/reassign without leaving this row.
              const bucket = jesByMonth.get(m.key);
              const monthSum = bucket?.sum ?? 0;
              const hasActivity = bucket != null && bucket.jes.length > 0;
              return (
                <td
                  key={m.key}
                  onClick={hasActivity ? (e) => {
                    e.stopPropagation();
                    setCellPopover({ x: e.clientX, y: e.clientY, monthLabel: m.label, jes: bucket!.jes });
                  } : undefined}
                  className={cn(
                    "px-2 py-1.5 text-right tabular-nums",
                    hasActivity
                      ? "bg-sky-50 dark:bg-sky-950 text-sky-800 dark:text-sky-300 cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900"
                      : "text-zinc-300 dark:text-zinc-700",
                  )}
                  title={hasActivity ? `Click to see ${bucket!.jes.length} JE${bucket!.jes.length === 1 ? "" : "s"} in ${m.label}` : undefined}
                >
                  {monthSum > 0 ? formatMoney(monthSum) : "—"}
                </td>
              );
            }
            return (
              <td key={m.key} className={cn(
                "px-2 py-1.5 text-right tabular-nums",
                invoiceMonth === m.key
                  ? hasProblem
                    ? "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-semibold"
                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium"
                  : "text-zinc-300 dark:text-zinc-700",
              )}>
                {invoiceMonth === m.key ? formatMoney(line.amount) : "—"}
              </td>
            );
          }
          // FY-total column. In compact mode: sum recognised across FY months.
          // In detail mode: mirror the invoice-amount cell when invoice month
          // is in this FY.
          if (compactRows) {
            const fySum = c.monthKeys.reduce((s, k) => s + (jesByMonth.get(k)?.sum ?? 0), 0);
            return (
              <td key={`fyt-${c.fy}`} className={cn(
                "px-2 py-1.5 text-right tabular-nums border-l-2 border-l-zinc-300 dark:border-l-zinc-700 font-medium bg-zinc-100 dark:bg-zinc-900",
                fySum > 0 ? "text-sky-800 dark:text-sky-300" : "text-zinc-300 dark:text-zinc-700",
              )}>
                {fySum > 0 ? formatMoney(fySum) : "—"}
              </td>
            );
          }
          const inFy = invoiceMonth != null && c.monthKeys.includes(invoiceMonth);
          return (
            <td key={`fyt-${c.fy}`} className={cn(
              "px-2 py-1.5 text-right tabular-nums border-l-2 border-l-zinc-300 dark:border-l-zinc-700 font-medium bg-zinc-100 dark:bg-zinc-900",
              inFy
                ? hasProblem
                  ? "text-rose-800 dark:text-rose-200"
                  : "text-emerald-800 dark:text-emerald-300"
                : "text-zinc-300 dark:text-zinc-700",
            )}>
              {inFy ? formatMoney(line.amount) : "—"}
            </td>
          );
        })}
        <td className={cn(
          "px-2 py-1.5 text-right tabular-nums font-medium",
          hasProblem
            ? "bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200"
            : "bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200",
        )}>
          {formatMoney(line.amount)}
        </td>
      </tr>}

      {/* Always-visible compact summary on the line row's right (folded into Total) */}
      {/* Matched JE rows + variance — only when expanded */}
      {isExpanded && matchedJes.map((je) => {
        const jeMonth = monthKeyOf(je.txn_date);
        return (
          <tr
            key={je.qbo_id}
            className="border-b border-zinc-100 dark:border-zinc-900"
            onContextMenu={(e) => onJeContextMenu(e, je)}
            title="Right-click to re-assign this JE to a different invoice line"
          >
            <td className={`${stickyCls("kind", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5`} style={stickyStyle("kind", colWidths, lefts)}>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs w-3 inline-block leading-none" />
                <KindPill kind="je" />
              </div>
            </td>
            <td className={`${stickyCls("doc", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5 font-mono text-zinc-600 dark:text-zinc-400`} style={stickyStyle("doc", colWidths, lefts)}>
              <JeDocNumberCell je={je} />
            </td>
            <td className={`${stickyCls("date", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap`} style={stickyStyle("date", colWidths, lefts)}>
              <JeTxnDateCell je={je} />
            </td>
            <td className={`${stickyCls("customer", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5 text-zinc-500`} style={stickyStyle("customer", colWidths, lefts)}>
              <div className="truncate" title={je.customer_name ?? ""}>{je.customer_name ?? "—"}</div>
            </td>
            <td className={`${stickyCls("item", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5 text-zinc-500`} style={stickyStyle("item", colWidths, lefts)}>
              {(() => {
                const memo = je.description
                  ?? (je.period_index != null ? `Recognition · period ${je.period_index}` : "Recognition (memo not parsed)");
                return (
                  <div className="truncate" title={memo}>
                    {memo}
                  </div>
                );
              })()}
            </td>
            <td className={`${stickyCls("period", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5 text-zinc-500 whitespace-nowrap`} style={stickyStyle("period", colWidths, lefts)}>
              <JeTxnDateCell je={je} display="month" />
            </td>
            <td className={`${stickyCls("type", "bg-sky-50 dark:bg-sky-950")} px-2 py-1.5`} style={stickyStyle("type", colWidths, lefts)}>
              <TypePill type={je.type ?? "OTHER"} muted />
            </td>
            <td className={`${stickyCls("net", "bg-sky-50 dark:bg-sky-950 border-r border-zinc-200 dark:border-zinc-800")} px-2 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400`} style={stickyStyle("net", colWidths, lefts)}>
              <span className="inline-flex items-center gap-1.5 justify-end">
                <JeDeleteButton je={je} />
                <JeAmountCell je={je} />
              </span>
            </td>
            {gridColumns.map((c) => {
              if (c.kind === "month") {
                const m = c.m;
                const isCurrent = jeMonth === m.key;
                return (
                  <td
                    key={m.key}
                    onClick={() => {
                      if (isCurrent) return;
                      const [y, mm] = m.key.split("-").map(Number);
                      const last = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
                      if (!confirm(`Move JE ${je.doc_number} from ${formatJeMonth(je.txn_date)} to ${m.label} (${last})?`)) return;
                      updateTxnDate.mutate(
                        { qbo_id: je.qbo_id, txn_date: last },
                        {
                          onSuccess: (res) => {
                            if (res.success) toast.success(`✅ Moved ${je.doc_number} to ${res.txn_date}`);
                            else toast.error(`❌ QBO rejected: ${res.error ?? "unknown"}`);
                          },
                          onError: (err) => toast.error(`Failed: ${err.message}`),
                        },
                      );
                    }}
                    className={cn(
                      "px-2 py-1.5 text-right tabular-nums",
                      isCurrent
                        ? "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 cursor-default"
                        : "text-zinc-300 dark:text-zinc-700 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:text-sky-600 dark:hover:text-sky-400",
                    )}
                    title={isCurrent ? `JE is in ${m.label}` : `Click to move JE ${je.doc_number} → ${m.label}`}
                  >
                    {isCurrent ? formatMoney(je.amount) : "—"}
                  </td>
                );
              }
              // FY-total: mirror month cell when the JE's month is in this FY;
              // not clickable (moving a JE is only meaningful per calendar month).
              const inFy = jeMonth != null && c.monthKeys.includes(jeMonth);
              return (
                <td key={`fyt-${c.fy}`} className={cn(
                  "px-2 py-1.5 text-right tabular-nums border-l-2 border-l-zinc-300 dark:border-l-zinc-700 font-medium bg-zinc-100 dark:bg-zinc-900",
                  inFy ? "text-sky-800 dark:text-sky-300" : "text-zinc-300 dark:text-zinc-700",
                )}>
                  {inFy ? formatMoney(je.amount) : "—"}
                </td>
              );
            })}
            <td className="px-2 py-1.5 text-right tabular-nums bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400">
              {formatMoney(je.amount)}
            </td>
          </tr>
        );
      })}

      {/* Variance summary + lock-in controls (only when expanded) */}
      {isExpanded && matchedJes.length > 0 && (
        <tr className="border-b border-zinc-100 dark:border-zinc-900 text-[10px] text-zinc-500">
          <td colSpan={7} className="px-2 py-1 text-right">
            <span className="italic mr-3">
              {matchedJes.length} JE{matchedJes.length === 1 ? "" : "s"} totalling {formatMoney(jeTotal)} ·{" "}
              {Math.abs(variance) < 0.01
                ? <span className="text-emerald-600 dark:text-emerald-400">ties to invoice</span>
                : <span className="text-amber-600 dark:text-amber-400">variance {formatMoney(variance)}</span>}
            </span>
            {proposed.missing.length > 0 && Math.abs(variance) >= 0.01 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowGenerate(true); }}
                className="text-[10px] px-2 py-0.5 mr-2 rounded border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60"
                title={`Preview ${proposed.missing.length} missing JE${proposed.missing.length === 1 ? "" : "s"}`}
              >
                ✨ Generate {proposed.missing.length} JE{proposed.missing.length === 1 ? "" : "s"}
              </button>
            )}
            {Math.abs(variance) >= 0.01 && !isAdjustment && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adjustmentMut.mutate({
                    qbo_invoice_id: line.qbo_invoice_id,
                    qbo_line_id: line.qbo_line_id,
                    line_type: effectiveType,
                    accepted: true,
                  });
                }}
                disabled={adjustmentMut.isPending}
                className="text-[10px] px-2 py-0.5 mr-2 rounded border border-violet-400 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/60 disabled:opacity-50"
                title="Keep the matched JEs as-is and accept the remaining variance (billing-only adjustment)."
              >
                {adjustmentMut.isPending ? "…" : `📌 Accept ${formatMoney(variance)} variance`}
              </button>
            )}
            {isAdjustment && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adjustmentMut.mutate({
                    qbo_invoice_id: line.qbo_invoice_id,
                    qbo_line_id: line.qbo_line_id,
                    line_type: effectiveType,
                    accepted: false,
                  });
                }}
                disabled={adjustmentMut.isPending}
                className="text-[10px] px-2 py-0.5 mr-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                title="Un-accept — line goes back to problem queue."
              >
                {adjustmentMut.isPending ? "…" : "↶ Un-accept variance"}
              </button>
            )}
            {isReviewed ? (
              <button
                onClick={() => unreviewMut.mutate({ qbo_invoice_id: line.qbo_invoice_id, qbo_line_id: line.qbo_line_id })}
                disabled={unreviewMut.isPending}
                className="text-[10px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                🔓 Unlock
              </button>
            ) : (
              <button
                onClick={() => reviewMut.mutate({
                  qbo_invoice_id: line.qbo_invoice_id,
                  qbo_line_id: line.qbo_line_id,
                  line_type: effectiveType,
                  matched_je_ids: matchedJes.map((j) => j.qbo_id),
                })}
                disabled={reviewMut.isPending}
                className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                title="Lock in this invoice's JE attribution. The matched JEs will be pinned here and not appear on other invoices."
              >
                {reviewMut.isPending ? "Locking…" : "🔒 Lock in review"}
              </button>
            )}
            {reviewMut.isError && (
              <span className="ml-2 text-rose-600 dark:text-rose-400" title={String(reviewMut.error)}>
                error: {String(reviewMut.error?.message ?? reviewMut.error).slice(0, 80)}
              </span>
            )}
            {unreviewMut.isError && (
              <span className="ml-2 text-rose-600 dark:text-rose-400" title={String(unreviewMut.error)}>
                error: {String(unreviewMut.error?.message ?? unreviewMut.error).slice(0, 80)}
              </span>
            )}
          </td>
          <td colSpan={2 + gridColumns.length} />
        </tr>
      )}
      {isExpanded && matchedJes.length === 0 && (
        <tr className="border-b border-zinc-100 dark:border-zinc-900 text-[10px] text-zinc-500">
          <td colSpan={8 + gridColumns.length + 1} className="px-2 py-1 text-left">
            {isAdjustment ? (
              <>
                <span className="italic mr-2 text-violet-700 dark:text-violet-400">
                  Accepted as billing-only adjustment — no recognition JEs expected.
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustmentMut.mutate({
                      qbo_invoice_id: line.qbo_invoice_id,
                      qbo_line_id: line.qbo_line_id,
                      line_type: effectiveType,
                      accepted: false,
                    });
                  }}
                  disabled={adjustmentMut.isPending}
                  className="text-[10px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  {adjustmentMut.isPending ? "…" : "Undo adjustment"}
                </button>
              </>
            ) : (
              <>
                <span className="italic mr-2">
                  No recognition JEs found for prefix <span className="font-mono">{docPrefix}-{effectiveType}</span>
                </span>
                {proposed.missing.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowGenerate(true); }}
                    className="text-[10px] px-2 py-0.5 mr-2 rounded border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60"
                  >
                    ✨ Generate {proposed.missing.length} JE{proposed.missing.length === 1 ? "" : "s"}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustmentMut.mutate({
                      qbo_invoice_id: line.qbo_invoice_id,
                      qbo_line_id: line.qbo_line_id,
                      line_type: effectiveType,
                      accepted: true,
                    });
                  }}
                  disabled={adjustmentMut.isPending}
                  className="text-[10px] px-2 py-0.5 rounded border border-violet-400 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/60 disabled:opacity-50"
                  title="Revenue was already recognised elsewhere — mark this line as a billing-only adjustment."
                >
                  {adjustmentMut.isPending ? "…" : "📌 Accept as adjustment"}
                </button>
              </>
            )}
          </td>
        </tr>
      )}

      {showGenerate && (
        <GenerateJesModal
          line={line}
          customerName={customerName}
          proposed={proposed}
          accountNameById={accountNameById}
          allJeByDocNumber={allJeByDocNumber}
          onClose={() => setShowGenerate(false)}
        />
      )}
      {cellPopover && createPortal(
        <div
          className="fixed z-50 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-xs min-w-[280px] max-w-[420px]"
          style={{ left: Math.min(cellPopover.x, document.documentElement.clientWidth - 440), top: Math.min(cellPopover.y + 8, document.documentElement.clientHeight - 200) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/60">
            <span className="font-medium">{cellPopover.monthLabel} · {cellPopover.jes.length} JE{cellPopover.jes.length === 1 ? "" : "s"}</span>
            <span className="text-[10px] text-zinc-500">right-click to reassign</span>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {cellPopover.jes.map((je) => (
              <li
                key={je.qbo_id}
                className="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-950/60"
                onContextMenu={(e) => {
                  onJeContextMenu(e, je);
                  setCellPopover(null);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{je.doc_number}</span>
                  <span className="ml-auto tabular-nums font-medium text-sky-700 dark:text-sky-300">{formatMoney(je.amount)}</span>
                  <JeDeleteButton je={je} />
                </div>
                {je.description && (
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5" title={je.description}>{je.description}</div>
                )}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </Fragment>
  );
}

function KindPill({ kind }: { kind: "invoice" | "je" }) {
  if (kind === "invoice") {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
        INV
      </span>
    );
  }
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
      JE
    </span>
  );
}

function PaymentBadge({
  status,
  balance,
  total,
}: {
  status: string | null;
  balance: number | null;
  total: number;
}) {
  // Derive a single label from QBO's status + balance fields.
  // QBO status values: 'Paid' (or balance=0), 'Partial', 'Sent' (unpaid), 'NotSent', etc.
  const bal = Number(balance ?? 0);
  const isPaid = status === "Paid" || (bal <= 0.01 && total > 0);
  const isPartial = !isPaid && bal > 0 && bal < total - 0.01;
  const isUnpaid = !isPaid && !isPartial && bal > 0;

  let label = status ?? "—";
  let cls = "bg-zinc-100 dark:bg-zinc-800 text-zinc-500";
  if (isPaid) {
    label = "Paid";
    cls = "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300";
  } else if (isPartial) {
    label = `Partial (${formatMoney(bal)} due)`;
    cls = "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300";
  } else if (isUnpaid) {
    label = `Unpaid (${formatMoney(bal)} due)`;
    cls = "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300";
  }
  return (
    <span className={cn("inline-block mt-0.5 text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap", cls)}>
      {label}
    </span>
  );
}

function PeriodCell({
  window,
  line,
  effectiveType,
  isAdjustment,
}: {
  window: RecogWindow | null;
  line: InvoiceLineWithRecognition;
  effectiveType: "SUB" | "SVC" | "OTHER";
  isAdjustment: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(window?.start ?? "");
  const [end, setEnd] = useState(window?.end ?? "");
  const upsert = useUpsertInvoiceLineRecognition();

  // Keep local form state fresh when the underlying window changes (e.g. after save).
  useEffect(() => {
    setStart(window?.start ?? "");
    setEnd(window?.end ?? "");
  }, [window?.start, window?.end]);

  function save(e: React.MouseEvent) {
    e.stopPropagation();
    if (!start || !end || end < start) return;
    // Save the user's exact dates (no snap). The matcher applies end-of-month
    // tolerance internally, so JEs posted on month-end (e.g. Mar 31) still
    // catch even when the period ends mid-month (e.g. Mar 15). Keeping raw
    // dates lets the JE generator do honest cycle counting from the day
    // numbers (e.g. Jun 10 → Sep 9 = 3 cycles, not 4 calendar months).
    upsert.mutate(
      {
        qbo_invoice_id: line.qbo_invoice_id,
        qbo_line_id: line.qbo_line_id,
        line_type: effectiveType,
        recog_start: start,
        recog_end: end,
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  function clearAnnotation(e: React.MouseEvent) {
    e.stopPropagation();
    upsert.mutate(
      {
        qbo_invoice_id: line.qbo_invoice_id,
        qbo_line_id: line.qbo_line_id,
        line_type: effectiveType,
        recog_start: null,
        recog_end: null,
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="text-[10px] px-1 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-full"
        />
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="text-[10px] px-1 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-full"
        />
        <div className="flex items-center gap-1">
          <button
            onClick={save}
            disabled={upsert.isPending || !start || !end}
            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {upsert.isPending ? "…" : "Save"}
          </button>
          {window?.source === "annotated" && (
            <button
              onClick={clearAnnotation}
              disabled={upsert.isPending}
              className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              title="Remove override, fall back to description parsing"
            >
              Clear
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(false); }}
            className="text-[10px] px-1 py-0.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  const label = window ? formatPeriodCompact(window.start, window.end) : "—";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="flex flex-col text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1 -mx-1 -my-0.5 py-0.5 w-full"
      title={isAdjustment
        ? "This line is accepted as an adjustment — no recognition period required. Click to set one anyway."
        : "Click to edit recognition period. After saving, JEs will be re-matched."}
    >
      <span className={cn(window ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400")}>
        {label}
      </span>
      {window && (
        <span className="text-[9px] text-zinc-500 dark:text-zinc-500 tabular-nums">
          {formatShortDate(window.start)} → {formatShortDate(window.end)}
        </span>
      )}
      <span className={cn(
        "text-[9px]",
        !window && isAdjustment ? "text-violet-600 dark:text-violet-400"
          : !window ? "text-zinc-400"
          : window.source === "annotated" ? "text-emerald-600 dark:text-emerald-400"
          : "text-zinc-400",
      )}>
        {!window && isAdjustment
          ? "not required"
          : !window ? "click to set"
          : window.source === "annotated" ? "annotated ✎"
          : "from description ✎"}
      </span>
    </button>
  );
}

// ─── Generate missing JEs (preview) ──────────────────────────────────────
//
// For an invoice line with a recognition window, derive what JEs *should*
// exist (one per month, at monthly_rate = amount / months). Compare against
// the JEs already attributed and return the missing periods so the UI can
// show a Generate-JEs preview.

interface ProposedJe {
  period_index: number;
  doc_number: string;       // e.g. "1082-SUB-3" — also used as journal-level memo
  description: string;      // per-line description, e.g. "Recognition · period 3"
  txn_date: string;         // last day of the period's month
  amount: number;
  dr_account_qbo_id: string | null;  // deferred account (per type)
  cr_account_qbo_id: string | null;  // revenue account (per type)
  customer_qbo_id: string | null;
  isExisting: boolean;
}

interface ProposedJePlan {
  expected: ProposedJe[];
  missing: ProposedJe[];
  monthlyAmount: number;
  totalMonths: number;
  // 'window' = computed from the line's annotated/description period;
  // 'inferred' = back-derived from the matched JEs because no period was set.
  source: "window" | "inferred" | "none";
}

function computeProposedJes(args: {
  line: InvoiceLineWithRecognition;
  docPrefix: string;
  type: "SUB" | "SVC" | "OTHER";
  window: RecogWindow | null;
  matchedJes: ParsedRecognitionJe[];
  accountConfig: FyAccountConfig | null;
}): ProposedJePlan {
  const { line, docPrefix, type, window, matchedJes, accountConfig } = args;
  if (!docPrefix) {
    return { expected: [], missing: [], monthlyAmount: 0, totalMonths: 0, source: "none" };
  }
  const lineAmount = Number(line.amount ?? 0);

  // Derive (start, totalMonths) from the annotated window if present, else
  // fall back to inferring from the matched JEs: their period_index and
  // average amount tell us how the line was being recognized historically.
  let startYear: number, startMonth: number, totalMonths: number, monthlyAmount: number;

  // Existing matched JEs (with a parseable period_index) are the most reliable
  // signal of the actual monthly rate — they're real postings the user has
  // accepted historically. When present, trust them over date arithmetic.
  const numbered = matchedJes.filter((j) => j.period_index != null);
  const hasNumberedJes = numbered.length > 0 && lineAmount > 0;

  if (window) {
    // Window is the user's authoritative intent — use it for both totalMonths
    // and monthly rate. Existing matched JEs may disagree (wrong amounts from
    // an earlier convention); the user will see the variance and reconcile.
    const start = new Date(window.start + "T00:00:00Z");
    const end = new Date(window.end + "T00:00:00Z");
    startYear = start.getUTCFullYear();
    startMonth = start.getUTCMonth();
    const dayMs = 1000 * 60 * 60 * 24;
    const days = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
    totalMonths = Math.max(1, Math.round(days / 30));
    monthlyAmount = Math.round((lineAmount / totalMonths) * 100) / 100;
  } else {
    // No annotated period — try to infer from matched JEs.
    if (!hasNumberedJes) {
      return { expected: [], missing: [], monthlyAmount: 0, totalMonths: 0, source: "none" };
    }
    // Period 1's month = earliest matched JE's month minus (period_index - 1).
    const sorted = [...numbered].sort((a, b) => (a.period_index! - b.period_index!));
    const first = sorted[0];
    const firstDate = new Date(first.txn_date + "T00:00:00Z");
    const firstMonthIdx = firstDate.getUTCFullYear() * 12 + firstDate.getUTCMonth();
    const period1MonthIdx = firstMonthIdx - (first.period_index! - 1);
    startYear = Math.floor(period1MonthIdx / 12);
    startMonth = period1MonthIdx % 12;
    // Monthly amount = average of matched JE amounts (more robust than picking one).
    const avg = numbered.reduce((s, j) => s + Number(j.amount ?? 0), 0) / numbered.length;
    monthlyAmount = Math.round(avg * 100) / 100;
    if (monthlyAmount <= 0) return { expected: [], missing: [], monthlyAmount: 0, totalMonths: 0, source: "none" };
    totalMonths = Math.max(1, Math.round(lineAmount / monthlyAmount));
  }
  const start = new Date(Date.UTC(startYear, startMonth, 1));

  const drAccount = type === "SUB" ? accountConfig?.deferred_sub_account_qbo_id
    : type === "SVC" ? accountConfig?.deferred_svc_account_qbo_id
    : accountConfig?.deferred_other_account_qbo_id;
  const crAccount = type === "SUB" ? accountConfig?.revenue_sub_account_qbo_id
    : type === "SVC" ? accountConfig?.revenue_svc_account_qbo_id
    : accountConfig?.revenue_other_account_qbo_id;

  const invoiceDoc = line.doc_number ?? docPrefix;
  const itemRef = line.item_ref ?? "(no item)";
  // Determine the prefix for new JEs. Prefer the prefix we already see on
  // matched JEs (source of truth — matches customer's GL convention). When
  // there are no matched JEs (cold-start line), use the invoice's FULL
  // doc_number — e.g. invoice "1095-2" gets "1095-2-SUB-N" — so sibling
  // invoices that share a root prefix (1095-1 already has 1095-SUB-1/2/3)
  // don't collide. The modal's prefix override lets the user rewrite this
  // if they prefer continued numbering (1095-SUB-4/5/6) instead.
  const prefixFromMatched = matchedJes.find((j) => j.prefix)?.prefix;
  const jePrefix = prefixFromMatched ?? docPrefix;

  // Coverage is by MONTH (YYYY-MM of txn_date), not by period_index from the
  // doc#. period_index from "1095-SUB-7" only tells us this is the 7th JE the
  // user wrote, not which calendar month it covers — a user who picked custom
  // numbering (continuing from 1095-1's 1/2/3 by using 7/8/9 for 1095-3) would
  // otherwise get the matcher proposing duplicate periods 1/2/3 every refresh.
  // Month-based coverage is robust to whatever doc# numbering the user adopts.
  const existingMonths = new Set<string>();
  // Highest period_index already in QBO under this prefix — new JEs continue
  // numbering from there so we never collide with what's already posted.
  let maxExistingPeriod = 0;
  for (const je of matchedJes) {
    existingMonths.add(je.txn_date.slice(0, 7));
    if (je.prefix === jePrefix && je.period_index != null && je.period_index > maxExistingPeriod) {
      maxExistingPeriod = je.period_index;
    }
  }

  // Per-period amounts, cent-exact so the sum ties back to the invoice line
  // total. QBO JE lines are limited to 2 decimal places, so naively posting
  // monthlyAmount×N will over/under-shoot when the split isn't clean (e.g.
  // $5,000 ÷ 3 = $1,666.666…). Distribute the residual cents across the
  // first `remainderCents` periods so the first few periods are $1,666.67
  // and the last is $1,666.66 — sum is exactly $5,000.00.
  const totalCents = Math.round(lineAmount * 100);
  const baseCents = Math.floor(totalCents / totalMonths);
  const remainderCents = totalCents - baseCents * totalMonths;
  const centsFor = (i: number) => (i < remainderCents ? baseCents + 1 : baseCents);

  const expected: ProposedJe[] = [];
  let nextPeriod = maxExistingPeriod;
  for (let i = 0; i < totalMonths; i++) {
    const monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 0));
    const txn_date = monthDate.toISOString().slice(0, 10);
    const monthKey = txn_date.slice(0, 7);
    const isExisting = existingMonths.has(monthKey);
    const monthLabel = monthDate.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
    // For existing rows, surface the actual JE's period_index/doc# so the user
    // sees what's really in QBO. For new rows, allocate the next unused period
    // number after the highest already in QBO.
    let period: number;
    let docNum: string;
    let amount: number;
    if (isExisting) {
      const matched = matchedJes.find((j) => j.txn_date.slice(0, 7) === monthKey);
      period = matched?.period_index ?? (i + 1);
      docNum = matched?.doc_number ?? `${jePrefix}-${type}-${period}`;
      // Use the already-posted amount so the status column shows what's
      // actually in QBO, not our theoretical split.
      amount = Number(matched?.amount ?? centsFor(i) / 100);
    } else {
      nextPeriod += 1;
      period = nextPeriod;
      docNum = `${jePrefix}-${type}-${period}`;
      amount = centsFor(i) / 100;
    }
    const description = `INV ${invoiceDoc} · ${itemRef} · ${monthLabel} · period ${i + 1} of ${totalMonths}`;
    expected.push({
      period_index: period,
      doc_number: docNum,
      description,
      txn_date,
      amount,
      dr_account_qbo_id: drAccount ?? null,
      cr_account_qbo_id: crAccount ?? null,
      customer_qbo_id: line.customer_qbo_id,
      isExisting,
    });
  }
  const missing = expected.filter((e) => !e.isExisting);
  return { expected, missing, monthlyAmount, totalMonths, source: window ? "window" : "inferred" };
}

function GenerateJesModal({
  line,
  customerName,
  proposed,
  accountNameById,
  allJeByDocNumber,
  onClose,
}: {
  line: InvoiceLineWithRecognition;
  customerName: string;
  proposed: ProposedJePlan;
  accountNameById: Map<string, string>;
  allJeByDocNumber: Map<string, ParsedRecognitionJe>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const create = useCreateJournalEntries();
  const [results, setResults] = useState<Record<string, { success: boolean; qbo_id?: string; error?: string }>>({});
  // Per-row doc# overrides keyed by the ORIGINAL proposed doc_number so the
  // key remains stable even as the user types. The edited value is what
  // actually gets POSTed to QBO — so fixing the prefix here fixes QBO too.
  const [editedDocs, setEditedDocs] = useState<Record<string, string>>({});
  const [editedDates, setEditedDates] = useState<Record<string, string>>({});
  const [editedDescs, setEditedDescs] = useState<Record<string, string>>({});
  const [editedAmounts, setEditedAmounts] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const finalDoc = (p: ProposedJe) => editedDocs[p.doc_number] ?? p.doc_number;
  const finalDate = (p: ProposedJe) => editedDates[p.doc_number] ?? p.txn_date;
  const finalDesc = (p: ProposedJe) => editedDescs[p.doc_number] ?? p.description;
  const finalAmount = (p: ProposedJe) => {
    const raw = editedAmounts[p.doc_number];
    if (raw == null) return p.amount;
    const n = Number(raw);
    return Number.isFinite(n) ? n : p.amount;
  };
  const isSkipped = (p: ProposedJe) => !!skipped[p.doc_number];

  // Map proposed → CreateJeEntry. Skip lines with missing accounts/customer
  // (validateEntry on the backend will catch these too, but failing fast in
  // the UI gives a better user experience). Also skip rows already pushed
  // in this modal session — guards against double-clicking Push and against
  // the rare race where the matcher hasn't yet picked up the newly mirrored
  // JEs after refetch.
  // Collision check: if the doc# the user is about to POST already exists in
  // QBO under a different JE, block the push and warn — otherwise we'd create
  // a duplicate that QBO does NOT enforce uniqueness on.
  const collisionFor = (p: ProposedJe): ParsedRecognitionJe | null => {
    const existing = allJeByDocNumber.get(finalDoc(p));
    if (!existing) return null;
    // If it's the same JE we just mirrored from this push, that's not a
    // collision — it's the success state. Identify by qbo_id from results.
    if (results[finalDoc(p)]?.qbo_id === existing.qbo_id) return null;
    return existing;
  };

  const pushable = proposed.missing.filter((p) =>
    p.dr_account_qbo_id && p.cr_account_qbo_id && p.customer_qbo_id
    && !results[finalDoc(p)]?.success
    && !collisionFor(p)
    && !isSkipped(p)
  );
  const blockedCount = proposed.missing.filter((p) =>
    !(p.dr_account_qbo_id && p.cr_account_qbo_id && p.customer_qbo_id)
  ).length;
  const collisionCount = proposed.missing.filter((p) => collisionFor(p)).length;

  // Bulk prefix override: if all proposed docs share a prefix (everything
  // before "-SUB-N"/"-SVC-N"/"-OTHER-N"), expose it as a single input so the
  // user can rewrite it once and have all rows follow.
  const commonPrefix = (() => {
    const prefixes = proposed.missing.map((p) => p.doc_number.replace(/-(SUB|SVC|OTHER)-\d+$/i, ""));
    if (prefixes.length === 0) return null;
    const first = prefixes[0];
    return prefixes.every((p) => p === first) ? first : null;
  })();
  const [prefixOverride, setPrefixOverride] = useState<string>("");
  function applyPrefixOverride(newPrefix: string) {
    setPrefixOverride(newPrefix);
    if (!commonPrefix) return;
    const next: Record<string, string> = {};
    for (const p of proposed.missing) {
      const suffix = p.doc_number.slice(commonPrefix.length); // e.g. "-SUB-3"
      next[p.doc_number] = `${newPrefix}${suffix}`;
    }
    setEditedDocs(next);
  }

  async function pushAll() {
    if (pushable.length === 0) return;
    try {
      const resp = await create.mutateAsync(pushable.map((p) => ({
        doc_number: finalDoc(p),
        txn_date: finalDate(p),
        description: finalDesc(p),
        amount: finalAmount(p),
        dr_account_qbo_id: p.dr_account_qbo_id!,
        cr_account_qbo_id: p.cr_account_qbo_id!,
        customer_qbo_id: p.customer_qbo_id!,
        currency: line.currency ?? undefined,
      })));
      const map: typeof results = {};
      for (const r of resp.results) {
        map[r.doc_number] = { success: r.success, qbo_id: r.qbo_id, error: r.error };
      }
      setResults(map);
      // Explicit, scannable feedback so the user knows EXACTLY what hit QBO.
      const createdLines = resp.results
        .filter((r) => r.success)
        .map((r) => `${r.doc_number} → QBO id ${r.qbo_id}`)
        .join("\n");
      const failedLines = resp.results
        .filter((r) => !r.success)
        .map((r) => `${r.doc_number}: ${r.error}`)
        .join("\n");
      if (resp.failed === 0) {
        toast.success(`✅ Created ${resp.created} JE${resp.created === 1 ? "" : "s"} in QuickBooks\n${createdLines}`);
      } else if (resp.created === 0) {
        toast.error(`❌ All ${resp.failed} JE${resp.failed === 1 ? "" : "s"} failed:\n${failedLines}`);
      } else {
        toast.error(`⚠️ ${resp.created} created, ${resp.failed} failed.\nCreated:\n${createdLines}\nFailed:\n${failedLines}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to call QBO: ${msg}`);
    }
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const accountLabel = (id: string | null) =>
    id ? (accountNameById.get(id) ?? `acct ${id}`) : <span className="text-rose-500">not configured</span>;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-3">
      <div
        ref={ref}
        className="w-[95vw] max-h-[92vh] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Proposed recognition JEs</div>
            <div className="text-xs text-zinc-500">
              {line.doc_number} · {customerName} · {formatMoney(line.amount)} ÷ {proposed.totalMonths} months ={" "}
              <span className="tabular-nums font-medium">{formatMoney(proposed.monthlyAmount)}</span>/mo
            </div>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
            Live · Push to QuickBooks creates JEs in QBO
          </span>
        </div>
        {proposed.source === "inferred" && (
          <div className="px-5 py-2 text-[11px] bg-sky-50 dark:bg-sky-950 border-b border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300">
            ℹ️ No recognition period set on this line — periods inferred from the {proposed.expected.filter((p) => p.isExisting).length} existing matched JE(s).
            Set the Period explicitly for a more reliable plan.
          </div>
        )}
        {commonPrefix && (
          <div className="px-5 py-2 text-[11px] bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500">Doc # prefix:</span>
            <input
              type="text"
              value={prefixOverride || commonPrefix}
              onChange={(e) => applyPrefixOverride(e.target.value)}
              placeholder={commonPrefix}
              className="text-xs font-mono px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-40"
            />
            <span className="text-zinc-500">→ rows become</span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{prefixOverride || commonPrefix}-SUB/SVC/OTHER-N</span>
            {prefixOverride && prefixOverride !== commonPrefix && (
              <button
                onClick={() => { setPrefixOverride(""); setEditedDocs({}); }}
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900"
              >
                Reset
              </button>
            )}
          </div>
        )}

        <div className="overflow-auto flex-1">
          <table className="text-xs min-w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 sticky top-0">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Doc # / Memo</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Line 1 · CR (Revenue)</th>
                <th className="px-3 py-2 text-left font-medium">Line 2 · DR (Deferred)</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {proposed.expected.map((p) => {
                const editable = !p.isExisting && !results[finalDoc(p)]?.success;
                const skip = isSkipped(p);
                return (
                <tr key={p.period_index} className={cn(
                  "border-b border-zinc-100 dark:border-zinc-900",
                  p.isExisting && "bg-zinc-50 dark:bg-zinc-950 text-zinc-500",
                  skip && "opacity-50",
                )}>
                  <td className="px-3 py-1.5 tabular-nums">{p.period_index}</td>
                  <td className="px-3 py-1.5">
                    {!editable ? (
                      <span className="font-mono">{finalDoc(p)}</span>
                    ) : (
                      <input
                        type="text"
                        value={finalDoc(p)}
                        onChange={(e) => setEditedDocs((prev) => ({ ...prev, [p.doc_number]: e.target.value }))}
                        className="font-mono text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-40"
                        title="Edit before pushing — this is what becomes the QBO DocNumber"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {!editable ? (
                      formatDate(p.txn_date)
                    ) : (
                      <input
                        type="date"
                        value={finalDate(p)}
                        onChange={(e) => setEditedDates((prev) => ({ ...prev, [p.doc_number]: e.target.value }))}
                        className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        title="QBO TxnDate"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 max-w-[180px] truncate" title={customerName}>{customerName}</td>
                  <td className="px-3 py-1.5 min-w-[300px]">
                    {!editable ? (
                      <span title={p.description}>{p.description}</span>
                    ) : (
                      <input
                        type="text"
                        value={finalDesc(p)}
                        onChange={(e) => setEditedDescs((prev) => ({ ...prev, [p.doc_number]: e.target.value }))}
                        className="w-full text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        title="JE PrivateNote / line description"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {!editable ? (
                      formatMoney(p.amount)
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={editedAmounts[p.doc_number] ?? p.amount.toString()}
                        onChange={(e) => setEditedAmounts((prev) => ({ ...prev, [p.doc_number]: e.target.value }))}
                        className="w-24 text-xs text-right px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 tabular-nums"
                        title="Amount posted to QBO"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5">{accountLabel(p.cr_account_qbo_id)}</td>
                  <td className="px-3 py-1.5">{accountLabel(p.dr_account_qbo_id)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                    {(() => {
                      const collision = collisionFor(p);
                      if (p.isExisting) {
                        return (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                            already in QBO
                          </span>
                        );
                      }
                      if (skip) {
                        return (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 line-through">
                            skipped
                          </span>
                        );
                      }
                      if (results[finalDoc(p)]?.success) {
                        return (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                            title={`QBO id: ${results[finalDoc(p)].qbo_id}`}
                          >
                            ✅ created · id {results[finalDoc(p)].qbo_id}
                          </span>
                        );
                      }
                      if (results[finalDoc(p)]?.success === false) {
                        return (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                            title={results[finalDoc(p)].error}
                          >
                            ❌ failed
                          </span>
                        );
                      }
                      if (collision) {
                        return (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                            title={`Doc# ${finalDoc(p)} already exists in QBO (${collision.customer_name ?? "?"} · qbo id ${collision.qbo_id}). Pick a different doc# to avoid creating a duplicate.`}
                          >
                            ⚠️ collision · doc# exists
                          </span>
                        );
                      }
                      return (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                          will create
                        </span>
                      );
                    })()}
                    {editable && (
                      <button
                        onClick={() => setSkipped((prev) => ({ ...prev, [p.doc_number]: !prev[p.doc_number] }))}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-white dark:hover:bg-zinc-900"
                        title={skip ? "Include this JE" : "Skip — don't create this JE"}
                      >
                        {skip ? "↶ undo" : "✕ skip"}
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-zinc-500">
            <strong className="text-zinc-700 dark:text-zinc-300">{pushable.length}</strong> to create ·{" "}
            <strong className="text-zinc-700 dark:text-zinc-300">{proposed.expected.length - proposed.missing.length}</strong> already exist
            {blockedCount > 0 && (
              <> · <span className="text-rose-600 dark:text-rose-400">{blockedCount} blocked</span> (missing account/customer)</>
            )}
            {collisionCount > 0 && (
              <> · <span className="text-rose-600 dark:text-rose-400">{collisionCount} doc# collision</span> (rename to avoid duplicates)</>
            )}
          </span>
          <button
            onClick={pushAll}
            disabled={create.isPending || pushable.length === 0}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              pushable.length === 0
                ? "Nothing to push — fix any blocked rows above first"
                : `POST ${pushable.length} JE${pushable.length === 1 ? "" : "s"} to QuickBooks`
            }
          >
            {create.isPending
              ? `⏳ Pushing ${pushable.length} JE${pushable.length === 1 ? "" : "s"}…`
              : `🚀 Push ${pushable.length} JE${pushable.length === 1 ? "" : "s"} to QuickBooks`}
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function snapToLastOfMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  // Day 0 of next month = last day of this month.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

// Compact "DD MMM YY" used in the Period cell's secondary line so the raw
// extracted dates fit alongside the month-range summary.
function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatPeriodCompact(startIso: string, endIso: string): string {
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth) {
    return s.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (sameYear) {
    const sm = s.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    const em = e.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
    return `${sm} – ${em}`;
  }
  const sm = s.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  const em = e.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return `${sm} – ${em}`;
}

function formatJeMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function CustomerSummaryRows({
  invoice,
  je,
  gridColumns,
  colWidths,
  lefts,
}: {
  invoice: { total: number; byMonth: Record<string, number> };
  je: { total: number; byMonth: Record<string, number> };
  gridColumns: GridCol[];
  colWidths: Record<ColId, number>;
  lefts: Record<ColId, number>;
}) {
  const totalIsProblem = Math.abs(invoice.total - je.total) >= 0.01;
  // Per-month variance highlighting on the Invoiced row. Only flag when the
  // customer total itself is out of balance — otherwise per-month differences
  // are EXPECTED: a $2,010 subscription invoice in Oct with 3-month
  // recognition is Invoiced $2,010 Oct / Recognised $670 Oct+Nov+Dec. That's
  // not a problem; the window reconciles. A blind `inv[k] !== rec[k]` check
  // fires on every subscription and is actively misleading.
  const monthIsProblem = (k: string): boolean => {
    if (!totalIsProblem) return false;
    const inv = invoice.byMonth[k] ?? 0;
    const r = je.byMonth[k] ?? 0;
    return Math.abs(inv - r) >= 0.01 && Math.abs(inv) >= 0.01;
  };
  const labelLeft = lefts.net;
  const rows = [
    { label: "Invoiced",   bucket: invoice, tone: "invoice" as const },
    { label: "Recognised", bucket: je,      tone: "je"      as const },
  ];
  return (
    <>
      {rows.map((r) => {
        const bg = r.tone === "invoice" ? "bg-zinc-50 dark:bg-zinc-950" : "bg-sky-50 dark:bg-sky-950";
        const text = r.tone === "invoice"
          ? "text-zinc-700 dark:text-zinc-300"
          : "text-sky-700 dark:text-sky-300";
        return (
          <tr key={r.label} className="text-[11px]">
            <td
              colSpan={7}
              className={cn("px-2 py-1 text-right sticky z-10 font-medium", bg, text)}
              style={{ left: 0, width: labelLeft, minWidth: labelLeft, maxWidth: labelLeft }}
            >
              {r.label}
            </td>
            <td
              className={cn(
                "px-2 py-1 text-right tabular-nums sticky z-10 border-r border-zinc-200 dark:border-zinc-800 font-medium",
                r.tone === "invoice" && totalIsProblem ? "bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200" : `${bg} ${text}`,
              )}
              style={{ left: lefts.net, width: colWidths.net, minWidth: colWidths.net, maxWidth: colWidths.net }}
              title={r.tone === "invoice" && totalIsProblem ? `Variance vs Recognised: ${formatMoney(invoice.total - je.total)}` : undefined}
            >
              {formatMoney(r.bucket.total)}
            </td>
            {gridColumns.map((c) => {
              if (c.kind === "month") {
                const m = c.m;
                const v = r.bucket.byMonth[m.key];
                const problem = r.tone === "invoice" && monthIsProblem(m.key);
                return (
                  <td
                    key={m.key}
                    className={cn(
                      "px-2 py-1 text-right tabular-nums",
                      problem ? "bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200 font-medium" : cn(bg, text),
                    )}
                    title={problem ? `Invoiced ${formatMoney(invoice.byMonth[m.key] ?? 0)} vs Recognised ${formatMoney(je.byMonth[m.key] ?? 0)}` : undefined}
                  >
                    {v ? formatMoney(v) : "—"}
                  </td>
                );
              }
              // FY-total: sum the bucket across FY months. Highlight rose when
              // at least one month in the FY has a customer-level variance
              // (Invoiced row only — matches the per-month rule).
              const fySum = sumByKeys(r.bucket.byMonth, c.monthKeys);
              const fyHasProblem = r.tone === "invoice" && c.monthKeys.some((k) => monthIsProblem(k));
              return (
                <td
                  key={`fyt-${c.fy}`}
                  className={cn(
                    "px-2 py-1 text-right tabular-nums border-l-2 border-l-zinc-300 dark:border-l-zinc-700 font-medium bg-zinc-100 dark:bg-zinc-900",
                    fyHasProblem ? "text-rose-800 dark:text-rose-200" : text,
                  )}
                >
                  {fySum ? formatMoney(fySum) : "—"}
                </td>
              );
            })}
            <td className={cn("px-2 py-1 text-right tabular-nums font-medium", bg, text)}>
              {formatMoney(r.bucket.total)}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function ReviewedPill() {
  return (
    <span
      title="JE attribution locked in. These JEs are pinned to this invoice line via override."
      className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-600 dark:bg-emerald-700 text-white whitespace-nowrap"
    >
      🔒 Reviewed
    </span>
  );
}

function AdjustmentPill() {
  return (
    <span
      title="Late / back-billed invoice — revenue was already recognised elsewhere. No JEs expected."
      className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-violet-600 dark:bg-violet-700 text-white whitespace-nowrap"
    >
      📌 Adjustment
    </span>
  );
}

function JeStatusBadge({ count, variance }: { count: number; variance: number }) {
  if (count === 0) {
    return (
      <span
        title="No JEs matched"
        className="text-[9px] px-1 py-0.5 rounded font-medium bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
      >
        — 0 JE
      </span>
    );
  }
  const ties = Math.abs(variance) < 0.01;
  return (
    <span
      title={ties ? `${count} JEs · ties to invoice` : `${count} JEs · variance ${formatMoney(variance)}`}
      className={cn(
        "text-[9px] px-1 py-0.5 rounded font-medium",
        ties
          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
      )}
    >
      {ties ? "✓" : "!"} {count} JE
    </span>
  );
}

function TypePill({ type, muted }: { type: "SUB" | "SVC" | "OTHER"; muted?: boolean }) {
  const tones = {
    SUB: muted
      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
      : "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    SVC: muted
      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
      : "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300",
    OTHER: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", tones[type])}>
      {type}
    </span>
  );
}

interface TypedTotals {
  total: number;
  byMonth: Record<string, number>;
}
interface PeriodTotals {
  invoice: { all: TypedTotals; sub: TypedTotals; svc: TypedTotals };
  je: { all: TypedTotals; sub: TypedTotals; svc: TypedTotals };
  // Subset of `invoice` covering ONLY lines that don't reconcile (no matched
  // JEs OR matched-JE total ≠ invoice line amount). Bucketed by the line's
  // own txn_date month — this is the "money invoiced that hasn't been turned
  // into JEs yet" metric. Reviewed lines and $0 lines are excluded since the
  // user has signed off / there's nothing to recognize.
  problem: { all: TypedTotals; sub: TypedTotals; svc: TypedTotals };
}

function emptyTyped(): TypedTotals { return { total: 0, byMonth: {} }; }

function computePeriodTotals(
  groups: { lines: InvoiceLineWithRecognition[]; header: InvoiceLineWithRecognition }[],
  matchPlan: MatchPlan,
  months: MonthCol[],
): PeriodTotals {
  const invoice = { all: emptyTyped(), sub: emptyTyped(), svc: emptyTyped() };
  const je = { all: emptyTyped(), sub: emptyTyped(), svc: emptyTyped() };
  const problem = { all: emptyTyped(), sub: emptyTyped(), svc: emptyTyped() };
  const monthKeys = new Set(months.map((m) => m.key));
  const seenJes = new Set<string>();

  function add(bucket: TypedTotals, amt: number, month: string | null) {
    bucket.total += amt;
    if (month && monthKeys.has(month)) bucket.byMonth[month] = (bucket.byMonth[month] ?? 0) + amt;
  }

  for (const g of groups) {
    for (const line of g.lines) {
      const amt = Number(line.amount ?? 0);
      const k = monthKeyOf(line.txn_date);
      const eff = line.line_type ?? classifyLineType(line.item_ref);
      add(invoice.all, amt, k);
      // Bucket SUB separately; SVC + OTHER combined as "services" — matches
      // the Both/Subscription/Services filter pills in the header.
      if (eff === "SUB") add(invoice.sub, amt, k);
      else add(invoice.svc, amt, k);

      const lineKey = `${line.qbo_invoice_id}-${line.qbo_line_id}`;
      const matched = matchPlan.byLineKey.get(lineKey) ?? [];
      let lineJeTotal = 0;
      for (const j of matched) {
        const ja = Number(j.amount ?? 0);
        lineJeTotal += ja;
        if (seenJes.has(j.qbo_id)) continue;
        seenJes.add(j.qbo_id);
        const jk = monthKeyOf(j.txn_date);
        add(je.all, ja, jk);
        if (eff === "SUB") add(je.sub, ja, jk);
        else add(je.svc, ja, jk);
      }

      // Problem state: skip $0 lines, reviewed lines, and adjustment lines
      // (matches the per-row hasProblem rule).
      const isReviewed = line.is_reviewed;
      const isAdjustment = line.accepted_as_adjustment;
      const lineHasProblem = amt !== 0 && !isReviewed && !isAdjustment
        && (matched.length === 0 || Math.abs(amt - lineJeTotal) >= 0.01);
      if (lineHasProblem) {
        add(problem.all, amt, k);
        if (eff === "SUB") add(problem.sub, amt, k);
        else add(problem.svc, amt, k);
      }
    }
  }

  // Standalone adjustment JEs — count toward Recognised totals even though
  // they have no invoice line (pre-cutover migrations, manual adjustments).
  for (const j of matchPlan.standalone) {
    if (seenJes.has(j.qbo_id)) continue;
    seenJes.add(j.qbo_id);
    const ja = Number(j.amount ?? 0);
    const jk = monthKeyOf(j.txn_date);
    const jtype = j.type ?? "OTHER";
    add(je.all, ja, jk);
    if (jtype === "SUB") add(je.sub, ja, jk);
    else add(je.svc, ja, jk);
  }

  return { invoice, je, problem };
}

// ─── Central JE → invoice line matcher ────────────────────────────────────
//
// Three-pass attribution:
//   1. Overrides — user explicitly assigned (or marked as ignored)
//   2. Strong — doc_number prefix matches AND customer matches AND (if window) JE in window
//   3. Fuzzy — customer + window + amount within tolerance, only if exactly one candidate
//
// Each JE attaches to at most one invoice line. Anything still unattached
// after all 3 passes is returned in `unmatched` so the UI can surface it for
// manual assignment.
//
// Match attribution is a per-JE choice (not per-line), so we don't double-
// count any JE.

interface MatchPlan {
  byLineKey: Map<string, ParsedRecognitionJe[]>;
  unmatched: ParsedRecognitionJe[];
  ignored: ParsedRecognitionJe[];
  // JEs flagged via override notes='STANDALONE' — no invoice line to
  // reconcile against (typically pre-cutover invoices migrated as aggregate),
  // but they still count toward monthly Recognised totals.
  standalone: ParsedRecognitionJe[];
  // Diagnostic info per attribution
  attribution: Map<string, { lineKey: string; mode: "override" | "strong" | "fuzzy" }>;
}

function buildMatchPlan(args: {
  groups: { header: InvoiceLineWithRecognition; lines: InvoiceLineWithRecognition[] }[];
  jes: ParsedRecognitionJe[];
  overrides: JeOverride[];
  accountConfig: FyAccountConfig | null;
}): MatchPlan {
  const { groups, jes, overrides } = args;
  const byLineKey = new Map<string, ParsedRecognitionJe[]>();
  const attribution = new Map<string, { lineKey: string; mode: "override" | "strong" | "fuzzy" }>();
  const claimed = new Set<string>();
  const ignoredIds = new Set<string>();
  // JEs the user has explicitly "unassigned" — we must NOT let auto-match
  // re-grab them, and they should surface in the Unmatched JEs list.
  const unassignedIds = new Set<string>();
  // JEs marked as standalone adjustments — no invoice line, but still count
  // toward monthly Recognised totals.
  const standaloneIds = new Set<string>();

  // Index lines for quick lookup.
  const lineByKey = new Map<string, { line: InvoiceLineWithRecognition; docPrefix: string }>();
  for (const g of groups) {
    const docPrefix = g.header.doc_number ?? "";
    for (const line of g.lines) {
      lineByKey.set(`${line.qbo_invoice_id}-${line.qbo_line_id}`, { line, docPrefix });
    }
  }

  function attribute(je: ParsedRecognitionJe, lineKey: string, mode: "override" | "strong" | "fuzzy") {
    const arr = byLineKey.get(lineKey) ?? [];
    arr.push(je);
    byLineKey.set(lineKey, arr);
    claimed.add(je.qbo_id);
    attribution.set(je.qbo_id, { lineKey, mode });
  }

  // Pass 1 — overrides take precedence.
  const overrideByJeId = new Map<string, JeOverride>();
  for (const o of overrides) overrideByJeId.set(o.qbo_je_id, o);
  for (const je of jes) {
    const o = overrideByJeId.get(je.qbo_id);
    if (!o) continue;
    if (o.qbo_invoice_id == null || o.qbo_line_id == null) {
      // Null override — three flavors distinguished by notes:
      //   notes='IGNORE'     → suppress from auto-match AND from Unmatched list
      //                        (and does NOT count toward Recognised totals)
      //   notes='STANDALONE' → suppress from auto-match, remove from Unmatched,
      //                        surface as an adjustment JE that still counts
      //                        toward Recognised totals
      //   notes='UNASSIGN'   → suppress from auto-match; surface in Unmatched
      //                        list so user can reassign elsewhere.
      // Everything else is treated as UNASSIGN (safe default).
      unassignedIds.add(je.qbo_id);
      if (o.notes === "IGNORE") {
        ignoredIds.add(je.qbo_id);
        claimed.add(je.qbo_id);
      } else if (o.notes === "STANDALONE") {
        standaloneIds.add(je.qbo_id);
        claimed.add(je.qbo_id);
      }
      continue;
    }
    const lineKey = `${o.qbo_invoice_id}-${o.qbo_line_id}`;
    if (!lineByKey.has(lineKey)) continue; // target line not in current view
    attribute(je, lineKey, "override");
  }

  // Pass 2 — strong: prefix + customer + (if window) within window.
  for (const je of jes) {
    if (claimed.has(je.qbo_id)) continue;
    if (unassignedIds.has(je.qbo_id)) continue;
    if (!je.prefix || !je.type) continue;
    const candidates: { lineKey: string; line: InvoiceLineWithRecognition; score: number }[] = [];
    for (const [lineKey, { line, docPrefix }] of lineByKey) {
      if (!sameCustomer(je, line)) continue;
      const eff = line.line_type ?? classifyLineType(line.item_ref);
      if (eff !== je.type) continue;
      const variants = prefixVariants(docPrefix);
      const matchIdx = variants.indexOf(je.prefix);
      if (matchIdx === -1) continue;
      const window = inferRecognitionWindow(line);
      if (window && !withinWindow(je.txn_date, window)) continue;
      // Score:
      //   - exact-prefix beats fallback (matchIdx 0 is full doc#, 1+ is stripped)
      //   - window inclusion beats no-window
      //   - among lines that all include the JE date, prefer the line whose
      //     window starts CLOSER to the JE date — this breaks the common tie
      //     when sibling invoices (e.g. 1095-1, 1095-2) share a fallback
      //     prefix variant. Without this, sort-stability hands the JE to
      //     whichever line was indexed first, which often isn't the right one.
      let score = 100 - matchIdx * 10;
      if (window) {
        score += 50;
        const dayMs = 86_400_000;
        const daysFromStart = Math.abs(
          (new Date(je.txn_date + "T00:00:00Z").getTime() -
            new Date(window.start + "T00:00:00Z").getTime()) / dayMs,
        );
        // Subtract a sub-1 fraction so this never overrides prefix/window
        // tier ordering — only acts as a tie-breaker.
        score -= Math.min(daysFromStart, 9999) / 10000;
      }
      candidates.push({ lineKey, line, score });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.score - a.score);
    attribute(je, candidates[0].lineKey, "strong");
  }

  // Pass 3 — fuzzy: customer + window + amount, only if exactly one
  // candidate within tolerance (avoids false attribution).
  for (const je of jes) {
    if (claimed.has(je.qbo_id)) continue;
    if (unassignedIds.has(je.qbo_id)) continue;
    const candidates: { lineKey: string; diff: number }[] = [];
    for (const [lineKey, { line }] of lineByKey) {
      if (!sameCustomer(je, line)) continue;
      const window = inferRecognitionWindow(line);
      if (!window) continue;
      if (!withinWindow(je.txn_date, window)) continue;
      const months = computeMonthsBetween(line.recog_start ?? window.start, line.recog_end ?? window.end);
      const expected = months > 0 ? Number(line.amount) / months : Number(line.amount);
      const diff = Math.abs(je.amount - expected);
      const tolerance = Math.max(5, expected * 0.05); // 5% or $5
      if (diff > tolerance) continue;
      candidates.push({ lineKey, diff });
    }
    if (candidates.length !== 1) continue; // only attribute if unambiguous
    attribute(je, candidates[0].lineKey, "fuzzy");
  }

  // Sort each line's JEs by date.
  for (const arr of byLineKey.values()) {
    arr.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  }

  const unmatched: ParsedRecognitionJe[] = [];
  const ignored: ParsedRecognitionJe[] = [];
  const standalone: ParsedRecognitionJe[] = [];
  for (const je of jes) {
    if (ignoredIds.has(je.qbo_id)) ignored.push(je);
    else if (standaloneIds.has(je.qbo_id)) standalone.push(je);
    else if (!claimed.has(je.qbo_id)) unmatched.push(je);
  }
  unmatched.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  standalone.sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  return { byLineKey, unmatched, ignored, standalone, attribution };
}

function prefixVariants(docNumber: string): string[] {
  if (!docNumber) return [];
  const out = [docNumber];
  let stripped = docNumber;
  while (stripped.includes("-")) {
    stripped = stripped.replace(/-[^-]+$/, "");
    if (stripped) out.push(stripped);
  }
  return out;
}

function computeMonthsBetween(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  return Math.max(0,
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth()) + 1,
  );
}

function sameCustomer(je: ParsedRecognitionJe, line: InvoiceLineWithRecognition): boolean {
  // If either side lacks a customer ref, accept the match (defensive — some
  // older JEs don't have an Entity ref, and we don't want to drop them).
  if (!je.customer_qbo_id || !line.customer_qbo_id) return true;
  return je.customer_qbo_id === line.customer_qbo_id;
}

interface RecogWindow { start: string; end: string; source: "annotated" | "description" }

function inferRecognitionWindow(line: InvoiceLineWithRecognition): RecogWindow | null {
  if (line.recog_start && line.recog_end) {
    return { start: line.recog_start, end: line.recog_end, source: "annotated" };
  }
  const fromDesc = parseDescriptionDateRange(line.description ?? "");
  if (fromDesc) return { ...fromDesc, source: "description" };
  return null;
}

function withinWindow(iso: string, w: RecogWindow): boolean {
  // Asymmetric grace + month-end snap. Window starts exactly on `start` (you
  // don't recognise revenue *before* a period begins). On the trailing side,
  // we extend the end to the last day of its calendar month, so a window
  // ending mid-month (e.g. Mar 15) still catches the month-end JE (Mar 31).
  // This decouples the matcher from the user's exact end day — they can keep
  // raw billing-period dates without losing JEs.
  return iso >= w.start && iso <= snapToLastOfMonth(w.end);
}

// Heuristic parser for date ranges in invoice line descriptions.
// Returns ISO date strings on success.
const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function parseDescriptionDateRange(text: string): { start: string; end: string } | null {
  if (!text) return null;
  const norm = text.replace(/\s+/g, " ").trim();

  // Pattern A: "DD MMM YYYY - DD MMM YYYY" — both dates fully qualified.
  const fullDate = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\s*(?:[-–—]|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/;
  const mA = norm.match(fullDate);
  if (mA) {
    const s = isoFromParts(mA[1], mA[2], mA[3]);
    const e = isoFromParts(mA[4], mA[5], mA[6]);
    if (s && e) return { start: s, end: e };
  }

  // Pattern B: "DD MMM - DD MMM YYYY" — year only on the end date.
  // Matches "1 Sep - 30 Sep 2023".
  const dayMonthRange = /(\d{1,2})\s+([A-Za-z]{3,9})\s*(?:[-–—]|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/;
  const mB = norm.match(dayMonthRange);
  if (mB) {
    const year = mB[5];
    const s = isoFromParts(mB[1], mB[2], year);
    const e = isoFromParts(mB[3], mB[4], year);
    if (s && e) return { start: s, end: e };
  }

  // Pattern C: "DD - DD MMM YYYY" — single month, day range.
  // Matches "1 - 31 October 2023" (also when wrapped in parens).
  const dayRangeOneMonth = /(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/;
  const mC = norm.match(dayRangeOneMonth);
  if (mC) {
    const s = isoFromParts(mC[1], mC[3], mC[4]);
    const e = isoFromParts(mC[2], mC[3], mC[4]);
    if (s && e) return { start: s, end: e };
  }

  // Pattern D: "MMM YYYY - MMM YYYY" — no day, two fully-qualified months.
  const monthRange = /([A-Za-z]{3,9})\s+(\d{2,4})\s*(?:[-–—]|to)\s*([A-Za-z]{3,9})\s+(\d{2,4})/;
  const mD = norm.match(monthRange);
  if (mD) {
    const s = isoFromParts("1", mD[1], mD[2]);
    const e = lastDayIso(mD[3], mD[4]);
    if (s && e) return { start: s, end: e };
  }

  // Pattern E: "MMM - MMM YYYY" — year only at end. "Aug - Oct 2023".
  const monthMonthRange = /([A-Za-z]{3,9})\s*(?:[-–—]|to)\s*([A-Za-z]{3,9})\s+(\d{2,4})/;
  const mE = norm.match(monthMonthRange);
  if (mE && monthIndex(mE[1]) >= 0 && monthIndex(mE[2]) >= 0) {
    const year = mE[3];
    const s = isoFromParts("1", mE[1], year);
    const e = lastDayIso(mE[2], year);
    if (s && e) return { start: s, end: e };
  }

  // Pattern F: "from MMM to MMM YYYY".
  const fromTo = /from\s+([A-Za-z]{3,9})\s+(?:to|[-–—])\s+([A-Za-z]{3,9})\s+(\d{2,4})/i;
  const mF = norm.match(fromTo);
  if (mF) {
    const s = isoFromParts("1", mF[1], mF[3]);
    const e = lastDayIso(mF[2], mF[3]);
    if (s && e) return { start: s, end: e };
  }

  return null;
}

function monthIndex(name: string): number {
  const i = MONTH_INDEX[name.toLowerCase()];
  return i === undefined ? -1 : i;
}

function fullYear(yy: string): number {
  const n = parseInt(yy, 10);
  if (n >= 100) return n;
  return n >= 50 ? 1900 + n : 2000 + n;
}

function isoFromParts(day: string, monthName: string, year: string): string | null {
  const mi = monthIndex(monthName);
  if (mi < 0) return null;
  const y = fullYear(year);
  const d = parseInt(day, 10);
  if (!d || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mi, d));
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function lastDayIso(monthName: string, year: string): string | null {
  const mi = monthIndex(monthName);
  if (mi < 0) return null;
  const y = fullYear(year);
  const date = new Date(Date.UTC(y, mi + 1, 0));
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function extendDate(iso: string, monthsAhead: number): string {
  // Defensive: a date <input> can be momentarily empty or partial as the user
  // types (e.g. "2025-08-" between digits). new Date("") is invalid → .toISOString()
  // throws RangeError → blank screen. Fall back to the original string so the
  // caller's queries get a stable (if narrow) range until typing settles.
  if (!iso) return iso;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsAhead, d.getUTCDate()));
  if (Number.isNaN(out.getTime())) return iso;
  return out.toISOString().slice(0, 10);
}
