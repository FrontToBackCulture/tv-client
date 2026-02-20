// src/modules/crm/ClientRow.tsx
// Client-specific list row with engagement health data

import { memo } from "react";
import { Mail, FileText, Calendar, Phone, ClipboardList, User, AlertCircle } from "lucide-react";
import type { Company } from "../../lib/crm/types";
import type { ClientEngagementData } from "../../hooks/useClientEngagement";
import { timeAgo } from "./CrmComponents";

interface ClientRowProps {
  company: Company;
  engagement: ClientEngagementData | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

const activityIcon: Record<string, typeof Mail> = {
  email: Mail,
  note: FileText,
  meeting: Calendar,
  call: Phone,
  task: ClipboardList,
};

const activityIconColor: Record<string, string> = {
  email: "text-blue-500",
  note: "text-zinc-400",
  meeting: "text-purple-500",
  call: "text-green-500",
  task: "text-yellow-500",
};

export const ClientRow = memo(function ClientRow({ company, engagement, isSelected, onSelect }: ClientRowProps) {
  const health = engagement?.health;
  const dotColor = health?.dotColor || "bg-zinc-300 dark:bg-zinc-600";
  const lastActivity = engagement?.lastActivity;
  const count30d = engagement?.activityCount30d || 0;
  const primaryContact = engagement?.primaryContactName;

  const Icon = lastActivity ? activityIcon[lastActivity.type] || FileText : null;
  const iconColor = lastActivity ? activityIconColor[lastActivity.type] || "text-zinc-400" : "";

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 flex flex-col gap-1 transition-colors ${
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/20 border-l-2 border-teal-500"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-l-2 border-transparent"
      }`}
    >
      {/* Line 1: health dot, name, industry, count pill, time-ago */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
          {company.display_name || company.name}
        </span>
        {company.industry && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 truncate max-w-[80px]">
            {company.industry}
          </span>
        )}
        <div className="flex-1" />
        {count30d > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 tabular-nums flex-shrink-0">
            {count30d}
          </span>
        )}
        {lastActivity && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums flex-shrink-0">
            {timeAgo(lastActivity.activity_date)}
          </span>
        )}
      </div>

      {/* Line 2: activity icon + subject  |  primary contact */}
      <div className="flex items-center gap-2 pl-4 min-w-0">
        {lastActivity && Icon ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Icon size={11} className={`flex-shrink-0 ${iconColor}`} />
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {lastActivity.subject || "No subject"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <AlertCircle size={11} className="flex-shrink-0 text-red-400" />
            <span className="text-[11px] text-red-400 dark:text-red-500">No logged activity</span>
          </div>
        )}
        {primaryContact && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 flex items-center gap-1">
            <User size={9} />
            {primaryContact}
          </span>
        )}
      </div>
    </button>
  );
});
