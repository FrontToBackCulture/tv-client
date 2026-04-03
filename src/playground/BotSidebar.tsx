// BotPlayground: Sidebar with bot list, search, and expandable skill tree

import { Search, X, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import {
  type BotEntry,
  DEPT_COLORS,
  GROUP_LABELS,
  SKILL_STATUS_CONFIG,
  type SkillStatus,
  formatBotName,
  getBotInitials,
} from "./botPlaygroundTypes";

export interface SidebarSkill {
  name: string;
  path: string;
  title: string;
  status: SkillStatus;
}

function BotSidebarItem({
  bot,
  isSelected,
  isExpanded,
  skills,
  selectedSkillName,
  onSelect,
  onSkillClick,
}: {
  bot: BotEntry;
  isSelected: boolean;
  isExpanded: boolean;
  skills: SidebarSkill[];
  selectedSkillName: string | null;
  onSelect: () => void;
  onSkillClick: (skill: SidebarSkill) => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);

  return (
    <div>
      <button
        onClick={onSelect}
        className={cn(
          "w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors",
          isSelected
            ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
        )}
      >
        <div
          className={cn(
            "w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0",
            colors.badge,
            colors.text
          )}
        >
          {initials}
        </div>
        <span className="text-xs font-medium truncate" title={formatBotName(bot.name)}>{formatBotName(bot.name)}</span>
        {bot.owner && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">@{bot.owner}</span>
        )}
        {isSelected && skills.length > 0 && (
          <ChevronDown
            size={10}
            className={cn(
              "ml-auto text-zinc-400 flex-shrink-0 transition-transform",
              !isExpanded && "-rotate-90"
            )}
          />
        )}
      </button>

      {/* Expanded skill list */}
      {isExpanded && skills.length > 0 && (
        <div className="ml-5 mt-0.5 mb-1">
          {skills.map((skill) => {
            const isSkillSelected = selectedSkillName === skill.name;
            const statusCfg = SKILL_STATUS_CONFIG[skill.status] ?? SKILL_STATUS_CONFIG.active;
            return (
              <button
                key={skill.name}
                onClick={() => onSkillClick(skill)}
                className={cn(
                  "w-full text-left flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                  isSkillSelected
                    ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                )}
              >
                <Sparkles size={11} className={cn("flex-shrink-0", isSkillSelected ? "text-teal-500" : "text-amber-400")} />
                <span className="text-xs truncate">{skill.title}</span>
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0 ml-auto", statusCfg.dot)} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BotSidebar({
  bots,
  grouped,
  selectedPath,
  search,
  skills,
  selectedSkillName,
  onSearch,
  onSelect,
  onSkillClick,
}: {
  bots: BotEntry[];
  grouped: [string, BotEntry[]][];
  selectedPath: string | null;
  search: string;
  skills: SidebarSkill[];
  selectedSkillName: string | null;
  onSearch: (v: string) => void;
  onSelect: (path: string) => void;
  onSkillClick: (skill: SidebarSkill) => void;
}) {
  const filtered = search
    ? bots.filter((b) => {
        const q = search.toLowerCase();
        return formatBotName(b.name).toLowerCase().includes(q) || (b.owner && b.owner.toLowerCase().includes(q));
      })
    : null;

  const renderBotItem = (bot: BotEntry) => {
    const isSelected = bot.dirPath === selectedPath;
    return (
      <BotSidebarItem
        key={bot.dirPath}
        bot={bot}
        isSelected={isSelected}
        isExpanded={isSelected && skills.length > 0}
        skills={isSelected ? skills : []}
        selectedSkillName={isSelected ? selectedSkillName : null}
        onSelect={() => onSelect(bot.dirPath)}
        onSkillClick={onSkillClick}
      />
    );
  };

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
            className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
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
            <div>{filtered.map(renderBotItem)}</div>
          )
        ) : (
          <div className="space-y-2">
            {grouped.map(([group, groupBots]) => (
              <div key={group}>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-2.5 mb-0.5">
                  {GROUP_LABELS[group] || group}
                </p>
                <div>{groupBots.map(renderBotItem)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
