// QboDataView — sub-nav consolidating all raw QBO entity mirrors
// (Invoices / Bills / Estimates / Journal Entries / Customers / Vendors /
// Chart of accounts) under a single Finance tab.

import { useState } from "react";
import {
  AccountsView,
  BillsView,
  CustomersView,
  EstimatesView,
  InvoicesView,
  JournalEntriesView,
  VendorsView,
} from "./ListViews";
import { cn } from "../../lib/cn";

type SubTab =
  | "invoices"
  | "bills"
  | "estimates"
  | "journal-entries"
  | "customers"
  | "vendors"
  | "accounts";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "invoices", label: "Invoices" },
  { id: "bills", label: "Bills" },
  { id: "estimates", label: "Estimates" },
  { id: "journal-entries", label: "Journal Entries" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "accounts", label: "Chart of accounts" },
];

export function QboDataView() {
  const [tab, setTab] = useState<SubTab>("invoices");
  return (
    <div className="space-y-4">
      <nav className="flex gap-0.5 border-b border-zinc-200 dark:border-zinc-800 -mt-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "invoices" && <InvoicesView />}
      {tab === "bills" && <BillsView />}
      {tab === "estimates" && <EstimatesView />}
      {tab === "journal-entries" && <JournalEntriesView />}
      {tab === "customers" && <CustomersView />}
      {tab === "vendors" && <VendorsView />}
      {tab === "accounts" && <AccountsView />}
    </div>
  );
}
