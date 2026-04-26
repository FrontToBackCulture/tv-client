import { useQuery } from "@tanstack/react-query";
import { Clock, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type ChangeRow = {
  id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  [k: string]: any;
};

type Props = {
  open: boolean;
  onClose: () => void;
  table: string;
  filterColumn?: string;
  filterIds?: string[];
  fieldLabels?: Record<string, string>;
  titleFor?: (row: ChangeRow) => string;
  queryKey: unknown[];
  limit?: number;
};

export function RecentChangesPanel({
  open,
  onClose,
  table,
  filterColumn,
  filterIds,
  fieldLabels = {},
  titleFor,
  queryKey,
  limit = 50,
}: Props) {
  const enabled = open && (filterColumn === undefined || (filterIds?.length ?? 0) > 0);
  const { data: changes = [] } = useQuery({
    queryKey: [...queryKey, filterIds?.length ?? 0],
    queryFn: async (): Promise<ChangeRow[]> => {
      let q = supabase.from(table).select("*").order("changed_at", { ascending: false }).limit(limit);
      if (filterColumn && filterIds && filterIds.length > 0) {
        q = q.in(filterColumn, filterIds.slice(0, 200));
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChangeRow[];
    },
    enabled,
    staleTime: 30_000,
  });

  if (!open) return null;

  return (
    <div className="flex-shrink-0 w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-purple-500" />
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent Changes</span>
          {changes.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 font-medium">{changes.length}</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {changes.length === 0 ? (
          <div className="p-4 text-center">
            <Clock size={24} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">No changes yet</p>
            <p className="text-[10px] text-zinc-400 mt-1">Field changes will appear here.</p>
          </div>
        ) : (
          <div className="py-2">
            {(() => {
              const grouped = new Map<string, ChangeRow[]>();
              for (const c of changes) {
                const day = new Date(c.changed_at).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
                if (!grouped.has(day)) grouped.set(day, []);
                grouped.get(day)!.push(c);
              }
              return [...grouped.entries()].map(([day, dayChanges]) => (
                <div key={day}>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider sticky top-0 bg-white dark:bg-zinc-950">{day}</div>
                  {dayChanges.map((c) => (
                    <div key={c.id} className="px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-b border-zinc-50 dark:border-zinc-800/30">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                            {titleFor ? titleFor(c) : ""}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] font-medium text-purple-500">{fieldLabels[c.field] || c.field}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {c.old_value && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/10 text-red-500 line-through truncate max-w-[100px]" title={c.old_value}>{c.old_value}</span>
                            )}
                            <span className="text-[10px] text-zinc-400">&rarr;</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 truncate max-w-[100px]" title={c.new_value || "(empty)"}>{c.new_value || "(empty)"}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 flex-shrink-0 mt-0.5">
                          {new Date(c.changed_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {c.changed_by && <div className="text-[9px] text-zinc-400 mt-1">by {c.changed_by}</div>}
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
