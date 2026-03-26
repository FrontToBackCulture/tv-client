// Single prospect row in the pipeline list

import { cn } from "../../lib/cn";
import { StageBadge, ProspectTypeBadge } from "./ProspectingComponents";
import type { ProspectContact } from "../../hooks/prospecting";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface ProspectRowProps {
  contact: ProspectContact;
  isSelected: boolean;
  onSelect: () => void;
}

export function ProspectRow({ contact, isSelected, onSelect }: ProspectRowProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 border-l-2 transition-colors",
        isSelected
          ? "border-l-teal-500 bg-teal-50/50 dark:bg-teal-950/10"
          : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {contact.name}
            </span>
            <StageBadge stage={contact.prospect_stage} size="xs" />
            {contact.prospect_type?.map(t => (
              <ProspectTypeBadge key={t} type={t} />
            ))}
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
            {contact.company_display_name || contact.company_name || "—"}
            {contact.role && ` · ${contact.role}`}
          </div>
        </div>
        <span className="text-[9px] text-zinc-400 flex-shrink-0">
          {timeAgo(contact.updated_at)}
        </span>
      </div>
    </button>
  );
}
