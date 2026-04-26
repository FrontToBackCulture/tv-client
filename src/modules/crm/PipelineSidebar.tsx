// PipelineSidebar — left rail for the deal pipeline view, mirrors the look of
// the ProjectsGrid sidebar. Owns presentation only; state is lifted to CrmModule.

import { ArrowUpDown, Layers, Activity, Trophy, AlertTriangle, Calendar, AlarmClock, History } from "lucide-react";
import { cn } from "../../lib/cn";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";

export type PipelineView = "active" | "all" | "closed_only";
export type DateWindow = "any" | "overdue" | "next_7d" | "next_14d" | "next_21d" | "next_28d" | "beyond_28d";
export type UpdateWindow = "any" | "7d" | "14d" | "21d" | "28d" | "older_28d";

const CLOSE_WINDOW_OPTIONS: { id: DateWindow; label: string; icon: typeof Calendar }[] = [
  { id: "any",        label: "Any time",       icon: Layers },
  { id: "overdue",    label: "Overdue",        icon: AlarmClock },
  { id: "next_7d",    label: "Next 7 days",    icon: Calendar },
  { id: "next_14d",   label: "Next 14 days",   icon: Calendar },
  { id: "next_21d",   label: "Next 21 days",   icon: Calendar },
  { id: "next_28d",   label: "Next 28 days",   icon: Calendar },
  { id: "beyond_28d", label: "Beyond 28 days", icon: History },
];

const UPDATE_WINDOW_OPTIONS: { id: UpdateWindow; label: string; icon: typeof Calendar }[] = [
  { id: "any",       label: "Any time",        icon: Layers },
  { id: "7d",        label: "Last 7 days",     icon: Calendar },
  { id: "14d",       label: "Last 14 days",    icon: Calendar },
  { id: "21d",       label: "Last 21 days",    icon: Calendar },
  { id: "28d",       label: "Last 28 days",    icon: Calendar },
  { id: "older_28d", label: "Longer than 28d", icon: History },
];

const VIEW_OPTIONS: { id: PipelineView; label: string; icon: typeof Layers }[] = [
  { id: "active",      label: "Active",       icon: Activity },
  { id: "all",         label: "All",          icon: Layers },
  { id: "closed_only", label: "Won / Lost",   icon: Trophy },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "company",    label: "Company" },
  { value: "value",      label: "Value" },
  { value: "task_date",  label: "Task Due" },
  { value: "close_date", label: "Close Date" },
];

interface Props {
  view: PipelineView;
  onViewChange: (v: PipelineView) => void;
  solutionFilter: string;
  onSolutionFilterChange: (v: string) => void;
  availableSolutions: { value: string; label: string }[];
  referralFilter: string[];
  onReferralFilterChange: (v: string[]) => void;
  availableReferrals: string[];
  closeWindow: DateWindow;
  onCloseWindowChange: (v: DateWindow) => void;
  updateWindow: UpdateWindow;
  onUpdateWindowChange: (v: UpdateWindow) => void;
  sortField: string;
  onSortFieldChange: (v: string) => void;
  sortDirection: "asc" | "desc";
  onToggleSortDirection: () => void;
  staleCount?: number;
  totalCount?: number;
}

const itemBase = "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors";
const itemActive = "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400";
const itemIdle = "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50";

const selectClass = cn(
  "w-full text-xs px-2 py-1.5 rounded-md border appearance-none cursor-pointer",
  "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800",
  "text-zinc-700 dark:text-zinc-300",
  "hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
);

export function PipelineSidebar({
  view,
  onViewChange,
  solutionFilter,
  onSolutionFilterChange,
  availableSolutions,
  referralFilter,
  onReferralFilterChange,
  availableReferrals,
  closeWindow,
  onCloseWindowChange,
  updateWindow,
  onUpdateWindowChange,
  sortField,
  onSortFieldChange,
  sortDirection,
  onToggleSortDirection,
  staleCount,
  totalCount,
}: Props) {
  const toggleReferral = (name: string) => {
    if (referralFilter.includes(name)) {
      onReferralFilterChange(referralFilter.filter((r) => r !== name));
    } else {
      onReferralFilterChange([...referralFilter, name]);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto px-3 py-3 space-y-3">
      <CollapsibleSection title="View" storageKey="crm-pipeline-view">
        {VIEW_OPTIONS.map((opt) => {
          const isActive = opt.id === view;
          const Icon = opt.icon;
          const badge = opt.id === "all" ? totalCount : undefined;
          return (
            <button
              key={opt.id}
              onClick={() => onViewChange(opt.id)}
              className={cn(itemBase, isActive ? itemActive : itemIdle)}
            >
              <Icon size={13} className={isActive ? "text-teal-500" : "text-zinc-400"} />
              <span className="flex-1">{opt.label}</span>
              {badge !== undefined && <span className="text-[10px] text-zinc-400">{badge}</span>}
            </button>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="Solution" storageKey="crm-pipeline-solution">
        <select
          value={solutionFilter}
          onChange={(e) => onSolutionFilterChange(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Solutions</option>
          {availableSolutions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </CollapsibleSection>

      {availableReferrals.length > 0 && (
        <CollapsibleSection
          title="Referral"
          storageKey="crm-pipeline-referral"
          rightSlot={
            referralFilter.length > 0 ? (
              <button onClick={() => onReferralFilterChange([])} className="text-[10px] text-teal-500 hover:text-teal-400">Clear</button>
            ) : undefined
          }
        >
          {availableReferrals.map((name) => {
            const checked = referralFilter.includes(name);
            return (
              <label key={name} className="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleReferral(name)}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-teal-600 focus:ring-teal-500 w-3 h-3"
                />
                <span className={checked ? "text-teal-600 dark:text-teal-400" : "text-zinc-600 dark:text-zinc-400"}>{name}</span>
              </label>
            );
          })}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Expected Close" storageKey="crm-pipeline-close">
        {CLOSE_WINDOW_OPTIONS.map((opt) => {
          const isActive = opt.id === closeWindow;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => onCloseWindowChange(opt.id)}
              className={cn(itemBase, isActive ? itemActive : itemIdle)}
            >
              <Icon size={13} className={isActive ? "text-teal-500" : "text-zinc-400"} />
              <span className="flex-1">{opt.label}</span>
            </button>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="Last Update" storageKey="crm-pipeline-update">
        {UPDATE_WINDOW_OPTIONS.map((opt) => {
          const isActive = opt.id === updateWindow;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => onUpdateWindowChange(opt.id)}
              className={cn(itemBase, isActive ? itemActive : itemIdle)}
            >
              <Icon size={13} className={isActive ? "text-teal-500" : "text-zinc-400"} />
              <span className="flex-1">{opt.label}</span>
            </button>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="Sort" storageKey="crm-pipeline-sort">
        <div className="flex items-center gap-1.5">
          <select
            value={sortField}
            onChange={(e) => onSortFieldChange(e.target.value)}
            className={selectClass}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={onToggleSortDirection}
            className={cn(
              "p-1.5 rounded-md border transition-colors",
              "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800",
              "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
            title={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
          >
            <ArrowUpDown size={12} className={sortDirection === "desc" ? "rotate-180" : ""} />
          </button>
        </div>
      </CollapsibleSection>

      {staleCount !== undefined && staleCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 px-2 py-1">
          <AlertTriangle size={12} />
          <span>{staleCount} stale deals</span>
        </div>
      )}

      <div className="flex-1" />
    </div>
  );
}
