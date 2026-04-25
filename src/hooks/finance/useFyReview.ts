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

// Per-invoice-line view of qbo_invoices.line_items joined with the
// invoice_line_recognition annotation overlay. Source: SQL view
// `invoice_lines_with_recognition`.
export interface InvoiceLineWithRecognition {
  qbo_invoice_id: string;
  doc_number: string | null;
  customer_qbo_id: string | null;
  txn_date: string;
  invoice_total: number;
  invoice_balance: number | null;
  invoice_status: string | null;
  currency: string | null;

  qbo_line_id: string;
  line_num: number | null;
  item_ref: string | null;
  description: string | null;
  amount: number;
  detail_type: string | null;

  // overlay (null until annotated)
  line_type: "SUB" | "SVC" | "OTHER" | null;
  recog_start: string | null;
  recog_end: string | null;
  recog_method: "straight_line" | "on_receipt" | "milestone" | null;
  contract_code: string | null;
  notes: string | null;
  annotated_at: string | null;
  reviewed_at: string | null;
  accepted_as_adjustment: boolean;
  is_annotated: boolean;
  is_reviewed: boolean;
}

// Auto-classify a line type from QBO ItemRef name. User can override.
export function classifyLineType(itemRef: string | null | undefined): "SUB" | "SVC" | "OTHER" {
  const name = itemRef ?? "";
  if (name.startsWith("Software:")) return "SUB";
  if (name.startsWith("Professional Services:")) return "SVC";
  return "OTHER";
}

// Singleton config for recognition JE generation. Six account refs (3
// deferred + 3 revenue) since ThinkVAL maintains separate deferred/revenue
// accounts for SUB and SVC.
export interface FyAccountConfig {
  id: 1;
  deferred_sub_account_qbo_id: string | null;
  deferred_svc_account_qbo_id: string | null;
  deferred_other_account_qbo_id: string | null;
  revenue_sub_account_qbo_id: string | null;
  revenue_svc_account_qbo_id: string | null;
  revenue_other_account_qbo_id: string | null;
  je_memo_prefix: string;
  je_doc_number_template: string;
  notes: string | null;
  updated_at: string;
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

// ─── Invoice line recognition ─────────────────────────────────────────────

export function useInvoiceLinesWithRecognition(opts?: {
  startDate?: string;       // filter by invoice txn_date >= startDate
  endDate?: string;         // filter by invoice txn_date <= endDate
  onlyUnannotated?: boolean;
}) {
  return useQuery({
    queryKey: [
      ...financeKeys.all,
      "invoice-lines-recognition",
      opts?.startDate ?? "all",
      opts?.endDate ?? "all",
      opts?.onlyUnannotated ? "unann" : "all",
    ],
    queryFn: async (): Promise<InvoiceLineWithRecognition[]> => {
      const supabase = getSupabaseClient();
      return await fetchAllPages<InvoiceLineWithRecognition>(() => {
        let q = supabase
          .from("invoice_lines_with_recognition")
          .select("*")
          .order("txn_date", { ascending: false })
          .order("line_num", { ascending: true });
        if (opts?.startDate) q = q.gte("txn_date", opts.startDate);
        if (opts?.endDate) q = q.lte("txn_date", opts.endDate);
        if (opts?.onlyUnannotated) q = q.eq("is_annotated", false);
        return q;
      });
    },
    staleTime: 60_000,
  });
}

export function useUpsertInvoiceLineRecognition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      qbo_invoice_id: string;
      qbo_line_id: string;
      line_type?: "SUB" | "SVC" | "OTHER";
      recog_start?: string | null;
      recog_end?: string | null;
      recog_method?: "straight_line" | "on_receipt" | "milestone";
      contract_code?: string | null;
      notes?: string | null;
    }) => {
      const supabase = getSupabaseClient();
      const row: Record<string, unknown> = {
        qbo_invoice_id: input.qbo_invoice_id,
        qbo_line_id: input.qbo_line_id,
        annotated_at: new Date().toISOString(),
      };
      // line_type is required by the table; on insert default to OTHER unless caller provides one.
      row.line_type = input.line_type ?? "OTHER";
      if (input.recog_start !== undefined) row.recog_start = input.recog_start;
      if (input.recog_end !== undefined) row.recog_end = input.recog_end;
      if (input.recog_method !== undefined) row.recog_method = input.recog_method;
      if (input.contract_code !== undefined) row.contract_code = input.contract_code;
      if (input.notes !== undefined) row.notes = input.notes;

      const { data, error } = await supabase
        .from("invoice_line_recognition")
        .upsert(row, { onConflict: "qbo_invoice_id,qbo_line_id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "invoice-lines-recognition"] });
    },
  });
}

// ─── Recognition JEs (parsed from qbo_journal_entries memo) ──────────────

// Memo convention: ^(prefix)-(SUB|SVC|OTHER)-(period_index)$ where prefix is
// the invoice doc_number (or legacy orderform code; usually identical).
//
// `prefix`/`type`/`period_index` may be null when the doc_number doesn't
// match the convention (typo, manual JE, legacy posting). Such JEs are still
// returned so the matcher can fuzzy-attribute them by customer + date +
// amount.
export interface ParsedRecognitionJe {
  qbo_id: string;
  doc_number: string;
  txn_date: string;
  prefix: string | null;      // captured if doc_number matched the convention
  type: "SUB" | "SVC" | "OTHER" | null;
  period_index: number | null;
  amount: number;             // recognised amount (lines[0].Amount)
  // Human-readable memo. Prefer the first line's Description (that's where
  // tv-client writes the rich "INV X · Item · Mon YYYY · period N of M"
  // string when creating JEs); fall back to the JE-level PrivateNote.
  description: string | null;
  customer_qbo_id: string | null;
  customer_name: string | null;
  dr_account_qbo_id: string | null;
  cr_account_qbo_id: string | null;
}

// Loosened: case-insensitive, multi-segment prefix (e.g. "1065-1-SUB-1").
const RECOG_DOC_RE = /^(\d+(?:-\d+)*)-(SUB|SVC|OTHER)-(\d+)$/i;

interface QboJeRow {
  qbo_id: string;
  doc_number: string | null;
  txn_date: string;
  total_amount: number | null;
  lines: unknown;
  private_note: string | null;
}

interface QboJeLine {
  Amount?: number | string;
  Description?: string;
  JournalEntryLineDetail?: {
    PostingType?: string;
    Entity?: { EntityRef?: { value?: string; name?: string } };
    AccountRef?: { value?: string; name?: string };
  };
}

function parseRecognitionJe(je: QboJeRow): ParsedRecognitionJe {
  const doc = je.doc_number ?? "";
  const m = doc.match(RECOG_DOC_RE);
  const lines = (je.lines as QboJeLine[] | null) ?? [];
  let amount = 0;
  let drAccount: string | null = null;
  let crAccount: string | null = null;
  let customerId: string | null = null;
  let customerName: string | null = null;
  let description: string | null = null;
  for (const l of lines) {
    const det = l.JournalEntryLineDetail;
    if (!det) continue;
    const a = Number(l.Amount ?? 0);
    if (det.PostingType === "Debit") {
      drAccount = drAccount ?? det.AccountRef?.value ?? null;
      if (a > amount) amount = a;
    } else if (det.PostingType === "Credit") {
      crAccount = crAccount ?? det.AccountRef?.value ?? null;
    }
    const ent = det.Entity?.EntityRef;
    if (!customerId && ent?.value) {
      customerId = ent.value;
      customerName = ent.name ?? null;
    }
    if (!description && l.Description) description = l.Description;
  }
  // Prefer a line-level Description (that's where our rich memo lives).
  // If QBO stripped or legacy JEs don't have one, fall back to the JE's
  // PrivateNote, which we also set on create.
  if (!description && je.private_note) description = je.private_note;
  return {
    qbo_id: je.qbo_id,
    doc_number: doc,
    txn_date: je.txn_date,
    prefix: m ? m[1] : null,
    type: m ? (m[2].toUpperCase() as "SUB" | "SVC" | "OTHER") : null,
    period_index: m ? parseInt(m[3], 10) : null,
    amount,
    description,
    customer_qbo_id: customerId,
    customer_name: customerName,
    dr_account_qbo_id: drAccount,
    cr_account_qbo_id: crAccount,
  };
}

// Fetch ALL journal entries in range (not just the regex-matching ones) so the
// matcher has a full candidate pool for fuzzy attribution by customer + date +
// amount. Caller filters out non-recognition JEs by checking accounts/amount.
// Supabase's hosted PostgREST enforces a server-side `db-max-rows = 1000`
// hard cap per request — asking for `.range(0, 99999)` still returns at
// most 1000 rows. We paginate in 1000-row chunks until we drain the table.
// `build` returns a Supabase query builder; we call `.range` on each page.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAllPages<T>(build: () => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useFyRecognitionJes(opts?: { startDate?: string; endDate?: string; alwaysIncludeIds?: string[] }) {
  const extraIds = [...(opts?.alwaysIncludeIds ?? [])].sort();
  return useQuery({
    queryKey: [...financeKeys.all, "fy-recognition-jes", opts?.startDate ?? "all", opts?.endDate ?? "all", extraIds],
    queryFn: async (): Promise<ParsedRecognitionJe[]> => {
      const supabase = getSupabaseClient();
      const rows = await fetchAllPages<QboJeRow>(() => {
        let q = supabase
          .from("qbo_journal_entries")
          .select("qbo_id, doc_number, txn_date, total_amount, lines, private_note")
          .order("txn_date", { ascending: true });
        if (opts?.startDate) q = q.gte("txn_date", opts.startDate);
        if (opts?.endDate) q = q.lte("txn_date", opts.endDate);
        return q;
      });

      // Second fetch: JEs that MUST appear regardless of the date window —
      // typically JEs with an explicit user override or a reviewed-line
      // matched_je_id. Without this, narrowing the period filter can hide
      // JEs the user has already manually attributed.
      const seen = new Set(rows.map((r) => r.qbo_id));
      const missing = extraIds.filter((id) => !seen.has(id));
      if (missing.length > 0) {
        const { data: extra, error: extraErr } = await supabase
          .from("qbo_journal_entries")
          .select("qbo_id, doc_number, txn_date, total_amount, lines, private_note")
          .in("qbo_id", missing);
        if (extraErr) throw new Error(extraErr.message);
        rows.push(...((extra ?? []) as QboJeRow[]));
      }
      return rows.map(parseRecognitionJe);
    },
    staleTime: 60_000,
  });
}

// Index parsed JEs into a lookup: prefix → type → period_index → JE.
// Only includes JEs whose doc_number matched the recognition convention.
export function indexRecognitionJes(jes: ParsedRecognitionJe[]): Map<string, Map<string, Map<number, ParsedRecognitionJe>>> {
  const idx = new Map<string, Map<string, Map<number, ParsedRecognitionJe>>>();
  for (const j of jes) {
    if (!j.prefix || !j.type || j.period_index == null) continue;
    let byType = idx.get(j.prefix);
    if (!byType) {
      byType = new Map();
      idx.set(j.prefix, byType);
    }
    let byPeriod = byType.get(j.type);
    if (!byPeriod) {
      byPeriod = new Map();
      byType.set(j.type, byPeriod);
    }
    byPeriod.set(j.period_index, j);
  }
  return idx;
}

// ─── JE → invoice line manual overrides ───────────────────────────────────

export interface JeOverride {
  qbo_je_id: string;
  qbo_invoice_id: string | null;
  qbo_line_id: string | null;
  notes: string | null;
  updated_at: string;
}

export function useJeOverrides() {
  return useQuery({
    queryKey: [...financeKeys.all, "je-overrides"],
    queryFn: async (): Promise<JeOverride[]> => {
      const supabase = getSupabaseClient();
      // Paginate past Supabase's server-enforced 1000-row cap — users with
      // many reassignments were losing overrides mid-list, making the
      // matcher look like it was "re-running allocation" after they'd
      // manually pinned things.
      return await fetchAllPages<JeOverride>(() =>
        supabase.from("je_invoice_line_overrides").select("*"),
      );
    },
    staleTime: 60_000,
  });
}

export function useUpsertJeOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      qbo_je_id: string;
      qbo_invoice_id: string | null;
      qbo_line_id: string | null;
      notes?: string | null;
    }) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("je_invoice_line_overrides")
        .upsert(input, { onConflict: "qbo_je_id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as JeOverride;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "je-overrides"] });
    },
  });
}

export function useDeleteJeOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (qbo_je_id: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("je_invoice_line_overrides")
        .delete()
        .eq("qbo_je_id", qbo_je_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "je-overrides"] });
    },
  });
}

// ─── Invoice line review (lock-in JE attribution) ────────────────────────

// Lock in an invoice line's current JE attribution:
//   1. Upsert the invoice_line_recognition row with reviewed_at = now()
//      (creating it with the effective line_type if it didn't exist)
//   2. For each currently-matched JE, upsert an override row pointing to
//      this line. That makes the attribution authoritative and prevents the
//      auto-matcher from moving those JEs to other invoices later.
export function useReviewInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      qbo_invoice_id: string;
      qbo_line_id: string;
      line_type: "SUB" | "SVC" | "OTHER";
      matched_je_ids: string[];
    }) => {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();

      // 1. Upsert the ILR row, setting reviewed_at. Default-on-insert fields
      // let us create the row if it didn't exist yet.
      const ilrRes = await supabase
        .from("invoice_line_recognition")
        .upsert(
          {
            qbo_invoice_id: input.qbo_invoice_id,
            qbo_line_id: input.qbo_line_id,
            line_type: input.line_type,
            reviewed_at: now,
          },
          { onConflict: "qbo_invoice_id,qbo_line_id" },
        );
      if (ilrRes.error) throw new Error(ilrRes.error.message);

      // 2. Upsert overrides for each currently-matched JE
      if (input.matched_je_ids.length > 0) {
        const rows = input.matched_je_ids.map((id) => ({
          qbo_je_id: id,
          qbo_invoice_id: input.qbo_invoice_id,
          qbo_line_id: input.qbo_line_id,
        }));
        const ovRes = await supabase
          .from("je_invoice_line_overrides")
          .upsert(rows, { onConflict: "qbo_je_id" });
        if (ovRes.error) throw new Error(ovRes.error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "invoice-lines-recognition"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "je-overrides"] });
    },
  });
}

// Unlock: clear reviewed_at and remove any overrides pointing to this line.
// The auto-matcher will re-attribute on next render.
export function useUnreviewInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { qbo_invoice_id: string; qbo_line_id: string }) => {
      const supabase = getSupabaseClient();

      const ilrRes = await supabase
        .from("invoice_line_recognition")
        .update({ reviewed_at: null, reviewed_by: null })
        .eq("qbo_invoice_id", input.qbo_invoice_id)
        .eq("qbo_line_id", input.qbo_line_id);
      if (ilrRes.error) throw new Error(ilrRes.error.message);

      const ovRes = await supabase
        .from("je_invoice_line_overrides")
        .delete()
        .eq("qbo_invoice_id", input.qbo_invoice_id)
        .eq("qbo_line_id", input.qbo_line_id);
      if (ovRes.error) throw new Error(ovRes.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "invoice-lines-recognition"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "je-overrides"] });
    },
  });
}

// Upsert the accepted_as_adjustment flag. Inserts a bare invoice_line_recognition
// row if one doesn't already exist (with line_type defaulted to OTHER; caller
// doesn't need to know its classification since adjustment lines aren't
// expected to generate JEs).

export function useSetInvoiceLineAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      qbo_invoice_id: string;
      qbo_line_id: string;
      line_type: "SUB" | "SVC" | "OTHER";   // used only on insert
      accepted: boolean;
    }) => {
      const supabase = getSupabaseClient();

      // Try updating first so we don't clobber an existing line_type.
      const upd = await supabase
        .from("invoice_line_recognition")
        .update({
          accepted_as_adjustment: input.accepted,
          annotated_at: new Date().toISOString(),
        })
        .eq("qbo_invoice_id", input.qbo_invoice_id)
        .eq("qbo_line_id", input.qbo_line_id)
        .select("qbo_invoice_id");
      if (upd.error) throw new Error(upd.error.message);
      if ((upd.data?.length ?? 0) > 0) return;

      // No row → insert.
      const ins = await supabase
        .from("invoice_line_recognition")
        .insert({
          qbo_invoice_id: input.qbo_invoice_id,
          qbo_line_id: input.qbo_line_id,
          line_type: input.line_type,
          accepted_as_adjustment: input.accepted,
          annotated_at: new Date().toISOString(),
        });
      if (ins.error) throw new Error(ins.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "invoice-lines-recognition"] });
    },
  });
}

// ─── Recognition account config (singleton) ──────────────────────────────

export function useFyAccountConfig() {
  return useQuery({
    queryKey: [...financeKeys.all, "fy-account-config"],
    queryFn: async (): Promise<FyAccountConfig | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("fy_account_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as FyAccountConfig | null;
    },
    staleTime: 60_000,
  });
}

export function useUpsertFyAccountConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Omit<FyAccountConfig, "id" | "updated_at">>) => {
      const supabase = getSupabaseClient();
      const row: Record<string, unknown> = { id: 1 };
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) row[k] = v;
      }
      const { data, error } = await supabase
        .from("fy_account_config")
        .upsert(row, { onConflict: "id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as FyAccountConfig;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "fy-account-config"] });
    },
  });
}

// ─── Actions (edge function invocations via Supabase client) ──────────────

// Push a batch of recognition JEs to QuickBooks via the qbo-create-journal-entry
// edge function. Returns per-entry results so the UI can show which succeeded
// and surface QBO IDs / errors.
export interface CreateJeEntry {
  doc_number: string;
  txn_date: string;
  description: string;
  amount: number;
  dr_account_qbo_id: string;
  cr_account_qbo_id: string;
  customer_qbo_id: string;
  currency?: string;
}

export interface CreateJeResult {
  doc_number: string;
  success: boolean;
  qbo_id?: string;
  sync_token?: string;
  error?: string;
}

export interface CreateJeBatchResponse {
  results: CreateJeResult[];
  created: number;
  failed: number;
}

export function useCreateJournalEntries() {
  const qc = useQueryClient();
  return useMutation<CreateJeBatchResponse, Error, CreateJeEntry[]>({
    mutationFn: async (entries) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-create-journal-entry", {
        body: { entries, triggered_by: "tv-client" },
      });
      if (error) throw new Error(error.message);
      return data as CreateJeBatchResponse;
    },
    onSuccess: () => {
      // New JEs in qbo_journal_entries → invalidate the matcher's data source.
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export interface UpdateJeDocNumberResult {
  success: boolean;
  qbo_id?: string;
  sync_token?: string;
  doc_number?: string;
  error?: string;
}

export interface UpdateJeAmountResult {
  success: boolean;
  qbo_id?: string;
  sync_token?: string;
  amount?: number;
  error?: string;
}

export function useUpdateJeAmount() {
  const qc = useQueryClient();
  return useMutation<UpdateJeAmountResult, Error, { qbo_id: string; amount: number }>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-update-je-amount", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data as UpdateJeAmountResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export interface SyncInvoiceResult {
  success: boolean;
  invoice_synced?: number;
  je_synced?: number;
  je_deleted?: number;
  error?: string;
}

export function useSyncInvoice() {
  const qc = useQueryClient();
  return useMutation<SyncInvoiceResult, Error, { doc_number: string }>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-sync-invoice", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data as SyncInvoiceResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export interface DeleteJeResult {
  success: boolean;
  qbo_id?: string;
  error?: string;
}

export interface DeleteInvoiceResult {
  success: boolean;
  qbo_id?: string;
  error?: string;
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation<DeleteInvoiceResult, Error, { qbo_id: string }>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-delete-invoice", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data as DeleteInvoiceResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useDeleteJe() {
  const qc = useQueryClient();
  return useMutation<DeleteJeResult, Error, { qbo_id: string }>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-delete-journal-entry", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data as DeleteJeResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export interface UpdateJeTxnDateResult {
  success: boolean;
  qbo_id?: string;
  sync_token?: string;
  txn_date?: string;
  error?: string;
}

export function useUpdateJeTxnDate() {
  const qc = useQueryClient();
  return useMutation<UpdateJeTxnDateResult, Error, { qbo_id: string; txn_date: string }>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-update-je-txndate", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data as UpdateJeTxnDateResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useUpdateJeDocNumber() {
  const qc = useQueryClient();
  return useMutation<UpdateJeDocNumberResult, Error, { qbo_id: string; doc_number: string }>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("qbo-update-je-docnumber", {
        body: input,
      });
      if (error) throw new Error(error.message);
      return data as UpdateJeDocNumberResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

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
