import { useState } from "react";
import { ConnectionCard } from "./ConnectionCard";
import { SyncPanel } from "./SyncPanel";
import { DashboardTiles } from "./DashboardTiles";
import {
  AccountsView,
  BillsView,
  CustomersView,
  EstimatesView,
  InvoicesView,
  VendorsView,
} from "./ListViews";
import { ReportsView } from "./ReportsView";
import { FYReviewView } from "./FYReviewView";
import { cn } from "../../lib/cn";

type Tab = "overview" | "reports" | "fy-review" | "invoices" | "bills" | "estimates" | "customers" | "vendors" | "accounts";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Reports" },
  { id: "fy-review", label: "FY Review" },
  { id: "invoices", label: "Invoices" },
  { id: "bills", label: "Bills" },
  { id: "estimates", label: "Estimates" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "accounts", label: "Chart of accounts" },
];

export function FinanceModule() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-6 pt-6 pb-0">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Finance</h1>
          <p className="text-sm text-zinc-500 mt-1">
            QuickBooks-backed books, synced to the mgmt workspace.
          </p>
          <nav className="flex gap-0.5 mt-5 -mb-px">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                  tab === t.id
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl w-full mx-auto px-6 py-6 space-y-6">
          {tab === "overview" && (
            <>
              <DashboardTiles />
              <ConnectionCard />
              <SyncPanel />
            </>
          )}
          {tab === "reports" && <ReportsView />}
          {tab === "fy-review" && <FYReviewView />}
          {tab === "invoices" && <InvoicesView />}
          {tab === "bills" && <BillsView />}
          {tab === "estimates" && <EstimatesView />}
          {tab === "customers" && <CustomersView />}
          {tab === "vendors" && <VendorsView />}
          {tab === "accounts" && <AccountsView />}
        </div>
      </div>
    </div>
  );
}
