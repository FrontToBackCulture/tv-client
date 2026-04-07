// Skills config panel — select skills to load into the automation prompt

import { useState, useMemo } from "react";
import { Puzzle, X } from "lucide-react";
import { useSkills } from "@/hooks/useBotSkills";
import type { SkillsConfig, NodeConfig } from "../types";

interface Props {
  config: SkillsConfig;
  onChange: (config: NodeConfig) => void;
}

export function SkillsConfigPanel({ config, onChange }: Props) {
  const { data: skills } = useSkills();
  const [search, setSearch] = useState("");

  const selectedSlugs = new Set(config.skill_refs?.map((r) => r.slug) ?? []);

  const filteredSkills = useMemo(() => {
    if (!skills) return [];
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }, [skills, search]);

  function toggleSkill(slug: string) {
    const skill = skills?.find((s) => s.slug === slug);
    if (!skill) return;

    const current = config.skill_refs ?? [];
    const exists = current.some((r) => r.slug === slug);
    const next = exists
      ? current.filter((r) => r.slug !== slug)
      : [...current, { bot: current[0]?.bot ?? "bot-mel", slug: skill.slug, title: skill.title }];
    onChange({ ...config, skill_refs: next });
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Skills</h3>

      {(config.skill_refs?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {config.skill_refs!.map((r) => (
            <span key={r.slug} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800">
              <Puzzle size={10} /> {r.title}
              <button type="button" onClick={() => toggleSkill(r.slug)} className="ml-0.5 text-teal-400 hover:text-teal-600"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
      />

      {filteredSkills.length > 0 ? (
        <div className="max-h-[260px] overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
          {filteredSkills.map((skill) => (
            <label key={skill.slug} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <input type="checkbox" checked={selectedSlugs.has(skill.slug)} onChange={() => toggleSkill(skill.slug)} className="mt-0.5 rounded border-zinc-200 dark:border-zinc-800 text-teal-600 focus:ring-teal-500" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{skill.title}</span>
                  {skill.category && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">{skill.category}</span>}
                </div>
                {skill.summary && <p className="text-xs text-zinc-400 truncate mt-0.5">{skill.summary}</p>}
              </div>
            </label>
          ))}
        </div>
      ) : search ? (
        <p className="text-xs text-zinc-400">No skills matching "{search}"</p>
      ) : null}
    </div>
  );
}
