import { useState } from "react";
import {
  LayoutDashboard,
  FileBarChart,
  ClipboardCheck,
  ListChecks,
  Receipt,
  Database,
  FileSignature,
} from "lucide-react";
import { ConnectionCard } from "./ConnectionCard";
import { SyncPanel } from "./SyncPanel";
import { DashboardTiles } from "./DashboardTiles";
import { ReportsView } from "./ReportsView";
import { FYReviewView } from "./FYReviewView";
import { ContractsView } from "./ContractsView";
import { InvoiceRecognitionView } from "./InvoiceRecognitionView";
import { ExpenseReviewView } from "./ExpenseReviewView";
import { QboDataView } from "./QboDataView";
import { PageHeader } from "../../components/PageHeader";
import { ViewTab } from "../../components/ViewTab";
import { cn } from "../../lib/cn";

type Tab = "overview" | "reports" | "fy-review" | "invoice-recognition" | "expense-review" | "qbo-data" | "contracts";

// Match the icon-led tab pattern used by Domains, Inbox, Projects, etc.
// Each tab pairs an explicit Lucide icon with the label.
const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview",            label: "Overview",            icon: LayoutDashboard },
  { id: "reports",             label: "Reports",             icon: FileBarChart },
  { id: "fy-review",           label: "FY Review",           icon: ClipboardCheck },
  { id: "invoice-recognition", label: "Invoice Recognition", icon: ListChecks },
  { id: "expense-review",      label: "Expense Review",      icon: Receipt },
  { id: "qbo-data",            label: "QBO Data",            icon: Database },
  { id: "contracts",           label: "Contracts",           icon: FileSignature },
];

const TAB_STORAGE_KEY = "tv-finance-active-tab";
const VALID_TABS: Tab[] = ["overview", "reports", "fy-review", "invoice-recognition", "expense-review", "qbo-data", "contracts"];

export function FinanceModule() {
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const raw = localStorage.getItem(TAB_STORAGE_KEY);
      return raw && (VALID_TABS as string[]).includes(raw) ? (raw as Tab) : "overview";
    } catch {
      return "overview";
    }
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try { localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  // Wide tabs (table-heavy) get the full viewport width; the rest stay
  // capped at max-w-6xl for comfortable reading of cards/forms.
  const wide = tab === "fy-review" || tab === "contracts"
    || tab === "invoice-recognition" || tab === "expense-review" || tab === "qbo-data";

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <PageHeader
        description="QuickBooks-backed books, synced to the mgmt workspace."
        tabs={TABS.map((t) => (
          <ViewTab
            key={t.id}
            label={t.label}
            icon={t.icon}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
          />
        ))}
      />

      <div className="flex-1 overflow-y-auto">
        <div className={cn("w-full mx-auto px-6 py-6 space-y-6", wide ? "max-w-none" : "max-w-6xl")}>
          {tab === "overview" && (
            <>
              <DashboardTiles />
              <ConnectionCard />
              <SyncPanel />
            </>
          )}
          {tab === "reports" && <ReportsView />}
          {tab === "fy-review" && <FYReviewView />}
          {tab === "contracts" && <ContractsView />}
          {tab === "invoice-recognition" && <InvoiceRecognitionView />}
          {tab === "expense-review" && <ExpenseReviewView />}
          {tab === "qbo-data" && <QboDataView />}
        </div>
      </div>
    </div>
  );
}
