// AccountConfigCard — singleton config for recognition JE generation.
//
// Maps logical roles (Deferred Revenue + Revenue per line_type) to actual QBO
// accounts. Required before fy-build-recognition can match/post JEs to QBO.
// Defaults to collapsed once configured; expands when missing fields.

import { useMemo, useState, type ReactNode } from "react";
import {
  useFyAccountConfig,
  useUpsertFyAccountConfig,
  type FyAccountConfig,
} from "../../hooks/finance/useFyReview";
import { useQboAccounts } from "../../hooks/finance/useQboData";
import { cn } from "../../lib/cn";

interface QboAccount {
  qbo_id: string;
  name: string;
  account_type: string | null;
  account_sub_type: string | null;
  classification: string | null;
  active: boolean | null;
}

type AccountField =
  | "deferred_sub_account_qbo_id"
  | "deferred_svc_account_qbo_id"
  | "deferred_other_account_qbo_id"
  | "revenue_sub_account_qbo_id"
  | "revenue_svc_account_qbo_id"
  | "revenue_other_account_qbo_id";

const ROLES: {
  field: AccountField;
  label: string;
  hint: string;
  classification: "Liability" | "Revenue";
}[] = [
  // Deferred side (DR). One per line_type since ThinkVAL has separate GL accounts.
  {
    field: "deferred_sub_account_qbo_id",
    label: "Deferred · SUB",
    hint: "DR for subscription lines.",
    classification: "Liability",
  },
  {
    field: "deferred_svc_account_qbo_id",
    label: "Deferred · SVC",
    hint: "DR for services lines.",
    classification: "Liability",
  },
  {
    field: "deferred_other_account_qbo_id",
    label: "Deferred · OTHER",
    hint: "DR for catch-all lines.",
    classification: "Liability",
  },
  // Revenue side (CR), one per line_type.
  {
    field: "revenue_sub_account_qbo_id",
    label: "Revenue · SUB",
    hint: "CR for subscription lines.",
    classification: "Revenue",
  },
  {
    field: "revenue_svc_account_qbo_id",
    label: "Revenue · SVC",
    hint: "CR for services / professional-services lines.",
    classification: "Revenue",
  },
  {
    field: "revenue_other_account_qbo_id",
    label: "Revenue · OTHER",
    hint: "CR for catch-all lines.",
    classification: "Revenue",
  },
];

export function AccountConfigCard() {
  const { data: config, isLoading: cfgLoading } = useFyAccountConfig();
  const { data: accounts, isLoading: acctLoading } = useQboAccounts();
  const upsert = useUpsertFyAccountConfig();

  const allMapped = config != null && ROLES.every((r) => config[r.field]);
  const [expanded, setExpanded] = useState<boolean>(false);
  // Default open when nothing is mapped; closed when fully configured.
  const open = expanded || !allMapped;

  const acctById = useMemo(() => {
    const m = new Map<string, QboAccount>();
    for (const a of (accounts ?? []) as QboAccount[]) m.set(a.qbo_id, a);
    return m;
  }, [accounts]);

  const liabilityOptions = useMemo(
    () => filterAccounts(accounts as QboAccount[] | undefined, "Liability"),
    [accounts],
  );
  const revenueOptions = useMemo(
    () => filterAccounts(accounts as QboAccount[] | undefined, "Revenue"),
    [accounts],
  );

  if (cfgLoading || acctLoading) {
    return (
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-xs text-zinc-500">
        Loading recognition account config…
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-md border bg-white dark:bg-zinc-900",
      allMapped
        ? "border-zinc-200 dark:border-zinc-800"
        : "border-amber-300 dark:border-amber-800",
    )}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-950"
      >
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Recognition account mapping</span>
        <span className={cn(
          "text-[10px] px-2 py-0.5 rounded font-medium",
          allMapped
            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
        )}>
          {allMapped ? "Configured" : "Set up required"}
        </span>
        <span className="text-zinc-500 ml-auto">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-xs text-zinc-500 max-w-3xl">
            Each recognition JE we post to QBO is{" "}
            <span className="text-zinc-700 dark:text-zinc-300">DR Deferred / CR Revenue</span>{" "}
            with both accounts picked by the line's <code>line_type</code>. Defaults are
            seeded from the FS mapping — adjust below if QBO has changed.
          </div>

          <div className="space-y-3">
            <RoleRow
              title="Deferred (DR)"
              roles={ROLES.filter((r) => r.classification === "Liability")}
              config={config}
              opts={liabilityOptions}
              acctById={acctById}
              onChange={(field, v) => upsert.mutate({ [field]: v || null })}
              disabled={upsert.isPending}
            />
            <RoleRow
              title="Revenue (CR)"
              roles={ROLES.filter((r) => r.classification === "Revenue")}
              config={config}
              opts={revenueOptions}
              acctById={acctById}
              onChange={(field, v) => upsert.mutate({ [field]: v || null })}
              disabled={upsert.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <TextField
              label="JE PrivateNote prefix"
              value={config?.je_memo_prefix ?? ""}
              placeholder="[TV-RECOG]"
              onCommit={(v) => upsert.mutate({ je_memo_prefix: v })}
              disabled={upsert.isPending}
              hint="Marker so we can re-detect TV-generated JEs on re-sync."
            />
            <TextField
              label="JE DocNumber template"
              value={config?.je_doc_number_template ?? ""}
              placeholder="{doc_number}-{type}-{period_index}"
              onCommit={(v) => upsert.mutate({ je_doc_number_template: v })}
              disabled={upsert.isPending}
              hint={
                <>
                  Tokens: <code>{"{doc_number}"}</code>, <code>{"{type}"}</code>, <code>{"{period_index}"}</code>.
                </>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function filterAccounts(
  accounts: QboAccount[] | undefined,
  classification: "Liability" | "Revenue",
): QboAccount[] {
  return (accounts ?? [])
    .filter((a) => a.active !== false)
    .filter((a) => a.classification === classification)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function RoleRow({
  title,
  roles,
  config,
  opts,
  acctById,
  onChange,
  disabled,
}: {
  title: string;
  roles: { field: AccountField; label: string; hint: string; classification: "Liability" | "Revenue" }[];
  config: FyAccountConfig | null | undefined;
  opts: QboAccount[];
  acctById: Map<string, QboAccount>;
  onChange: (field: AccountField, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide font-medium text-zinc-500 mb-1.5">{title}</div>
      <div className="grid grid-cols-3 gap-3">
        {roles.map((r) => {
          const value = config?.[r.field] ?? "";
          const acct = value ? acctById.get(value) : null;
          return (
            <div key={r.field} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{r.label}</label>
                <span className="text-[10px] text-zinc-500">{r.hint}</span>
              </div>
              <select
                value={value}
                onChange={(e) => onChange(r.field, e.target.value)}
                disabled={disabled}
                className={cn(
                  "text-xs px-2 py-1.5 rounded border bg-white dark:bg-zinc-900 w-full",
                  value
                    ? "border-zinc-300 dark:border-zinc-700"
                    : "border-amber-300 dark:border-amber-800",
                )}
              >
                <option value="">— select QBO {r.classification} account —</option>
                {opts.map((a) => (
                  <option key={a.qbo_id} value={a.qbo_id}>
                    {a.name}
                    {a.account_sub_type ? ` · ${a.account_sub_type}` : ""}
                  </option>
                ))}
              </select>
              {acct && (
                <div className="text-[10px] text-zinc-500">
                  QBO id <span className="font-mono">{acct.qbo_id}</span>
                  {acct.account_type ? ` · ${acct.account_type}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onCommit,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const [local, setLocal] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setLocal(value);
  }
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <input
        type="text"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        disabled={disabled}
        className="text-xs px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-full font-mono"
      />
      {hint && <div className="text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}
