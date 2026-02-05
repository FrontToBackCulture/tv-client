// src/modules/product/ProductSidebar.tsx
// Product sidebar with navigation, search, and filters

import {
  Boxes,
  Plug,
  Star,
  Package,
  Rocket,
  Globe,
  Database,
  Plus,
  RefreshCw,
  Search,
  Tags,
} from "lucide-react";
import type { ProductView, ProductStats } from "../../lib/product/types";

interface ProductSidebarProps {
  activeView: ProductView;
  onViewChange: (view: ProductView) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  stats?: ProductStats | null;
  onNew: () => void;
}

const views: { id: ProductView; label: string; icon: typeof Boxes; statsKey?: keyof ProductStats }[] = [
  { id: "modules", label: "Modules", icon: Boxes, statsKey: "modules" },
  { id: "connectors", label: "Connectors", icon: Plug, statsKey: "connectors" },
  { id: "features", label: "Features", icon: Star, statsKey: "features" },
  { id: "solutions", label: "Solutions", icon: Package, statsKey: "solutions" },
  { id: "releases", label: "Releases", icon: Rocket, statsKey: "releases" },
  { id: "deployments", label: "Deployments", icon: Globe, statsKey: "deployments" },
  { id: "domains", label: "Domains", icon: Database, statsKey: "domains" },
  { id: "category-library", label: "Category Library", icon: Tags },
];

const NEW_LABELS: Record<ProductView, string> = {
  modules: "New Module",
  connectors: "New Connector",
  features: "New Feature",
  solutions: "New Solution",
  releases: "New Release",
  deployments: "New Deployment",
  domains: "Refresh",
  "category-library": "Scan",
};

export function ProductSidebar({
  activeView,
  onViewChange,
  searchQuery,
  onSearchChange,
  stats,
  onNew,
}: ProductSidebarProps) {
  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="px-3 py-3 border-b border-slate-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Product</h2>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* Views */}
      <div className="px-2 py-3 flex-1 overflow-auto">
        <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2 px-2">
          Views
        </h3>
        <nav className="space-y-0.5">
          {views.map((view) => {
            const isActive = view.id === activeView;
            const Icon = view.icon;
            const count = view.statsKey ? stats?.[view.statsKey] ?? null : null;

            return (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded transition-colors ${
                  isActive
                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
              >
                <Icon
                  size={16}
                  className={isActive ? "text-teal-400" : "text-zinc-500"}
                />
                <span className="text-sm flex-1">{view.label}</span>
                {count !== null && (
                  <span className="text-xs text-zinc-500">{count}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* New button */}
      <div className="px-2 py-2 border-t border-slate-200 dark:border-zinc-800">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          {activeView === "domains" ? <RefreshCw size={16} /> : <Plus size={16} />}
          {NEW_LABELS[activeView]}
        </button>
      </div>
    </div>
  );
}
