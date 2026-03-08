// src/modules/email/GroupsView.tsx
// Group list with member counts

import { useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { useEmailGroups } from "../../hooks/email";
import type { EmailGroupWithCount } from "../../lib/email/types";

interface GroupsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewGroup: () => void;
}

export function GroupsView({ selectedId, onSelect, onNewGroup }: GroupsViewProps) {
  const [search, setSearch] = useState("");
  const { data: groups = [], isLoading } = useEmailGroups();

  const filtered = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Groups</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {groups.length} groups
            </p>
          </div>
          <button
            onClick={onNewGroup}
            className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            {search ? "No groups found" : "No groups yet. Create one to get started."}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {filtered.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                isSelected={group.id === selectedId}
                onClick={() => onSelect(group.id === selectedId ? null : group.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupRow({
  group,
  isSelected,
  onClick,
}: {
  group: EmailGroupWithCount;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
        isSelected ? "bg-zinc-50 dark:bg-zinc-900/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
            {group.name}
          </p>
          {group.description && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
              {group.description}
            </p>
          )}
        </div>
        <span className="flex-shrink-0 flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
          <Users size={10} />
          {group.memberCount ?? 0}
        </span>
      </div>
    </button>
  );
}
