import type { SolutionInstanceWithTemplate, SolutionTemplate } from "../../../lib/solutions/types";

interface Props {
  instances: SolutionInstanceWithTemplate[];
  templates: SolutionTemplate[];
  onSelect: (instance: SolutionInstanceWithTemplate) => void;
  onAdd: (template: SolutionTemplate) => void;
}

const ACCENT_GRADIENTS: Record<string, string> = {
  ar: "from-teal-400 to-blue-400",
  ap: "from-amber-400 to-orange-400",
  analytics: "from-purple-400 to-pink-400",
};

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Active" },
  paused: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-400 dark:text-zinc-500", label: "Paused" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Completed" },
};

export default function SolutionCards({ instances, templates, onSelect, onAdd }: Props) {
  // Templates that haven't been added yet
  const addableTemplates = templates.filter(
    (t) => t.status === "published" && !instances.find((i) => i.template_id === t.id)
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {instances.map((inst) => {
        const slug = inst.template?.slug || "";
        const gradient = ACCENT_GRADIENTS[slug] || "from-blue-400 to-cyan-400";
        const statusBadge = STATUS_BADGES[inst.status] || STATUS_BADGES.active;
        const pct = inst.progress_pct || 0;

        return (
          <div
            key={inst.id}
            onClick={() => onSelect(inst)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl cursor-pointer transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 overflow-hidden"
          >
            <div className={`h-[3px] bg-gradient-to-r ${gradient}`} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[15px] font-bold">{inst.template?.name || "Solution"}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {inst.template?.description?.slice(0, 60) || ""}
                    {inst.started_at && ` · Started ${new Date(inst.started_at).toLocaleDateString()}`}
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${statusBadge.bg} ${statusBadge.text}`}>
                  {statusBadge.label}
                </span>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className="text-zinc-500">Progress</span>
                  <span className="font-semibold font-mono text-zinc-400">
                    {inst.completed_items || 0} / {inst.total_items || 0}
                  </span>
                </div>
                <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                {pct === 0 ? "Not started" : pct === 100 ? "Complete" : `${Math.round(pct)}% complete`}
              </div>
            </div>
          </div>
        );
      })}

      {/* Add solution cards */}
      {addableTemplates.map((t) => (
        <div
          key={t.id}
          onClick={() => onAdd(t)}
          className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl flex flex-col items-center justify-center p-10 cursor-pointer transition-all hover:border-blue-500 hover:bg-blue-500/5 min-h-[170px]"
        >
          <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-lg text-zinc-400 dark:text-zinc-500 mb-2.5 transition-colors group-hover:bg-blue-500/10">
            +
          </div>
          <div className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Add {t.name}</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-600 mt-1">{t.description?.slice(0, 50)}</div>
        </div>
      ))}

      {/* Generic add if all templates are already added */}
      {addableTemplates.length === 0 && instances.length > 0 && (
        <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center p-10 min-h-[170px]">
          <span className="text-xs text-zinc-500 dark:text-zinc-600">All published templates added</span>
        </div>
      )}
    </div>
  );
}
