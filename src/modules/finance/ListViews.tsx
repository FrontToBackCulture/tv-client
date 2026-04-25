import { useMemo, useState } from "react";
import {
  useQboAccounts,
  useQboCustomers,
  useQboVendors,
  useQboInvoices,
  useQboBills,
  useQboEstimates,
  useQboJournalEntries,
} from "../../hooks/finance";
import { formatDate, formatMoney } from "./formatters";
import { cn } from "../../lib/cn";

const RECOG_DOC_RE = /^(\d+)-(SUB|SVC|OTHER)-(\d+)$/;

function useNameLookup(rows: any[], key: string = "qbo_id", valueKey: string = "display_name") {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows ?? []) {
      if (r?.[key]) map.set(r[key], r[valueKey] ?? r[key]);
    }
    return (id: string | null | undefined): string => (id ? map.get(id) ?? id : "—");
  }, [rows, key, valueKey]);
}

function TableShell({ children, empty }: { children?: React.ReactNode; empty?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {empty ? (
        <div className="p-8 text-center text-sm text-zinc-500">
          No records yet — run a sync from the Overview tab.
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={cn(
      "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800",
      align === "right" && "text-right",
    )}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", mono = false, muted = false }: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td className={cn(
      "px-3 py-2 text-xs border-b border-zinc-100 dark:border-zinc-800/60",
      align === "right" && "text-right tabular-nums",
      mono && "font-mono",
      muted ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200",
    )}>
      {children}
    </td>
  );
}

// --- Shared filter primitives ----------------------------------------------

const FILTER_INPUT_CLS =
  "text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900";
const FILTER_LABEL_CLS = "text-[11px] font-medium uppercase tracking-wider text-zinc-500";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={FILTER_LABEL_CLS}>{label}</label>
      {children}
    </div>
  );
}

function FilterBar({
  children,
  hasActive,
  onClear,
  right,
}: {
  children: React.ReactNode;
  hasActive: boolean;
  onClear: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      {children}
      {hasActive && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline pb-1.5"
        >
          Clear
        </button>
      )}
      <div className="text-xs text-zinc-500 ml-auto pb-1.5">{right}</div>
    </div>
  );
}

function TextFilter({
  label,
  value,
  onChange,
  placeholder = "Search",
  width = "w-40",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <FilterField label={label}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(FILTER_INPUT_CLS, width)}
      />
    </FilterField>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  width = "w-48",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[] | string[];
  allLabel?: string;
  width?: string;
}) {
  const normalized = (options as any[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <FilterField label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(FILTER_INPUT_CLS, width)}
      >
        <option value="">{allLabel}</option>
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FilterField>
  );
}

function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  label = "Date range",
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  label?: string;
}) {
  return (
    <FilterField label={label}>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className={cn(FILTER_INPUT_CLS, "w-[140px]")}
        />
        <span className="text-zinc-400 text-xs">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className={cn(FILTER_INPUT_CLS, "w-[140px]")}
        />
      </div>
    </FilterField>
  );
}

function AmountRangeFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
  label = "Amount",
}: {
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  label?: string;
}) {
  return (
    <FilterField label={label}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="Min"
          className={cn(FILTER_INPUT_CLS, "w-24")}
        />
        <span className="text-zinc-400 text-xs">→</span>
        <input
          type="number"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder="Max"
          className={cn(FILTER_INPUT_CLS, "w-24")}
        />
      </div>
    </FilterField>
  );
}

// Apply a date-string range ("YYYY-MM-DD") filter to a row value (lexical
// comparison is safe for ISO dates). Empty bounds are treated as open.
function inDateRange(val: string | null | undefined, from: string, to: string): boolean {
  const v = val ?? "";
  if (from && v < from) return false;
  if (to && v > to) return false;
  return true;
}

function inNumberRange(val: number, min: string, max: string): boolean {
  if (min !== "") {
    const n = Number(min);
    if (!isNaN(n) && val < n) return false;
  }
  if (max !== "") {
    const n = Number(max);
    if (!isNaN(n) && val > n) return false;
  }
  return true;
}

// Match a needle against an arbitrary list of row values. Number values also
// match on their integer form so "$6750" / "6750" hits amount fields.
function matchesGlobal(needle: string, values: Array<string | number | null | undefined>): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase().trim();
  if (!n) return true;
  const parts: string[] = [];
  for (const v of values) {
    if (v == null) continue;
    if (typeof v === "number") {
      parts.push(String(v));
      parts.push(v.toFixed(2));
    } else {
      parts.push(String(v));
    }
  }
  return parts.join(" ").toLowerCase().includes(n);
}

// ---------------------------------------------------------------------------

export function AccountsView() {
  const { data = [], isLoading } = useQboAccounts();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [active, setActive] = useState("");
  const [balMin, setBalMin] = useState("");
  const [balMax, setBalMax] = useState("");

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of data as any[]) if (a.account_type) set.add(a.account_type);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data as any[]).filter((a) => {
      if (!matchesGlobal(search, [
        a.name, a.account_type, a.account_sub_type, a.qbo_id,
        Number(a.current_balance ?? 0),
      ])) return false;
      if (type && a.account_type !== type) return false;
      if (active === "true" && !a.active) return false;
      if (active === "false" && a.active) return false;
      if (!inNumberRange(Number(a.current_balance ?? 0), balMin, balMax)) return false;
      return true;
    });
  }, [data, search, type, active, balMin, balMax]);

  const hasActive = !!(search || type || active || balMin || balMax);
  const clear = () => {
    setSearch(""); setType(""); setActive(""); setBalMin(""); setBalMax("");
  };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} accounts</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Name, type, balance…" width="w-56" />
        <SelectFilter label="Type" value={type} onChange={setType} options={typeOptions} allLabel="All types" />
        <SelectFilter
          label="Active"
          value={active}
          onChange={setActive}
          options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]}
          allLabel="All"
          width="w-32"
        />
        <AmountRangeFilter label="Balance" min={balMin} max={balMax} onMinChange={setBalMin} onMaxChange={setBalMax} />
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Sub-type</Th>
              <Th align="right">Balance</Th>
              <Th>Active</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a: any) => (
              <tr key={a.qbo_id}>
                <Td>{a.name}</Td>
                <Td muted>{a.account_type ?? "—"}</Td>
                <Td muted>{a.account_sub_type ?? "—"}</Td>
                <Td align="right">{formatMoney(a.current_balance)}</Td>
                <Td muted>{a.active ? "Yes" : "No"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function CustomersView() {
  const { data = [], isLoading } = useQboCustomers();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [balMin, setBalMin] = useState("");
  const [balMax, setBalMax] = useState("");

  const filtered = useMemo(() => {
    return (data as any[]).filter((c) => {
      if (!matchesGlobal(search, [
        c.display_name, c.company_name, c.email, c.phone, c.qbo_id,
        Number(c.balance ?? 0),
      ])) return false;
      if (active === "true" && !c.active) return false;
      if (active === "false" && c.active) return false;
      if (!inNumberRange(Number(c.balance ?? 0), balMin, balMax)) return false;
      return true;
    });
  }, [data, search, active, balMin, balMax]);

  const hasActive = !!(search || active || balMin || balMax);
  const clear = () => { setSearch(""); setActive(""); setBalMin(""); setBalMax(""); };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} customers</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Name, company, email…" width="w-64" />
        <SelectFilter
          label="Active"
          value={active}
          onChange={setActive}
          options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]}
          allLabel="All"
          width="w-32"
        />
        <AmountRangeFilter label="Balance" min={balMin} max={balMax} onMinChange={setBalMin} onMaxChange={setBalMax} />
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Email</Th>
              <Th align="right">Balance</Th>
              <Th>Active</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.qbo_id}>
                <Td>{c.display_name}</Td>
                <Td muted>{c.company_name ?? "—"}</Td>
                <Td muted>{c.email ?? "—"}</Td>
                <Td align="right">{formatMoney(c.balance)}</Td>
                <Td muted>{c.active ? "Yes" : "No"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function VendorsView() {
  const { data = [], isLoading } = useQboVendors();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [balMin, setBalMin] = useState("");
  const [balMax, setBalMax] = useState("");

  const filtered = useMemo(() => {
    return (data as any[]).filter((v) => {
      if (!matchesGlobal(search, [
        v.display_name, v.company_name, v.email, v.phone, v.qbo_id,
        Number(v.balance ?? 0),
      ])) return false;
      if (active === "true" && !v.active) return false;
      if (active === "false" && v.active) return false;
      if (!inNumberRange(Number(v.balance ?? 0), balMin, balMax)) return false;
      return true;
    });
  }, [data, search, active, balMin, balMax]);

  const hasActive = !!(search || active || balMin || balMax);
  const clear = () => { setSearch(""); setActive(""); setBalMin(""); setBalMax(""); };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} vendors</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Name, company, email…" width="w-64" />
        <SelectFilter
          label="Active"
          value={active}
          onChange={setActive}
          options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]}
          allLabel="All"
          width="w-32"
        />
        <AmountRangeFilter label="Balance" min={balMin} max={balMax} onMinChange={setBalMin} onMaxChange={setBalMax} />
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Email</Th>
              <Th align="right">Balance</Th>
              <Th>Active</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v: any) => (
              <tr key={v.qbo_id}>
                <Td>{v.display_name}</Td>
                <Td muted>{v.company_name ?? "—"}</Td>
                <Td muted>{v.email ?? "—"}</Td>
                <Td align="right">{formatMoney(v.balance)}</Td>
                <Td muted>{v.active ? "Yes" : "No"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function InvoicesView() {
  const { data = [], isLoading } = useQboInvoices();
  const { data: customers = [] } = useQboCustomers();
  const customerName = useNameLookup(customers);

  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");

  const customerOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const i of data as any[]) {
      const id = i.customer_qbo_id;
      if (id) set.set(id, customerName(id));
    }
    return Array.from(set.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, customerName]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of data as any[]) if (i.status) set.add(i.status);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data as any[]).filter((i) => {
      if (!matchesGlobal(search, [
        i.doc_number, customerName(i.customer_qbo_id), i.status,
        i.txn_date, i.due_date, i.private_note, i.memo,
        Number(i.total_amount ?? 0), Number(i.balance ?? 0),
      ])) return false;
      if (customer && i.customer_qbo_id !== customer) return false;
      if (status && i.status !== status) return false;
      if (!inDateRange(i.txn_date, dateFrom, dateTo)) return false;
      if (!inNumberRange(Number(i.total_amount ?? 0), amtMin, amtMax)) return false;
      return true;
    });
  }, [data, search, customer, status, dateFrom, dateTo, amtMin, amtMax, customerName]);

  const hasActive = !!(search || customer || status || dateFrom || dateTo || amtMin || amtMax);
  const clear = () => {
    setSearch(""); setCustomer(""); setStatus("");
    setDateFrom(""); setDateTo(""); setAmtMin(""); setAmtMax("");
  };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} invoices</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Doc #, customer, amount…" width="w-64" />
        <SelectFilter label="Customer" value={customer} onChange={setCustomer} options={customerOptions} allLabel="All customers" width="w-56" />
        <SelectFilter label="Status" value={status} onChange={setStatus} options={statusOptions} allLabel="All statuses" width="w-36" />
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <AmountRangeFilter min={amtMin} max={amtMax} onMinChange={setAmtMin} onMaxChange={setAmtMax} />
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Date</Th>
              <Th>Due</Th>
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i: any) => (
              <tr key={i.qbo_id}>
                <Td mono>{i.doc_number ?? i.qbo_id}</Td>
                <Td>{formatDate(i.txn_date)}</Td>
                <Td muted>{formatDate(i.due_date)}</Td>
                <Td>{customerName(i.customer_qbo_id)}</Td>
                <Td muted>{i.status ?? "—"}</Td>
                <Td align="right">{formatMoney(i.total_amount, i.currency ?? undefined)}</Td>
                <Td align="right">
                  <span className={cn(Number(i.balance) > 0 && "text-amber-600 dark:text-amber-400 font-medium")}>
                    {formatMoney(i.balance, i.currency ?? undefined)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function BillsView() {
  const { data = [], isLoading } = useQboBills();
  const { data: vendors = [] } = useQboVendors();
  const vendorName = useNameLookup(vendors);

  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");

  const vendorOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const b of data as any[]) {
      const id = b.vendor_qbo_id;
      if (id) set.set(id, vendorName(id));
    }
    return Array.from(set.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, vendorName]);

  const filtered = useMemo(() => {
    return (data as any[]).filter((b) => {
      if (!matchesGlobal(search, [
        b.doc_number, vendorName(b.vendor_qbo_id),
        b.txn_date, b.due_date, b.private_note, b.memo,
        Number(b.total_amount ?? 0), Number(b.balance ?? 0),
      ])) return false;
      if (vendor && b.vendor_qbo_id !== vendor) return false;
      if (!inDateRange(b.txn_date, dateFrom, dateTo)) return false;
      if (!inNumberRange(Number(b.total_amount ?? 0), amtMin, amtMax)) return false;
      return true;
    });
  }, [data, search, vendor, dateFrom, dateTo, amtMin, amtMax, vendorName]);

  const hasActive = !!(search || vendor || dateFrom || dateTo || amtMin || amtMax);
  const clear = () => {
    setSearch(""); setVendor("");
    setDateFrom(""); setDateTo(""); setAmtMin(""); setAmtMax("");
  };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} bills</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Doc #, vendor, amount…" width="w-64" />
        <SelectFilter label="Vendor" value={vendor} onChange={setVendor} options={vendorOptions} allLabel="All vendors" width="w-56" />
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <AmountRangeFilter min={amtMin} max={amtMax} onMinChange={setAmtMin} onMaxChange={setAmtMax} />
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Date</Th>
              <Th>Due</Th>
              <Th>Vendor</Th>
              <Th align="right">Total</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b: any) => (
              <tr key={b.qbo_id}>
                <Td mono>{b.doc_number ?? b.qbo_id}</Td>
                <Td>{formatDate(b.txn_date)}</Td>
                <Td muted>{formatDate(b.due_date)}</Td>
                <Td>{vendorName(b.vendor_qbo_id)}</Td>
                <Td align="right">{formatMoney(b.total_amount, b.currency ?? undefined)}</Td>
                <Td align="right">
                  <span className={cn(Number(b.balance) > 0 && "text-amber-600 dark:text-amber-400 font-medium")}>
                    {formatMoney(b.balance, b.currency ?? undefined)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

// Pre-compute customer + total per JE row so the search filter and table both
// derive from the same numbers. Returns an enriched copy of the JE.
function enrichJe(je: any) {
  const lines = (je.lines ?? []) as any[];
  let totalDebits = 0;
  let customer: string | null = null;
  for (const l of lines) {
    const det = l.JournalEntryLineDetail;
    if (!det) continue;
    const a = Number(l.Amount ?? 0);
    if (det.PostingType === "Debit") totalDebits += a;
    if (!customer && det.Entity?.EntityRef?.name) customer = det.Entity.EntityRef.name;
  }
  const total = Number(je.total_amount ?? 0) || totalDebits;
  return { ...je, _customer: customer, _total: total };
}

export function JournalEntriesView() {
  const { data = [], isLoading } = useQboJournalEntries();
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");
  const [recogOnly, setRecogOnly] = useState(false);

  const enriched = useMemo(() => (data as any[]).map(enrichJe), [data]);

  const customerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const j of enriched) if (j._customer) set.add(j._customer);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter((j) => {
      if (recogOnly && !RECOG_DOC_RE.test(j.doc_number ?? "")) return false;
      if (!matchesGlobal(search, [
        j.doc_number, j._customer, j.txn_date, j.private_note,
        Number(j._total ?? 0),
      ])) return false;
      if (customer && j._customer !== customer) return false;
      if (!inDateRange(j.txn_date, dateFrom, dateTo)) return false;
      if (!inNumberRange(Number(j._total ?? 0), amtMin, amtMax)) return false;
      return true;
    });
  }, [enriched, search, customer, dateFrom, dateTo, amtMin, amtMax, recogOnly]);

  const recogCount = useMemo(
    () => (data as any[]).filter((j) => RECOG_DOC_RE.test(j.doc_number ?? "")).length,
    [data],
  );

  const hasActive = !!(search || customer || dateFrom || dateTo || amtMin || amtMax || recogOnly);
  const clear = () => {
    setSearch(""); setCustomer("");
    setDateFrom(""); setDateTo(""); setAmtMin(""); setAmtMax("");
    setRecogOnly(false);
  };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} JEs</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Doc #, customer, amount, note…" width="w-64" />
        <SelectFilter label="Customer" value={customer} onChange={setCustomer} options={customerOptions} allLabel="All customers" width="w-56" />
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <AmountRangeFilter min={amtMin} max={amtMax} onMinChange={setAmtMin} onMaxChange={setAmtMax} />
        <label className="text-xs text-zinc-500 flex items-center gap-2 cursor-pointer pb-1.5">
          <input
            type="checkbox"
            checked={recogOnly}
            onChange={(e) => setRecogOnly(e.target.checked)}
          />
          Only recognition JEs ({recogCount})
        </label>
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Doc #</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th align="right">Amount</Th>
              <Th>Lines (DR / CR)</Th>
              <Th>Private note</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j: any) => (
              <JeRow key={j.qbo_id} je={j} />
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function JeRow({ je }: { je: any }) {
  const lines = (je.lines ?? []) as any[];
  const drs: string[] = [];
  const crs: string[] = [];
  let totalDebits = 0;
  let customer: string | null = null;
  for (const l of lines) {
    const det = l.JournalEntryLineDetail;
    if (!det) continue;
    const acct = det.AccountRef?.name ?? det.AccountRef?.value ?? "?";
    const amt = Number(l.Amount ?? 0);
    if (det.PostingType === "Debit") {
      drs.push(`${acct} ${formatMoney(amt)}`);
      totalDebits += amt;
    } else if (det.PostingType === "Credit") {
      crs.push(`${acct} ${formatMoney(amt)}`);
    }
    // First line with an Entity wins as the customer label.
    if (!customer) {
      const ent = det.Entity?.EntityRef;
      if (ent?.name) customer = ent.name;
    }
  }
  // Use stored total when present, otherwise sum of debits (QBO often leaves
  // total_amount null on JournalEntry).
  const total = Number(je.total_amount ?? 0) || totalDebits;
  const isRecog = RECOG_DOC_RE.test(je.doc_number ?? "");
  return (
    <tr>
      <Td mono>
        {je.doc_number ?? je.qbo_id}
        {isRecog && (
          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
            RECOG
          </span>
        )}
      </Td>
      <Td>{formatDate(je.txn_date)}</Td>
      <Td muted>{customer ?? "—"}</Td>
      <Td align="right">{formatMoney(total, je.currency ?? undefined)}</Td>
      <Td muted>
        <div className="space-y-0.5">
          {drs.map((d, i) => <div key={`dr-${i}`}>DR {d}</div>)}
          {crs.map((c, i) => <div key={`cr-${i}`} className="text-zinc-400">CR {c}</div>)}
        </div>
      </Td>
      <Td muted>
        <span className="line-clamp-2 max-w-[40ch] inline-block" title={je.private_note ?? ""}>
          {je.private_note ?? "—"}
        </span>
      </Td>
    </tr>
  );
}

export function EstimatesView() {
  const { data = [], isLoading } = useQboEstimates();
  const { data: customers = [] } = useQboCustomers();
  const customerName = useNameLookup(customers);

  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");

  const customerOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const e of data as any[]) {
      const id = e.customer_qbo_id;
      if (id) set.set(id, customerName(id));
    }
    return Array.from(set.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, customerName]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of data as any[]) if (e.status) set.add(e.status);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data as any[]).filter((e) => {
      if (!matchesGlobal(search, [
        e.doc_number, customerName(e.customer_qbo_id), e.status,
        e.txn_date, e.expiration_date, e.private_note, e.memo,
        Number(e.total_amount ?? 0),
      ])) return false;
      if (customer && e.customer_qbo_id !== customer) return false;
      if (status && e.status !== status) return false;
      if (!inDateRange(e.txn_date, dateFrom, dateTo)) return false;
      if (!inNumberRange(Number(e.total_amount ?? 0), amtMin, amtMax)) return false;
      return true;
    });
  }, [data, search, customer, status, dateFrom, dateTo, amtMin, amtMax, customerName]);

  const hasActive = !!(search || customer || status || dateFrom || dateTo || amtMin || amtMax);
  const clear = () => {
    setSearch(""); setCustomer(""); setStatus("");
    setDateFrom(""); setDateTo(""); setAmtMin(""); setAmtMax("");
  };

  if (isLoading) return <TableShell empty />;
  return (
    <div className="space-y-3">
      <FilterBar
        hasActive={hasActive}
        onClear={clear}
        right={<>{filtered.length} of {data.length} estimates</>}
      >
        <TextFilter label="Search" value={search} onChange={setSearch} placeholder="Doc #, customer, amount…" width="w-64" />
        <SelectFilter label="Customer" value={customer} onChange={setCustomer} options={customerOptions} allLabel="All customers" width="w-56" />
        <SelectFilter label="Status" value={status} onChange={setStatus} options={statusOptions} allLabel="All statuses" width="w-36" />
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <AmountRangeFilter min={amtMin} max={amtMax} onMinChange={setAmtMin} onMaxChange={setAmtMax} />
      </FilterBar>
      <TableShell empty={filtered.length === 0}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Date</Th>
              <Th>Expires</Th>
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e: any) => (
              <tr key={e.qbo_id}>
                <Td mono>{e.doc_number ?? e.qbo_id}</Td>
                <Td>{formatDate(e.txn_date)}</Td>
                <Td muted>{formatDate(e.expiration_date)}</Td>
                <Td>{customerName(e.customer_qbo_id)}</Td>
                <Td muted>{e.status ?? "—"}</Td>
                <Td align="right">{formatMoney(e.total_amount, e.currency ?? undefined)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
