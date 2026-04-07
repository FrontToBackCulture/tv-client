import { useState } from "react";
import type { ItemStatus } from "../../../lib/solutions/types";

// ============================================================================
// Status select dropdown
// ============================================================================

const STATUS_COLORS: Record<ItemStatus, string> = {
  pending: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500",
  progress: "bg-blue-500/10 text-blue-400",
  blocked: "bg-red-500/10 text-red-400",
  done: "bg-emerald-500/10 text-emerald-400",
  na: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-600",
};

export function StatusSelect({
  value,
  onChange,
  showNA = true,
}: {
  value: ItemStatus;
  onChange: (v: ItemStatus) => void;
  showNA?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ItemStatus)}
      className={`text-[11px] font-semibold px-2 py-1 rounded border-none cursor-pointer appearance-none pr-5 min-w-[85px] ${STATUS_COLORS[value]}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%236b7280' stroke-width='1.2' fill='none'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 5px center",
      }}
    >
      <option value="pending">Pending</option>
      <option value="progress">In Progress</option>
      <option value="blocked">Blocked</option>
      <option value="done">Done</option>
      {showNA && <option value="na">N/A</option>}
    </select>
  );
}

// ============================================================================
// Clickable grid status cell
// ============================================================================

const GRID_STATUS_COLORS: Record<ItemStatus, string> = {
  pending: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500",
  progress: "bg-blue-500/10 text-blue-400",
  blocked: "bg-red-500/10 text-red-400",
  done: "bg-emerald-500/10 text-emerald-400",
  na: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-600",
};

const GRID_STATUS_LABELS: Record<ItemStatus, string> = {
  pending: "Pending",
  progress: "In Prog",
  blocked: "Blocked",
  done: "Done",
  na: "N/A",
};

const STATUS_CYCLE: ItemStatus[] = ["pending", "progress", "blocked", "done"];

export function GridStatusCell({
  value,
  onChange,
}: {
  value: ItemStatus;
  onChange: (v: ItemStatus) => void;
}) {
  const cycle = () => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(value) + 1) % STATUS_CYCLE.length];
    onChange(next);
  };

  return (
    <button
      onClick={cycle}
      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide cursor-pointer select-none ${GRID_STATUS_COLORS[value]}`}
    >
      {GRID_STATUS_LABELS[value]}
    </button>
  );
}

// ============================================================================
// Owner tag
// ============================================================================

const OWNER_COLORS: Record<string, string> = {
  tv: "bg-blue-500/10 text-blue-400",
  ba: "bg-emerald-500/10 text-emerald-400",
  client: "bg-amber-500/10 text-amber-400",
  both: "bg-purple-500/10 text-purple-400",
};

const OWNER_LABELS: Record<string, string> = {
  tv: "ThinkVAL",
  ba: "BA",
  client: "Client",
  both: "Both",
};

export function OwnerTag({ owner }: { owner: string }) {
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${OWNER_COLORS[owner] || OWNER_COLORS.tv}`}
    >
      {OWNER_LABELS[owner] || owner}
    </span>
  );
}

// ============================================================================
// Outlet/PM chips
// ============================================================================

export function Chip({
  label,
  excluded = false,
  onClick,
}: {
  label: string;
  excluded?: boolean;
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block cursor-pointer transition-opacity hover:opacity-75 ${
        excluded
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-600 line-through"
          : "bg-blue-500/10 text-blue-400"
      }`}
    >
      {label}
    </span>
  );
}

export function ChipWrap({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>;
}

// ============================================================================
// Section header
// ============================================================================

const BADGE_COLORS: Record<string, string> = {
  purple: "bg-purple-500/10 text-purple-400",
  cyan: "bg-cyan-500/10 text-cyan-400",
  teal: "bg-teal-500/10 text-teal-400",
  amber: "bg-amber-500/10 text-amber-400",
  green: "bg-emerald-500/10 text-emerald-400",
  blue: "bg-blue-500/10 text-blue-400",
};

export function SectionHeader({
  badge,
  badgeColor = "blue",
  title,
  progress,
  description,
}: {
  badge: string;
  badgeColor?: string;
  title: string;
  progress?: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 mb-1 pb-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <span
          className={`text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded ${BADGE_COLORS[badgeColor] || BADGE_COLORS.blue}`}
        >
          {badge}
        </span>
        <span className="text-sm font-semibold">{title}</span>
        {progress && (
          <span className="ml-auto text-[11px] font-semibold text-zinc-500 font-mono">
            {progress}
          </span>
        )}
      </div>
      {description && (
        <p className="text-[11px] text-zinc-500 mb-3">{description}</p>
      )}
    </div>
  );
}

// ============================================================================
// Collapsible section (wraps SectionHeader + content)
// ============================================================================

export function CollapsibleSection({
  badge,
  badgeColor = "blue",
  title,
  progress,
  description,
  defaultOpen = true,
  children,
}: {
  badge: string;
  badgeColor?: string;
  title: string;
  progress?: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 mb-1 pb-2.5 border-b border-zinc-200 dark:border-zinc-800 cursor-pointer bg-transparent border-t-0 border-x-0 text-left"
      >
        <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""} text-zinc-400`}>&#9654;</span>
        <span
          className={`text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded ${BADGE_COLORS[badgeColor] || BADGE_COLORS.blue}`}
        >
          {badge}
        </span>
        <span className="text-sm font-semibold">{title}</span>
        {progress && (
          <span className="ml-auto text-[11px] font-semibold text-zinc-500 font-mono">
            {progress}
          </span>
        )}
      </button>
      {open && (
        <>
          {description && (
            <p className="text-[11px] text-zinc-500 mb-3">{description}</p>
          )}
          {children}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Editable input
// ============================================================================

export function EditableInput({
  value,
  onChange,
  placeholder = "",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`text-xs text-zinc-700 dark:text-zinc-200 bg-transparent border border-transparent rounded px-1.5 py-0.5 w-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 focus:bg-white dark:focus:bg-zinc-800 focus:border-blue-500 focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic ${className}`}
    />
  );
}

// ============================================================================
// Section badge for sync items type column
// ============================================================================

const TYPE_BADGE_COLORS: Record<string, string> = {
  POS: "bg-cyan-500/10 text-cyan-400",
  Payment: "bg-amber-500/10 text-amber-400",
  Bank: "bg-purple-500/10 text-purple-400",
  Recon: "bg-emerald-500/10 text-emerald-400",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${TYPE_BADGE_COLORS[type] || TYPE_BADGE_COLORS.POS}`}
    >
      {type}
    </span>
  );
}

// ============================================================================
// Add button
// ============================================================================

export function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-medium px-3 py-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 bg-transparent cursor-pointer transition-colors hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/5 mt-2"
    >
      {label}
    </button>
  );
}

// ============================================================================
// Delete button
// ============================================================================

export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-red-400 opacity-50 hover:opacity-100 cursor-pointer bg-transparent border-none text-sm px-1 transition-opacity"
    >
      &times;
    </button>
  );
}
