import { useMemo, useState } from "react";
import {
  useFetchReportPeriod,
  useQboReport,
  useTriggerReportsSync,
} from "../../hooks/finance";
import type {
  CustomReportPeriod,
  PeriodLabel,
  QboReportPayload,
  QboReportRow,
  ReportType,
} from "../../hooks/finance";
import { cn } from "../../lib/cn";
import { RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Report + period configuration
// ---------------------------------------------------------------------------

const REPORT_TABS: { id: ReportType; label: string }[] = [
  { id: "ProfitAndLoss", label: "P&L" },
  { id: "BalanceSheet", label: "Balance sheet" },
  { id: "CashFlow", label: "Cash flow" },
  { id: "AgedReceivables", label: "Aged AR" },
  { id: "AgedPayables", label: "Aged AP" },
];

interface PeriodOption {
  label: PeriodLabel;
  title: string;
  /** Derivation of period.start/end; always returns an explicit range. */
  range: (today: Date) => { start: string; end: string };
  /** When false, treated as a date-range report; when true, point-in-time. */
  pointInTimeHint?: boolean;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Fiscal year config — must match qbo-sync-reports edge function.
// ThinkVAL's FY runs August → July. Change here + in edge fn if FY changes.
const FY_START_MONTH = 8; // 1-indexed

function fiscalYearStart(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const fyYear = m >= FY_START_MONTH ? y : y - 1;
  return new Date(Date.UTC(fyYear, FY_START_MONTH - 1, 1));
}

function fiscalQuarterStart(date: Date): Date {
  const fyStart = fiscalYearStart(date);
  const monthsSinceFyStart =
    (date.getUTCFullYear() - fyStart.getUTCFullYear()) * 12 +
    (date.getUTCMonth() - fyStart.getUTCMonth());
  const quarterIndex = Math.floor(monthsSinceFyStart / 3);
  return new Date(Date.UTC(fyStart.getUTCFullYear(), fyStart.getUTCMonth() + quarterIndex * 3, 1));
}

/** The FY identifier a given FY-start date belongs to (e.g. 2025 for FY2025 starting Aug 2024). */
function fyYearLabel(fyStart: Date): number {
  return fyStart.getUTCFullYear() + 1;
}

function builtInPeriods(): PeriodOption[] {
  return [
    {
      label: "mtd",
      title: "Month to date",
      range: (t) => ({ start: toISO(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), end: toISO(t) }),
    },
    {
      label: "ytd",
      title: "FY to date",
      range: (t) => ({ start: toISO(fiscalYearStart(t)), end: toISO(t) }),
    },
    {
      label: "last_month",
      title: "Last month",
      range: (t) => {
        const y = t.getUTCFullYear();
        const m = t.getUTCMonth();
        return {
          start: toISO(new Date(Date.UTC(y, m - 1, 1))),
          end: toISO(new Date(Date.UTC(y, m, 0))),
        };
      },
    },
    {
      label: "last_quarter",
      title: "Last FY quarter",
      range: (t) => {
        const cq = fiscalQuarterStart(t);
        const start = new Date(Date.UTC(cq.getUTCFullYear(), cq.getUTCMonth() - 3, 1));
        const end = new Date(Date.UTC(cq.getUTCFullYear(), cq.getUTCMonth(), 0));
        return { start: toISO(start), end: toISO(end) };
      },
    },
    {
      label: "prior_year",
      title: "Prior FY",
      range: (t) => {
        const fyStart = fiscalYearStart(t);
        const priorStart = new Date(Date.UTC(fyStart.getUTCFullYear() - 1, FY_START_MONTH - 1, 1));
        const priorEnd = new Date(Date.UTC(fyStart.getUTCFullYear(), FY_START_MONTH - 1, 0));
        return { start: toISO(priorStart), end: toISO(priorEnd) };
      },
    },
  ];
}

/** Five most recent fiscal years (current + 4 prior), using ThinkVAL's Aug-Jul FY. */
function fiscalYears(): PeriodOption[] {
  const today = new Date();
  const currentFyStart = fiscalYearStart(today);
  return Array.from({ length: 5 }, (_, i) => {
    const fyStart = new Date(Date.UTC(
      currentFyStart.getUTCFullYear() - i,
      FY_START_MONTH - 1,
      1,
    ));
    const fyEnd = new Date(Date.UTC(
      currentFyStart.getUTCFullYear() - i + 1,
      FY_START_MONTH - 1,
      0,
    ));
    const yearLabel = fyYearLabel(fyStart);
    return {
      label: `fy_${yearLabel}` as PeriodLabel,
      title: `FY ${yearLabel}`,
      range: () => ({ start: toISO(fyStart), end: toISO(fyEnd) }),
    };
  });
}

function isPointInTime(reportType: ReportType): boolean {
  return (
    reportType === "BalanceSheet" ||
    reportType === "AgedReceivables" ||
    reportType === "AgedPayables"
  );
}

function customLabelFor(start: string, end: string, pointInTime: boolean): PeriodLabel {
  return pointInTime
    ? `custom_asof_${end}`
    : `custom_${start}_${end}`;
}

// ---------------------------------------------------------------------------
// Number parsing
// ---------------------------------------------------------------------------

function fmtCell(value: string | undefined, colType?: string): string {
  if (value == null || value === "") return "";
  if (colType === "Money" || /^-?\d+(\.\d+)?$/.test(value)) {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return value;
    return new Intl.NumberFormat("en-SG", {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Recursive row renderer
// ---------------------------------------------------------------------------

function ReportRowView({
  row,
  depth,
  colTypes,
}: {
  row: QboReportRow;
  depth: number;
  colTypes: (string | undefined)[];
}) {
  const isSection = row.type === "Section";
  const header = row.Header?.ColData;
  const summary = row.Summary?.ColData;
  const children = row.Rows?.Row ?? [];

  return (
    <>
      {header && (
        <tr className="bg-zinc-50 dark:bg-zinc-800/30">
          {header.map((c, i) => (
            <td
              key={i}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100",
                i > 0 && "text-right tabular-nums",
              )}
              style={i === 0 ? { paddingLeft: 12 + depth * 14 } : undefined}
            >
              {i === 0 ? c.value ?? "" : fmtCell(c.value, colTypes[i])}
            </td>
          ))}
        </tr>
      )}

      {row.ColData && !isSection && (
        <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
          {row.ColData.map((c, i) => (
            <td
              key={i}
              className={cn(
                "px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 border-b border-zinc-50 dark:border-zinc-800/40",
                i > 0 && "text-right tabular-nums",
              )}
              style={i === 0 ? { paddingLeft: 12 + depth * 14 } : undefined}
            >
              {i === 0 ? c.value ?? "" : fmtCell(c.value, colTypes[i])}
            </td>
          ))}
        </tr>
      )}

      {children.map((child, idx) => (
        <ReportRowView
          key={idx}
          row={child}
          depth={depth + (header ? 1 : 0)}
          colTypes={colTypes}
        />
      ))}

      {summary && (
        <tr className="border-t border-zinc-200 dark:border-zinc-700 font-semibold bg-zinc-100/60 dark:bg-zinc-800/50">
          {summary.map((c, i) => (
            <td
              key={i}
              className={cn(
                "px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100",
                i > 0 && "text-right tabular-nums",
              )}
              style={i === 0 ? { paddingLeft: 12 + depth * 14 } : undefined}
            >
              {i === 0 ? c.value ?? "Total" : fmtCell(c.value, colTypes[i])}
            </td>
          ))}
        </tr>
      )}
    </>
  );
}

function ReportTable({ payload }: { payload: QboReportPayload }) {
  const columns = payload.Columns?.Column ?? [];
  const rows = payload.Rows?.Row ?? [];
  const colTypes = columns.map((c) => c.ColType);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500",
                    i > 0 && "text-right",
                  )}
                >
                  {c.ColTitle}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <ReportRowView key={idx} row={r} depth={0} colTypes={colTypes} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type SelectionMode = "preset" | "custom";

export function ReportsView() {
  const [reportType, setReportType] = useState<ReportType>("ProfitAndLoss");
  const [selection, setSelection] = useState<{ mode: SelectionMode; label: PeriodLabel }>(
    { mode: "preset", label: "mtd" },
  );
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const triggerReports = useTriggerReportsSync();
  const fetchPeriod = useFetchReportPeriod();

  const today = useMemo(() => new Date(), []);
  const presets = useMemo(() => [...builtInPeriods(), ...fiscalYears()], []);
  const presetByLabel = useMemo(
    () => new Map(presets.map((p) => [p.label, p])),
    [presets],
  );

  // Point-in-time reports should auto-remap periods to "as of end date" forms.
  const pointInTime = isPointInTime(reportType);

  const effectiveLabel: PeriodLabel = useMemo(() => {
    if (selection.mode === "custom" && customStart && customEnd) {
      return customLabelFor(customStart, customEnd, pointInTime);
    }
    // Fall back to preset
    return selection.label;
  }, [selection, customStart, customEnd, pointInTime]);

  const { data: report, isLoading, error } = useQboReport(reportType, effectiveLabel);

  const handlePreset = (label: PeriodLabel) => {
    setSelection({ mode: "preset", label });
  };

  const handleFetchCustom = async () => {
    if (!customStart || !customEnd) return;
    const period: CustomReportPeriod = {
      label: customLabelFor(customStart, customEnd, pointInTime),
      start: customStart,
      end: customEnd,
    };
    setSelection({ mode: "custom", label: period.label });
    await fetchPeriod.mutateAsync({ reports: [reportType], period });
  };

  const handleFetchPreset = async () => {
    const preset = presetByLabel.get(selection.label);
    if (!preset) return;
    const range = preset.range(today);
    await fetchPeriod.mutateAsync({
      reports: [reportType],
      period: { label: preset.label, start: range.start, end: range.end },
    });
  };

  return (
    <div className="space-y-4">
      {/* Report type tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-0.5 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setReportType(t.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                reportType === t.id
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => triggerReports.mutate()}
          disabled={triggerReports.isPending}
          className="px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
          title="Refresh all default periods from QBO"
        >
          <RefreshCw size={12} className={triggerReports.isPending ? "animate-spin" : ""} />
          Refresh defaults
        </button>
      </div>

      {/* Period controls */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mr-1">Preset</span>
          {builtInPeriods().map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.label)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded border transition-colors",
                selection.mode === "preset" && selection.label === p.label
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
              )}
            >
              {p.title}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mr-1">Fiscal year</span>
          {fiscalYears().map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.label)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded border transition-colors",
                selection.mode === "preset" && selection.label === p.label
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
              )}
            >
              {p.title}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mr-1">Custom</span>
          {!pointInTime ? (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
              />
              <span className="text-[11px] text-zinc-400">→</span>
            </>
          ) : (
            <span className="text-[11px] text-zinc-500 italic">as of</span>
          )}
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1 text-[11px] border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
          />
          <button
            onClick={handleFetchCustom}
            disabled={(!pointInTime && !customStart) || !customEnd || fetchPeriod.isPending}
            className="px-2.5 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-400 rounded inline-flex items-center gap-1"
          >
            {fetchPeriod.isPending ? "Fetching…" : "Fetch"}
          </button>
        </div>
      </div>

      {/* Meta */}
      {report && (
        <div className="text-[11px] text-zinc-500 flex items-center gap-3 flex-wrap">
          {report.data.Header.ReportBasis && (
            <span>Basis: <strong className="text-zinc-700 dark:text-zinc-300">{report.data.Header.ReportBasis}</strong></span>
          )}
          {report.data.Header.StartPeriod && (
            <span>{report.data.Header.StartPeriod} — {report.data.Header.EndPeriod}</span>
          )}
          {!report.data.Header.StartPeriod && report.data.Header.EndPeriod && (
            <span>As of {report.data.Header.EndPeriod}</span>
          )}
          {report.data.Header.Currency && <span>Currency: {report.data.Header.Currency}</span>}
          <span className="ml-auto">
            Generated {new Date(report.generated_at).toLocaleString()}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {/* Loading */}
      {!error && isLoading && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-sm text-zinc-500">
          Loading report…
        </div>
      )}

      {/* Empty — offer to fetch */}
      {!error && !isLoading && !report && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center space-y-3">
          <div className="text-sm text-zinc-500">
            No snapshot cached for <strong>{reportType}</strong> · <strong>{effectiveLabel}</strong>.
          </div>
          {selection.mode === "preset" && (
            <button
              onClick={handleFetchPreset}
              disabled={fetchPeriod.isPending}
              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-400 rounded-lg"
            >
              {fetchPeriod.isPending ? "Fetching…" : "Fetch from QBO"}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {!error && !isLoading && report && <ReportTable payload={report.data} />}
    </div>
  );
}
