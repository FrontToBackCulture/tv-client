// Horizontal row of skill suggestion chips shown below the chat composer.
// Click a chip to prefill the composer with a prompt that invokes that skill.

import { useState } from "react";
import { Sparkles, Search, X } from "lucide-react";
import { useRelevantSkills } from "../../hooks/chat/useRelevantSkills";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

interface Props {
  entityType: string;
  entityId: string;
  recentMessages: string[];
  bot?: string;
  onInvoke: (promptText: string) => void;
}

export function SkillChips({ entityType, entityId, recentMessages, bot = "bot-mel", onInvoke }: Props) {
  const { data: skills = [] } = useRelevantSkills(entityType, entityId, recentMessages, bot);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (skills.length === 0 && !pickerOpen) {
    // Still show the "Browse skills" button so user can open the picker
    return (
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-t border-[var(--border-default)]">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <Sparkles size={10} /> Browse skills
        </button>
        {pickerOpen && <SkillPicker bot={bot} onInvoke={onInvoke} onClose={() => setPickerOpen(false)} />}
      </div>
    );
  }

  function handleInvoke(slug: string) {
    const prompt = `@${bot} use the ${slug} skill to `;
    onInvoke(prompt);
  }

  return (
    <div className="px-3 py-1.5 flex items-center gap-1.5 border-t border-[var(--border-default)] overflow-x-auto">
      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
        <Sparkles size={10} /> Skills:
      </div>
      {skills.map((s) => (
        <button
          key={s.slug}
          onClick={() => handleInvoke(s.slug)}
          title={s.description || s.name}
          className="shrink-0 px-2 py-0.5 text-[10px] rounded-full bg-[var(--bg-muted)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-default)] transition-colors"
        >
          {s.name}
        </button>
      ))}
      <button
        onClick={() => setPickerOpen(true)}
        className="shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        title="Browse all skills"
      >
        <Search size={11} />
      </button>
      {pickerOpen && <SkillPicker bot={bot} onInvoke={onInvoke} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full skill picker popover
// ---------------------------------------------------------------------------

function SkillPicker({ bot, onInvoke, onClose }: { bot: string; onInvoke: (p: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { data: skills = [] } = useQuery({
    queryKey: ["all-skills-for-bot", bot],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skills")
        .select("slug, name, description, category, subcategory")
        .eq("status", "active")
        .or(`owner.eq.${bot},owner.is.null`)
        .order("name")
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
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

  function handlePick(slug: string) {
    onInvoke(`@${bot} use the ${slug} skill to `);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[500px] max-h-[60vh] mb-20 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-default)]">
          <Sparkles size={12} className="text-purple-500" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Skills for {bot}</span>
          <button onClick={onClose} className="ml-auto p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"><X size={12} /></button>
        </div>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="mx-3 mt-2 text-xs rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-2.5 py-1.5 placeholder:text-[var(--text-muted)] focus:outline-none focus:border-teal-500"
        />
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No skills match "{search}"</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.slug}
                onClick={() => handlePick(s.slug)}
                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{s.name}</span>
                  {s.category && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-muted)]">
                      {s.category}
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-2">{s.description}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
