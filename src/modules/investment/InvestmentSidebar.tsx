// Inner sidebar for the Investment module — switches between the 4 pages.
// Separate from the global left nav (ActivityBar). Mirrors the pattern used by
// InboxSidebar/CRMSidebar where the module has its own internal navigation
// because its view state is not URL-routed.

import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, List, TrendingUp, Coins } from "lucide-react";
import { cn } from "../../lib/cn";

export type InvestmentView = "overview" | "positions" | "trades" | "dividends";

interface ViewDef {
  id: InvestmentView;
  label: string;
  icon: LucideIcon;
}

const VIEWS: ViewDef[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "positions", label: "Positions", icon: List },
  { id: "trades", label: "Trades", icon: TrendingUp },
  { id: "dividends", label: "Dividends", icon: Coins },
];

interface InvestmentSidebarProps {
  active: InvestmentView;
  onChange: (view: InvestmentView) => void;
}

export function InvestmentSidebar({ active, onChange }: InvestmentSidebarProps) {
  return (
    <div className="w-48 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-4">
      <div className="px-3 mb-2 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
        Investment
      </div>
      <nav className="space-y-0.5 px-2">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const isActive = active === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900",
              )}
            >
              <Icon size={14} className="flex-shrink-0" />
              {v.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
