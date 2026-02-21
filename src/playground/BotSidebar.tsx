// BotPlayground: Sidebar with bot list and search

import { Search, X } from "lucide-react";
import { cn } from "../lib/cn";
import {
  type BotEntry,
  DEPT_COLORS,
  GROUP_LABELS,
  formatBotName,
  getBotInitials,
} from "./botPlaygroundTypes";

function BotSidebarItem({
  bot,
  isSelected,
  onSelect,
}: {
  bot: BotEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-center gap-2 px-2.5 py-1 rounded-md transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
      )}
    >
      <div
        className={cn(
          "w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0",
          colors.badge,
          colors.text
        )}
      >
        {initials}
      </div>
      <span className="text-xs font-medium truncate">{formatBotName(bot.name)}</span>
      {bot.owner && (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">@{bot.owner}</span>
      )}
    </button>
  );
}

export function BotSidebar({
  bots,
  grouped,
  selectedPath,
  search,
  onSearch,
  onSelect,
}: {
  bots: BotEntry[];
  grouped: [string, BotEntry[]][];
  selectedPath: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (path: string) => void;
}) {
  const filtered = search
    ? bots.filter((b) => {
        const q = search.toLowerCase();
        return formatBotName(b.name).toLowerCase().includes(q) || (b.owner && b.owner.toLowerCase().includes(q));
      })
    : null;

  return (
    <div className="w-[220px] flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col">
      {/* Search */}
      <div className="p-2.5 pb-1.5">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Search bots..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500"
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Bot list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filtered ? (
          filtered.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-4">
              No bots matching "{search}"
            </p>
          ) : (
            <div>
              {filtered.map((bot) => (
                <BotSidebarItem
                  key={bot.dirPath}
                  bot={bot}
                  isSelected={bot.dirPath === selectedPath}
                  onSelect={() => onSelect(bot.dirPath)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {grouped.map(([group, groupBots]) => (
              <div key={group}>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2.5 mb-0.5">
                  {GROUP_LABELS[group] || group}
                </p>
                <div>
                  {groupBots.map((bot) => (
                    <BotSidebarItem
                      key={bot.dirPath}
                      bot={bot}
                      isSelected={bot.dirPath === selectedPath}
                      onSelect={() => onSelect(bot.dirPath)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
