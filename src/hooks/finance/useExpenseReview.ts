// Hooks for the Expense Review feature. Reads from mgmt workspace view
// expense_lines_unified and overlay tables expense_line_review +
// expense_review_config.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { financeKeys } from "./keys";

export type ExpenseSourceType = "bill" | "expense" | "journal_entry";
export type ExpenseAnomalyFlag =
  | "duplicate"
  | "miscoded"
  | "uncategorised"
  | "round_number"
  | "personal_use"
  | "other";
export type ExpenseClaimStatus = "unclaimed" | "claimed" | "reimbursed";

export interface ExpenseLineUnified {
  source_type: ExpenseSourceType;
  source_qbo_id: string;
  qbo_line_id: string;
  line_num: number | null;
  doc_number: string | null;
  payee_qbo_id: string | null;
  payee_type: string | null;
  payee_name: string | null;
  txn_date: string;
  source_total: number | null;
  currency: string | null;
  payment_account_qbo_id: string | null;
  payment_account_name: string | null;
  payment_account_type: string | null;
  private_note: string | null;
  description: string | null;
  amount: number;
  account_qbo_id: string | null;
  account_name: string | null;
  account_type: string | null;
  fs_line: string | null;
  fs_section: string | null;
  class_name: string | null;
  is_personal_cc: boolean;
  reviewed_at: string | null;
  anomaly_flag: ExpenseAnomalyFlag | null;
  anomaly_note: string | null;
  claim_status: ExpenseClaimStatus | null;
  claim_note: string | null;
  cap_candidate: boolean | null;
  cap_target_account_qbo_id: string | null;
  cap_bucket: string | null;
  capitalised_je_qbo_id: string | null;
  notes: string | null;
  is_reviewed: boolean;
}

export interface ExpenseReviewConfig {
  id: number;
  personal_cc_account_ids: string[];
  cap_target_account_ids: string[];
  updated_at: string;
}

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

export function useExpenseLinesUnified(opts?: {
  startDate?: string;
  endDate?: string;
  onlyUnreviewed?: boolean;
}) {
  return useQuery({
    queryKey: [
      ...financeKeys.all,
      "expense-lines-unified",
      opts?.startDate ?? "all",
      opts?.endDate ?? "all",
      opts?.onlyUnreviewed ? "unrev" : "all",
    ],
    queryFn: async (): Promise<ExpenseLineUnified[]> => {
      const supabase = getSupabaseClient();
      return await fetchAllPages<ExpenseLineUnified>(() => {
        // Tie-break with source_type / source_qbo_id / qbo_line_id so
        // range-based pagination doesn't drift (PostgREST range() uses
        // LIMIT/OFFSET — any two rows that compare equal on the ORDER BY
        // keys can land in different pages on different pages of the
        // same query, causing duplicates and gaps). These three columns
        // together uniquely identify a row in expense_lines_unified.
        let q = supabase
          .from("expense_lines_unified")
          .select("*")
          .order("txn_date", { ascending: false })
          .order("line_num", { ascending: true, nullsFirst: false })
          .order("source_type", { ascending: true })
          .order("source_qbo_id", { ascending: true })
          .order("qbo_line_id", { ascending: true });
        if (opts?.startDate) q = q.gte("txn_date", opts.startDate);
        if (opts?.endDate) q = q.lte("txn_date", opts.endDate);
        if (opts?.onlyUnreviewed) q = q.is("reviewed_at", null);
        return q;
      });
    },
    staleTime: 60_000,
  });
}

export function useExpenseReviewConfig() {
  return useQuery({
    queryKey: [...financeKeys.all, "expense-review-config"],
    queryFn: async (): Promise<ExpenseReviewConfig | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("expense_review_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as ExpenseReviewConfig | null;
    },
    staleTime: 60_000,
  });
}

export function useUpsertExpenseReviewConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      personal_cc_account_ids?: string[];
      cap_target_account_ids?: string[];
    }) => {
      const supabase = getSupabaseClient();
      const row: Record<string, unknown> = { id: 1 };
      if (input.personal_cc_account_ids !== undefined)
        row.personal_cc_account_ids = input.personal_cc_account_ids;
      if (input.cap_target_account_ids !== undefined)
        row.cap_target_account_ids = input.cap_target_account_ids;
      const { data, error } = await supabase
        .from("expense_review_config")
        .upsert(row, { onConflict: "id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "expense-review-config"] });
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "expense-lines-unified"] });
    },
  });
}

export function useUpsertExpenseLineReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      source_type: ExpenseSourceType;
      source_qbo_id: string;
      qbo_line_id: string;
      reviewed?: boolean;                    // true sets reviewed_at = now
      anomaly_flag?: ExpenseAnomalyFlag | null;
      anomaly_note?: string | null;
      claim_status?: ExpenseClaimStatus | null;
      claim_note?: string | null;
      cap_candidate?: boolean;
      cap_target_account_qbo_id?: string | null;
      cap_bucket?: string | null;
      capitalised_je_qbo_id?: string | null;
      notes?: string | null;
    }) => {
      const supabase = getSupabaseClient();
      const row: Record<string, unknown> = {
        source_type: input.source_type,
        source_qbo_id: input.source_qbo_id,
        qbo_line_id: input.qbo_line_id,
      };
      if (input.reviewed !== undefined) {
        row.reviewed_at = input.reviewed ? new Date().toISOString() : null;
      }
      if (input.anomaly_flag !== undefined) row.anomaly_flag = input.anomaly_flag;
      if (input.anomaly_note !== undefined) row.anomaly_note = input.anomaly_note;
      if (input.claim_status !== undefined) row.claim_status = input.claim_status;
      if (input.claim_note !== undefined) row.claim_note = input.claim_note;
      if (input.cap_candidate !== undefined) row.cap_candidate = input.cap_candidate;
      if (input.cap_target_account_qbo_id !== undefined)
        row.cap_target_account_qbo_id = input.cap_target_account_qbo_id;
      if (input.cap_bucket !== undefined) row.cap_bucket = input.cap_bucket;
      if (input.capitalised_je_qbo_id !== undefined)
        row.capitalised_je_qbo_id = input.capitalised_je_qbo_id;
      if (input.notes !== undefined) row.notes = input.notes;

      const { data, error } = await supabase
        .from("expense_line_review")
        .upsert(row, { onConflict: "source_type,source_qbo_id,qbo_line_id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...financeKeys.all, "expense-lines-unified"] });
    },
  });
}

// ─── Capitalisation JE detection ──────────────────────────────────────────
// A cap JE has at least one line DR'ing an asset account and at least one
// CR'ing an expense account. We return enough info to cross-reference against
// cap_candidate lines in the overlay.

export interface CapitalisationJe {
  qbo_id: string;
  doc_number: string | null;
  txn_date: string;
  private_note: string | null;
  asset_total: number;            // sum of DR legs into asset accounts
  expense_accounts: string[];     // distinct expense account qbo_ids credited
  asset_accounts: string[];       // distinct asset account qbo_ids debited
}

interface QboJeLine {
  Amount?: number;
  JournalEntryLineDetail?: {
    PostingType?: "Debit" | "Credit";
    AccountRef?: { value?: string; name?: string };
  };
}

interface QboJeRow {
  qbo_id: string;
  doc_number: string | null;
  txn_date: string;
  private_note: string | null;
  lines: QboJeLine[] | null;
}

export function useCapitalisationJes(opts?: {
  assetAccountIds: string[];
  expenseAccountIds?: Set<string>;
  startDate?: string;
  endDate?: string;
}) {
  const assetIds = opts?.assetAccountIds ?? [];
  return useQuery({
    queryKey: [
      ...financeKeys.all,
      "capitalisation-jes",
      assetIds.slice().sort().join(","),
      opts?.startDate ?? "all",
      opts?.endDate ?? "all",
    ],
    enabled: assetIds.length > 0,
    queryFn: async (): Promise<CapitalisationJe[]> => {
      const supabase = getSupabaseClient();
      const rows = await fetchAllPages<QboJeRow>(() => {
        let q = supabase
          .from("qbo_journal_entries")
          .select("qbo_id, doc_number, txn_date, private_note, lines")
          .order("txn_date", { ascending: false });
        if (opts?.startDate) q = q.gte("txn_date", opts.startDate);
        if (opts?.endDate) q = q.lte("txn_date", opts.endDate);
        return q;
      });
      const assetSet = new Set(assetIds);
      const out: CapitalisationJe[] = [];
      for (const r of rows) {
        const lines = r.lines ?? [];
        let assetTotal = 0;
        const assetAccts = new Set<string>();
        const expenseAccts = new Set<string>();
        let hasAssetDr = false;
        for (const ln of lines) {
          const det = ln.JournalEntryLineDetail;
          const acctId = det?.AccountRef?.value;
          if (!acctId) continue;
          const amt = Number(ln.Amount ?? 0);
          if (det?.PostingType === "Debit" && assetSet.has(acctId)) {
            hasAssetDr = true;
            assetTotal += amt;
            assetAccts.add(acctId);
          } else if (det?.PostingType === "Credit") {
            // Expense-side inferred: any credit that isn't itself an asset we
            // track. Caller can further filter using expenseAccountIds.
            if (!assetSet.has(acctId)) {
              if (!opts?.expenseAccountIds || opts.expenseAccountIds.has(acctId)) {
                expenseAccts.add(acctId);
              }
            }
          }
        }
        if (hasAssetDr && expenseAccts.size > 0) {
          out.push({
            qbo_id: r.qbo_id,
            doc_number: r.doc_number,
            txn_date: r.txn_date,
            private_note: r.private_note,
            asset_total: assetTotal,
            expense_accounts: Array.from(expenseAccts),
            asset_accounts: Array.from(assetAccts),
          });
        }
      }
      return out;
    },
    staleTime: 60_000,
  });
}

// ─── Batch capitalisation JE builder ──────────────────────────────────────
// Groups tagged lines by expense account, produces a preview JE payload.
// Posting is delegated to the qbo-create-journal-entry edge function.

export interface CapJePreviewLine {
  posting_type: "Debit" | "Credit";
  account_qbo_id: string;
  account_name: string;
  amount: number;
  description: string;
}

export interface CapJePreview {
  target_account_qbo_id: string;
  target_account_name: string;
  total: number;
  lines: CapJePreviewLine[];
  tagged_line_keys: Array<{
    source_type: ExpenseSourceType;
    source_qbo_id: string;
    qbo_line_id: string;
  }>;
}

/**
 * Build a preview of the batch cap JE from a set of tagged expense lines.
 * One preview per target asset account. Credits are grouped by source
 * expense account so the posted JE mirrors the existing FY2024 pattern.
 */
export function buildCapJePreview(
  lines: ExpenseLineUnified[],
  targetAccount: { qbo_id: string; name: string },
): CapJePreview {
  const targeted = lines.filter(
    (l) =>
      l.cap_candidate &&
      !l.capitalised_je_qbo_id &&
      l.cap_target_account_qbo_id === targetAccount.qbo_id,
  );

  const byExpense = new Map<string, { name: string; amount: number; descs: string[] }>();
  for (const l of targeted) {
    if (!l.account_qbo_id) continue;
    const cur = byExpense.get(l.account_qbo_id) ?? {
      name: l.account_name ?? l.account_qbo_id,
      amount: 0,
      descs: [],
    };
    cur.amount += Number(l.amount ?? 0);
    if (l.description) cur.descs.push(l.description);
    byExpense.set(l.account_qbo_id, cur);
  }

  const total = Array.from(byExpense.values()).reduce((a, b) => a + b.amount, 0);
  const out: CapJePreviewLine[] = [];
  out.push({
    posting_type: "Debit",
    account_qbo_id: targetAccount.qbo_id,
    account_name: targetAccount.name,
    amount: total,
    description: `Capitalisation — ${byExpense.size} expense accounts, ${targeted.length} lines`,
  });
  for (const [acctId, bucket] of byExpense) {
    out.push({
      posting_type: "Credit",
      account_qbo_id: acctId,
      account_name: bucket.name,
      amount: bucket.amount,
      description: `Capitalisation: ${bucket.name}`,
    });
  }

  return {
    target_account_qbo_id: targetAccount.qbo_id,
    target_account_name: targetAccount.name,
    total,
    lines: out,
    tagged_line_keys: targeted.map((l) => ({
      source_type: l.source_type,
      source_qbo_id: l.source_qbo_id,
      qbo_line_id: l.qbo_line_id,
    })),
  };
}
