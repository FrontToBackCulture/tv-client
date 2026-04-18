import { useMemo } from "react";
import {
  useQboAccounts,
  useQboCustomers,
  useQboVendors,
  useQboInvoices,
  useQboBills,
  useQboEstimates,
} from "../../hooks/finance";
import { formatDate, formatMoney } from "./formatters";
import { cn } from "../../lib/cn";

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

// ---------------------------------------------------------------------------

export function AccountsView() {
  const { data = [], isLoading } = useQboAccounts();
  if (isLoading) return <TableShell empty />;
  return (
    <TableShell empty={data.length === 0}>
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
          {data.map((a: any) => (
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
  );
}

export function CustomersView() {
  const { data = [], isLoading } = useQboCustomers();
  if (isLoading) return <TableShell empty />;
  return (
    <TableShell empty={data.length === 0}>
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
          {data.map((c: any) => (
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
  );
}

export function VendorsView() {
  const { data = [], isLoading } = useQboVendors();
  if (isLoading) return <TableShell empty />;
  return (
    <TableShell empty={data.length === 0}>
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
          {data.map((v: any) => (
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
  );
}

export function InvoicesView() {
  const { data = [], isLoading } = useQboInvoices();
  const { data: customers = [] } = useQboCustomers();
  const customerName = useNameLookup(customers);
  if (isLoading) return <TableShell empty />;
  return (
    <TableShell empty={data.length === 0}>
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
          {data.map((i: any) => (
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
  );
}

export function BillsView() {
  const { data = [], isLoading } = useQboBills();
  const { data: vendors = [] } = useQboVendors();
  const vendorName = useNameLookup(vendors);
  if (isLoading) return <TableShell empty />;
  return (
    <TableShell empty={data.length === 0}>
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
          {data.map((b: any) => (
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
  );
}

export function EstimatesView() {
  const { data = [], isLoading } = useQboEstimates();
  const { data: customers = [] } = useQboCustomers();
  const customerName = useNameLookup(customers);
  if (isLoading) return <TableShell empty />;
  return (
    <TableShell empty={data.length === 0}>
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
          {data.map((e: any) => (
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
  );
}
