// Button + popover for configuring which skills appear as chips in the
// automation's chat threads. Stored in automations.suggested_skills.

import { useState } from "react";
import { Sparkles, X, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUpdateAutomation } from "@/hooks/scheduler";

interface Props {
  automationId: string;
  currentSkills: string[];
}

export function SuggestedSkillsButton({ automationId, currentSkills }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(currentSkills));
  const updateAutomation = useUpdateAutomation();

  const { data: skills = [] } = useQuery({
    queryKey: ["all-active-skills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skills")
        .select("slug, name, description, category")
        .eq("status", "active")
        .order("name")
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const q = search.toLowerCase().trim();
  const filtered = q
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q),
      )
    : skills;

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleSave() {
    await updateAutomation.mutateAsync({
      id: automationId,
      suggested_skills: Array.from(selected),
    } as any);
    setOpen(false);
  }

  function handleOpen() {
    setSelected(new Set(currentSkills));
    setSearch("");
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-purple-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Configure suggested skills for this automation's chat threads"
      >
        <Sparkles size={12} />
        Skills
        {currentSkills.length > 0 && (
          <span className="text-[10px] px-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            {currentSkills.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[540px] max-h-[70vh] rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Suggested Skills</span>
                <span className="text-[10px] text-zinc-400">shown as chips in this automation's chat threads</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>

            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills..."
              className="mx-4 mt-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500"
            />

            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {filtered.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-4">No skills match "{search}"</p>
              ) : (
                filtered.map((s) => {
                  const isSelected = selected.has(s.slug);
                  return (
                    <button
                      key={s.slug}
                      onClick={() => toggle(s.slug)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors flex items-start gap-2 ${
                        isSelected
                          ? "bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-950/50"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <div className={`mt-0.5 w-3 h-3 rounded border flex items-center justify-center ${
                        isSelected
                          ? "bg-teal-600 border-teal-600"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}>
                        {isSelected && <Check size={8} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{s.name}</span>
                          {s.category && (
                            <span className="text-[9px] px-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              {s.category}
                            </span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{s.description}</p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <span className="text-[10px] text-zinc-500">{selected.size} selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs px-3 py-1 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateAutomation.isPending}
                  className="text-xs px-3 py-1 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {updateAutomation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
