// src/modules/email/GroupsView.tsx
// Group list with tree sidebar for grouping by size/alphabetical

import { useState, useMemo } from "react";
import { Plus, Users } from "lucide-react";
import { useEmailGroups } from "../../hooks/email";
import type { EmailGroupWithCount } from "../../lib/email/types";
import { EmailTreeSidebar, type GroupByOption, type TreeSelection } from "./EmailTreeSidebar";

// ─── Grouping options ─────────────────────────────────────────────────────────

function sizeLabel(count: number): string {
  if (count === 0) return "Empty";
  if (count <= 10) return "Small (1–10)";
  if (count <= 50) return "Medium (11–50)";
  return "Large (51+)";
}

const SIZE_ORDER = ["Empty", "Small (1–10)", "Medium (11–50)", "Large (51+)"];

const groupGroupByOptions: GroupByOption<EmailGroupWithCount>[] = [
  {
    key: "alpha",
    label: "Alphabetical",
    getGroup: (g) => {
      const first = g.name.charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : "#";
    },
  },
  {
    key: "size",
    label: "Size",
    getGroup: (g) => sizeLabel(g.memberCount ?? 0),
    sortGroups: (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
  },
];

// ─── View ─────────────────────────────────────────────────────────────────────

interface GroupsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewGroup: () => void;
}

export function GroupsView({ selectedId, onSelect, onNewGroup }: GroupsViewProps) {
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("alpha");
  const [treeSelection, setTreeSelection] = useState<TreeSelection>({ groupValue: null });

  const { data: groups = [], isLoading } = useEmailGroups();

  // Apply search filter
  const searched = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  // Apply tree filter
  const activeOption = groupGroupByOptions.find((o) => o.key === groupBy) ?? groupGroupByOptions[0];
  const filtered = useMemo(() => {
    if (!treeSelection.groupValue) return searched;
    return searched.filter((g) => {
      const val = activeOption.getGroup(g);
      const keys = Array.isArray(val) ? val : [val];
      return keys.includes(treeSelection.groupValue!);
    });
  }, [searched, treeSelection.groupValue, activeOption]);

  return (
    <div className="h-full flex">
      <EmailTreeSidebar
        items={searched}
        groupByOptions={groupGroupByOptions}
        activeGroupBy={groupBy}
        onGroupByChange={setGroupBy}
        selection={treeSelection}
        onSelectionChange={setTreeSelection}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search groups..."
        title="Groups"
        totalCount={groups.length}
      />

      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {filtered.length}{treeSelection.groupValue ? ` in ${activeOption.getLabel?.(treeSelection.groupValue) ?? treeSelection.groupValue}` : ""} group{filtered.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={onNewGroup}
            className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
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
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

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
