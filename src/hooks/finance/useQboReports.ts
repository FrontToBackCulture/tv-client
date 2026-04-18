import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";

export type ReportType =
  | "ProfitAndLoss"
  | "BalanceSheet"
  | "CashFlow"
  | "AgedReceivables"
  | "AgedPayables";

/**
 * Cache key label — well-known defaults (mtd/ytd/...) or dynamic strings
 * (e.g. "fy_2024", "custom_2024-01-01_2024-06-30").
 */
export type PeriodLabel = string;

export interface QboReportCell {
  value?: string;
  id?: string;
  href?: string;
}

export interface QboReportRow {
  type?: "Data" | "Section";
  group?: string;
  Header?: { ColData: QboReportCell[] };
  ColData?: QboReportCell[];
  Rows?: { Row: QboReportRow[] };
  Summary?: { ColData: QboReportCell[] };
}

export interface QboReportPayload {
  Header: {
    Time?: string;
    ReportName?: string;
    ReportBasis?: string;
    StartPeriod?: string;
    EndPeriod?: string;
    Currency?: string;
  };
  Columns: {
    Column: Array<{ ColTitle: string; ColType?: string }>;
  };
  Rows: {
    Row: QboReportRow[];
  };
}

export interface QboReportCacheRow {
  id: string;
  report_type: ReportType;
  period_start: string | null;
  period_end: string;
  params: { accounting_method?: string; label?: PeriodLabel } & Record<string, unknown>;
  data: QboReportPayload;
  generated_at: string;
}

/**
 * Fetches the most recent cached snapshot of a given report+period. Returns
 * null if no snapshot exists yet (run "Refresh reports" from the overview).
 */
export function useQboReport(reportType: ReportType, period: PeriodLabel) {
  return useQuery({
    queryKey: [...financeKeys.all, "report", reportType, period],
    queryFn: async (): Promise<QboReportCacheRow | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("qbo_reports_cache")
        .select("*")
        .eq("report_type", reportType)
        .eq("params->>label", period)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch report: ${error.message}`);
      return data as QboReportCacheRow | null;
    },
  });
}
