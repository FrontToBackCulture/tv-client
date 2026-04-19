// Hooks for the FY Review feature. Reads from mgmt workspace tables:
// fy_snapshots, fy_snapshot_lines, fy_fs_mapping, recognition_schedule,
// orderforms.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";

export interface FySnapshot {
  id: string;
  fy_code: string;
  period_start: string;
  period_end: string;
  period_label: string;
  granularity: "month" | "year";
  source: "qbo" | "fs" | "manual";
  is_baseline: boolean;
  captured_at: string;
}

export interface FySnapshotLine {
  id: string;
  snapshot_id: string;
  account_qbo_id: string | null;
  account_name: string;
  account_type: string | null; // 'pnl' | 'bs'
  fs_line: string | null;
  balance: number | null;
  movement: number | null;
}

export interface FsMapping {
  account_qbo_id: string;
  fs_line: string;
  fs_section: string;
  display_order: number;
  is_contra: boolean;
}

export interface RecognitionRow {
  id: string;
  fy_code: string;
  orderform_code: string;
  customer_qbo_id: string | null;
  customer_name: string;
  leg: "SUB" | "SVC";
  period_start: string;
  period_end: string;
  period_index: number;
  expected_amount: number;
  posted_amount: number | null;
  posted_je_id: string | null;
  posted_je_txn_date: string | null;
  status: "posted" | "missing" | "mismatched" | "expected" | "orphan" | "waived";
  variance: number;
  notes: string | null;
}

export interface Reconciliation {
  id: string;
  fy_code: string;
  fs_line: string;
  fs_line_label: string;
  official_amount: number;
  qbo_amount: number | null;
  variance: number;
  status: "open" | "investigating" | "resolved" | "accepted";
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface DriftAlert {
  id: string;
  fy_code: string;
  period_start: string;
  account_qbo_id: string | null;
  account_name: string;
  fs_line: string | null;
  amount_field: "balance" | "movement";
  old_value: number | null;
  new_value: number | null;
  delta: number;
  snapshot_id_prior: string | null;
  snapshot_id_new: string | null;
  detected_at: string;
  status: "open" | "acknowledged" | "investigated" | "resolved";
  note: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface Orderform {
  orderform_code: string;
  customer_qbo_id: string | null;
  customer_name: string | null;
  start_date: string;
  end_date: string | null;
  svc_start_date: string | null;
  svc_end_date: string | null;
  term_months: number;
  auto_renewal: boolean;
  sub_monthly: number;
  svc_monthly: number;
  sub_total: number;
  svc_total: number;
  status: string;
  notes: string | null;
}

export interface QboEstimate {
  qbo_id: string;
  doc_number: string | null;
  customer_qbo_id: string | null;
  txn_date: string;
  expiration_date: string | null;
  total_amount: number;
  status: string | null;
  accepted_by: string | null;
  accepted_date: string | null;
  currency: string | null;
  private_note: string | null;
  customer_memo: string | null;
  line_items: unknown;
  raw?: unknown;
}

export interface QboCustomer {
  qbo_id: string;
  display_name: string;
  company_name: string | null;
  active: boolean;
}

export interface Contract {
  estimate: QboEstimate;
  overlay: Orderform | null;
  customer_name: string;
  // Derived from line_items + raw.TxnTaxDetail — all pre-tax (net) amounts.
  net_total: number;       // sum of SalesItemLineDetail line amounts (pre-tax)
  tax_total: number;       // TxnTaxDetail.TotalTax
  sub_net: number;         // net for items under "Software:*" (subscription)
  svc_net: number;         // net for items under "Professional Services:*"
  other_net: number;       // everything else (legacy items, Services, etc.)
}

interface EstimateLine {
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { name?: string };
  };
}

function deriveLineTotals(est: QboEstimate): Pick<Contract, "net_total" | "tax_total" | "sub_net" | "svc_net" | "other_net"> {
  const lines = (est.line_items as EstimateLine[] | null) ?? [];
  let netTotal = 0, subNet = 0, svcNet = 0, otherNet = 0;
  for (const line of lines) {
    if (line.DetailType !== "SalesItemLineDetail") continue;
    const amt = Number(line.Amount ?? 0);
    netTotal += amt;
    const itemName = line.SalesItemLineDetail?.ItemRef?.name ?? "";
    if (itemName.startsWith("Software:")) subNet += amt;
    else if (itemName.startsWith("Professional Services:")) svcNet += amt;
    else otherNet += amt;
  }
  const tax = ((est.raw as { TxnTaxDetail?: { TotalTax?: number } } | null)?.TxnTaxDetail?.TotalTax) ?? 0;
  return {
    net_total: netTotal,
    tax_total: Number(tax),
    sub_net: subNet,
    svc_net: svcNet,
    other_net: otherNet,
  };
}

// ─── Snapshots ────────────────────────────────────────────────────────────

export function useFySnapshots(fyCode: string) {
  return useQuery({
    queryKey: [...financeKeys.all, "fy-snapshots", fyCode],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("fy_snapshots")
        .select("*")
        .eq("fy_code", fyCode)
        .order("period_start", { ascending: true })
        .order("captured_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FySnapshot[];
    },
    staleTime: 60_000,
  });
}

// Returns latest snapshot per period_start for a given source.
export function useLatestSnapshotsByMonth(fyCode: string, source: "qbo" | "fs" = "qbo") {
  const snaps = useFySnapshots(fyCode);
  const byPeriod = new Map<string, FySnapshot>();
  for (const s of snaps.data ?? []) {
    if (s.source !== source || s.granularity !== "month") continue;
    if (!byPeriod.has(s.period_start)) byPeriod.set(s.period_start, s);
  }
  return {
    ...snaps,
    latest: Array.from(byPeriod.values()).sort((a, b) => a.period_start.localeCompare(b.period_start)),
  };
}

export function useFySnapshotLines(snapshotIds: string[]) {
  return useQuery({
    queryKey: [...financeKeys.all, "fy-snapshot-lines", ...snapshotIds],
    enabled: snapshotIds.length > 0,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("fy_snapshot_lines")
        .select("*")
        .in("snapshot_id", snapshotIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as FySnapshotLine[];
    },
    staleTime: 60_000,
  });
}

export function useFsMapping() {
  return useQuery({
    queryKey: [...financeKeys.all, "fy-fs-mapping"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("fy_fs_mapping")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FsMapping[];
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Recognition ──────────────────────────────────────────────────────────

export function useRecognitionSchedule(fyCode: string) {
  return useQuery({
    queryKey: [...financeKeys.all, "recognition", fyCode],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("recognition_schedule")
        .select("*")
        .eq("fy_code", fyCode)
        .order("orderform_code")
        .order("leg")
        .order("period_index");
      if (error) throw new Error(error.message);
      return (data ?? []) as RecognitionRow[];
    },
    staleTime: 60_000,
  });
}

// ─── Reconciliation ───────────────────────────────────────────────────────

export function useFyReconciliation(fyCode: string) {
  return useQuery({
    queryKey: [...financeKeys.all, "fy-reconciliation", fyCode],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("fy_reconciliations")
        .select("*")
        .eq("fy_code", fyCode)
        .order("fs_line");
      if (error) throw new Error(error.message);
      return (data ?? []) as Reconciliation[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status?: Reconciliation["status"];
      resolution_note?: string;
    }) => {
      const supabase = getSupabaseClient();
      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status === "resolved" || input.status === "accepted") {
          updates.resolved_at = new Date().toISOString();
        }
      }
      if (input.resolution_note !== undefined) updates.resolution_note = input.resolution_note;
      const { data, error } = await supabase
        .from("fy_reconciliations")
        .update(updates)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Reconciliation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "fy-reconciliation"] });
    },
  });
}

// For a given (fy, leg, period_start?) pull recognition rows that contribute
// to a Revenue P&L cell. Omit period_start to get all months of the FY.
export function useRevenueCellBreakdown(
  fyCode: string,
  leg: "SUB" | "SVC" | null,
  periodStart: string | null,
) {
  return useQuery({
    queryKey: [...financeKeys.all, "revenue-cell", fyCode, leg ?? "-", periodStart ?? "-"],
    enabled: !!leg,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      let q = supabase
        .from("recognition_schedule")
        .select("*")
        .eq("fy_code", fyCode)
        .eq("leg", leg as string)
        .order("orderform_code");
      if (periodStart) q = q.eq("period_start", periodStart);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as RecognitionRow[];
    },
    staleTime: 60_000,
  });
}

// ─── Contracts (Estimates + overlay) ─────────────────────────────────────

export function useContracts() {
  return useQuery({
    queryKey: [...financeKeys.all, "contracts"],
    queryFn: async (): Promise<Contract[]> => {
      const supabase = getSupabaseClient();
      const [estimatesRes, overlayRes, customersRes] = await Promise.all([
        supabase.from("qbo_estimates").select("*").order("txn_date", { ascending: false }),
        supabase.from("orderforms").select("*"),
        supabase.from("qbo_customers").select("qbo_id, display_name, company_name, active"),
      ]);
      if (estimatesRes.error) throw new Error(estimatesRes.error.message);
      if (overlayRes.error) throw new Error(overlayRes.error.message);
      if (customersRes.error) throw new Error(customersRes.error.message);

      const overlayByCode = new Map<string, Orderform>();
      for (const o of overlayRes.data ?? []) {
        overlayByCode.set((o as Orderform).orderform_code, o as Orderform);
      }
      const custById = new Map<string, QboCustomer>();
      for (const c of customersRes.data ?? []) {
        custById.set((c as QboCustomer).qbo_id, c as QboCustomer);
      }

      return (estimatesRes.data ?? []).map((e): Contract => {
        const est = e as QboEstimate;
        const overlay = est.doc_number ? overlayByCode.get(est.doc_number) ?? null : null;
        const cust = est.customer_qbo_id ? custById.get(est.customer_qbo_id) : null;
        return {
          estimate: est,
          overlay,
          customer_name: cust?.display_name ?? cust?.company_name ?? "(unknown)",
          ...deriveLineTotals(est),
        };
      });
    },
    staleTime: 60_000,
  });
}

export function useUpsertOrderform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderform_code: string;
      customer_qbo_id?: string | null;
      customer_name?: string | null;
      source_estimate_id?: string;
      start_date?: string | null;
      end_date?: string | null;
      svc_start_date?: string | null;
      svc_end_date?: string | null;
      auto_renewal?: boolean;
      sub_monthly?: number;
      notes?: string | null;
      status?: string;
    }) => {
      const supabase = getSupabaseClient();
      // Need a valid start_date on insert. Fall back to today if omitted.
      const row: Record<string, unknown> = {
        orderform_code: input.orderform_code,
        start_date: input.start_date ?? new Date().toISOString().slice(0, 10),
      };
      if (input.customer_qbo_id !== undefined) row.customer_qbo_id = input.customer_qbo_id;
      if (input.customer_name !== undefined) row.customer_name = input.customer_name;
      if (input.source_estimate_id !== undefined) row.source_estimate_id = input.source_estimate_id;
      if (input.end_date !== undefined) row.end_date = input.end_date;
      if (input.svc_start_date !== undefined) row.svc_start_date = input.svc_start_date;
      if (input.svc_end_date !== undefined) row.svc_end_date = input.svc_end_date;
      if (input.auto_renewal !== undefined) row.auto_renewal = input.auto_renewal;
      if (input.sub_monthly !== undefined) row.sub_monthly = input.sub_monthly;
      if (input.notes !== undefined) row.notes = input.notes;
      if (input.status !== undefined) row.status = input.status;

      // Keep required term_months populated; default 0 when unknown (user will edit dates instead).
      row.term_months = 0;

      const { data, error } = await supabase
        .from("orderforms")
        .upsert(row, { onConflict: "orderform_code" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Orderform;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "contracts"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "orderforms"] });
    },
  });
}

export function useOrderforms() {
  return useQuery({
    queryKey: [...financeKeys.all, "orderforms"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("orderforms")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Orderform[];
    },
    staleTime: 60_000,
  });
}

// ─── Actions (edge function invocations via Supabase client) ──────────────

export function useFyCaptureSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fy_code: string; period_start?: string }) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("fy-capture-snapshot", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "fy-snapshots"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "fy-snapshot-lines"] });
    },
  });
}

// ─── Drift alerts ─────────────────────────────────────────────────────────

export function useFyDriftAlerts(fyCode?: string, status?: DriftAlert["status"]) {
  return useQuery({
    queryKey: [...financeKeys.all, "drift-alerts", fyCode ?? "all", status ?? "all"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      let q = supabase
        .from("fy_drift_alerts")
        .select("*")
        .order("detected_at", { ascending: false });
      if (fyCode) q = q.eq("fy_code", fyCode);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as DriftAlert[];
    },
    staleTime: 60_000,
  });
}

export function useFyWatchdogRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fy_code?: string; period_start?: string; threshold?: number }) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("fy-watchdog", { body: input });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "drift-alerts"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "fy-snapshots"] });
    },
  });
}

export function useAcknowledgeDriftAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status?: DriftAlert["status"];
      note?: string;
    }) => {
      const supabase = getSupabaseClient();
      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) {
        updates.status = input.status;
        updates.acknowledged_at = new Date().toISOString();
      }
      if (input.note !== undefined) updates.note = input.note;
      const { data, error } = await supabase
        .from("fy_drift_alerts")
        .update(updates)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as DriftAlert;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "drift-alerts"] });
    },
  });
}

export function useFyBuildRecognition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fy_code?: string; orderform_code?: string }) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("fy-build-recognition", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "recognition"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "orderforms"] });
    },
  });
}
