import type { InstanceData } from "../../../lib/solutions/types";
import { getOutlets } from "./matrixHelpers";

interface Props {
  data: InstanceData;
  selectedEntity: string | null; // null = "All"
  onSelectEntity: (entity: string | null) => void;
}

export default function EntitySidebar({ data, selectedEntity, onSelectEntity }: Props) {
  const scope = data.scope || [];
  const outlets = getOutlets(scope);

  // Group by entity
  const entityMap: Record<string, number> = {};
  for (const o of outlets) {
    entityMap[o.entity] = (entityMap[o.entity] || 0) + 1;
  }
  const entities = Object.entries(entityMap).sort((a, b) => b[1] - a[1]);
  const totalOutlets = outlets.length;

  if (totalOutlets === 0) return null;

  return (
    <div className="w-[200px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
      <div className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
        Entities
        <span className="font-mono">{entities.length}</span>
      </div>

      {/* All entities */}
      <button
        onClick={() => onSelectEntity(null)}
        className={`w-full text-left flex items-center justify-between px-3 py-2 border-l-2 transition-colors cursor-pointer ${
          selectedEntity === null
            ? "bg-teal-50 dark:bg-teal-950/20 border-teal-500"
            : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900"
        }`}
      >
        <span className={`text-xs font-semibold ${selectedEntity === null ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"}`}>
          All Entities
        </span>
        <span className={`text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded-full ${
          selectedEntity === null ? "bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
        }`}>
          {totalOutlets}
        </span>
      </button>

      {/* Per entity */}
      {entities.map(([entity, count]) => (
        <button
          key={entity}
          onClick={() => onSelectEntity(entity)}
          className={`w-full text-left flex items-center justify-between px-3 py-2 border-l-2 transition-colors cursor-pointer ${
            selectedEntity === entity
              ? "bg-teal-50 dark:bg-teal-950/20 border-teal-500"
              : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900"
          }`}
        >
          <span className={`text-xs font-medium ${selectedEntity === entity ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"}`}>
            {entity || "(No entity)"}
          </span>
          <span className={`text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded-full ${
            selectedEntity === entity ? "bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
          }`}>
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}
