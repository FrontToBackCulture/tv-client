// BotPlayground: Bot overview two-column layout with profile, skills, sessions

import { useState, useMemo } from "react";
import {
  X,
  Search,
  Clock,
  Sparkles,
  Zap,
  Loader2,
  ChevronRight,
  ArrowUpDown,
  Brain,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderInput,
  FolderOutput,
} from "lucide-react";
import { cn } from "../lib/cn";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";
import {
  type BotEntry,
  type BotProfile,
  type SkillStatus,
  DEPT_COLORS,
  GROUP_LABELS,
  SKILL_STATUS_CONFIG,
  formatBotName,
  getBotInitials,
  relativeDate,
} from "./botPlaygroundTypes";

function StatPill({ icon: Icon, label, count, color, clickable }: { icon: typeof Clock; label: string; count: number; color: string; clickable: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800",
      clickable && "hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer transition-colors"
    )}>
      <Icon size={13} className={color} />
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{count}</span>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}

function InstructionsModal({
  content,
  title,
  onClose,
}: {
  content: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-500 flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            <MarkdownViewer content={content} filename={title} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BotOverview({
  bot,
  profile,
  claudeContent,
  isLoading,
  skillCount,
  commandCount,
  recentSessions,
  skillList,
  skillCategories,
  skillUsage,
  onSkillClick,
  onSessionClick,
  onCommandsClick,
}: {
  bot: BotEntry;
  profile: BotProfile;
  claudeContent: string | undefined;
  isLoading: boolean;
  skillCount: number;
  commandCount: number;
  recentSessions: { date: string; title: string | null; summary: string | null; path: string }[];
  skillList: { name: string; path: string; title: string; summary: string; subfolders: string[]; status: SkillStatus; lastRevised: string | null; updated: string | null; category: string | null; command: string | null; input: string | null; output: string | null; sources: string | null; writes: string | null; tools: string | null }[];
  skillCategories: { id: string; label: string }[];
  skillUsage: Record<string, { invocations: number; mentions: number }>;
  onSkillClick: (skill: { name: string; path: string; title: string }) => void;
  onSessionClick: (session: { path: string; date: string; title: string | null }) => void;
  onCommandsClick: () => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [skillSort, setSkillSort] = useState<"name" | "usage">("name");
  const [skillFilter, setSkillFilter] = useState<"all" | SkillStatus>("active");
  const [skillTab, setSkillTab] = useState<string>("all");
  const [skillSearch, setSkillSearch] = useState("");

  // Sort and filter skills
  const filteredSkills = useMemo(() => {
    let list = skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter);
    if (skillTab !== "all") {
      list = list.filter((s) => s.category === skillTab);
    }
    if (skillSearch) {
      const q = skillSearch.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q));
    }
    if (skillSort === "usage") {
      list = [...list].sort((a, b) => {
        const aUse = (skillUsage[a.name]?.invocations || 0) + (skillUsage[a.name]?.mentions || 0);
        const bUse = (skillUsage[b.name]?.invocations || 0) + (skillUsage[b.name]?.mentions || 0);
        return bUse - aUse || a.title.localeCompare(b.title);
      });
    } else {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [skillList, skillUsage, skillSort, skillFilter, skillTab, skillSearch]);

  // Truncate CLAUDE.md for preview
  const instructionsPreview = useMemo(() => {
    if (!claudeContent) return "";
    const lines = claudeContent.split("\n");
    const start = lines.findIndex((l) => l.startsWith("## ") || (l.trim() && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("---")));
    const meaningful = lines.slice(Math.max(0, start)).join("\n").trim();
    return meaningful.length > 300 ? meaningful.slice(0, 300) + "..." : meaningful;
  }, [claudeContent]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="px-6 pb-6">
      {/* Profile Header — full width */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden mb-6">
          <div className={cn("h-1.5", colors.dot.replace("bg-", "bg-gradient-to-r from-").replace("-500", "-400") + " to-" + colors.dot.replace("bg-", "").replace("-500", "-600"))} />
          <div className="px-5 py-4">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0",
                colors.badge, colors.text
              )}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatBotName(bot.name)}
                  </h1>
                  <span className={cn("px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full", colors.badge, colors.text)}>
                    {profile.department || GROUP_LABELS[bot.group] || bot.group}
                  </span>
                </div>
                {profile.description && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{profile.description}</p>
                )}
                {profile.role && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    {profile.role}{profile.focus ? ` — ${profile.focus}` : ""}
                  </p>
                )}
              </div>
            </div>
            {profile.mission && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{profile.mission}</p>
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => { if (skillCount > 0) onSkillClick(skillList[0]); }} className="focus:outline-none">
                <StatPill icon={Sparkles} label="Skills" count={skillCount} color="text-amber-500" clickable={skillCount > 0} />
              </button>
              <button onClick={onCommandsClick} className="focus:outline-none">
                <StatPill icon={Zap} label="Commands" count={commandCount} color="text-teal-500" clickable={commandCount > 0} />
              </button>
              <StatPill icon={Clock} label="Sessions" count={recentSessions.length} color="text-blue-500" clickable={false} />
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex gap-6">
          {/* Left column: Skills + Sessions */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Skills */}
            {skillList.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setSkillsExpanded(!skillsExpanded)}
                    className="text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <ChevronRight size={12} className={cn("transition-transform", skillsExpanded && "rotate-90")} />
                    <Sparkles size={12} className="text-amber-500" />
                    Skills
                    <span className="text-[10px] font-normal tabular-nums ml-1">
                      {skillSearch
                        ? `${filteredSkills.length} result${filteredSkills.length !== 1 ? "s" : ""}`
                        : skillFilter === "all"
                          ? `${skillList.filter((s) => s.status === "active").length} active / ${skillList.length}`
                          : `${filteredSkills.length} ${skillFilter}`}
                    </span>
                  </button>
                  {skillsExpanded && (
                    <div className="flex items-center gap-1 ml-auto">
                      {/* Search */}
                      <div className="relative mr-1">
                        <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={skillSearch}
                          onChange={(e) => setSkillSearch(e.target.value)}
                          className="w-[100px] pl-5 pr-5 py-0.5 text-[10px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500 focus:w-[140px] transition-all"
                        />
                        {skillSearch && (
                          <button onClick={() => setSkillSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                            <X size={9} />
                          </button>
                        )}
                      </div>
                      {/* Filter pills */}
                      {(["all", "active", "inactive", "deprecated"] as const).map((f) => {
                        const count = f === "all" ? skillList.length : skillList.filter((s) => s.status === f).length;
                        if (f !== "all" && count === 0) return null;
                        return (
                          <button
                            key={f}
                            onClick={() => setSkillFilter(f)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
                              skillFilter === f
                                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            )}
                          >
                            {f === "all" ? "All" : SKILL_STATUS_CONFIG[f].label}
                          </button>
                        );
                      })}
                      {/* Sort toggle */}
                      <button
                        onClick={() => setSkillSort(skillSort === "name" ? "usage" : "name")}
                        className={cn(
                          "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ml-1",
                          "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        )}
                        title={`Sort by ${skillSort === "name" ? "usage" : "name"}`}
                      >
                        <ArrowUpDown size={9} />
                        {skillSort === "name" ? "A-Z" : "Usage"}
                      </button>
                    </div>
                  )}
                </div>
                {skillsExpanded && skillCategories.length > 0 && (
                  <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800">
                    {[{ id: "all", label: "All" }, ...skillCategories].map((cat) => {
                      const count = cat.id === "all"
                        ? (skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter)).length
                        : (skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter)).filter((s) => s.category === cat.id).length;
                      if (cat.id !== "all" && count === 0) return null;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSkillTab(cat.id)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                            skillTab === cat.id
                              ? "border-amber-500 text-amber-600 dark:text-amber-400"
                              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          )}
                        >
                          {cat.label}
                          <span className="ml-1 text-[10px] tabular-nums opacity-60">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {skillsExpanded && (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredSkills.map((skill) => {
                      const sc = SKILL_STATUS_CONFIG[skill.status];
                      const usage = skillUsage[skill.name];
                      const totalUses = (usage?.invocations || 0) + (usage?.mentions || 0);
                      return (
                        <button
                          key={skill.name}
                          onClick={() => onSkillClick({ name: skill.name, path: skill.path, title: skill.title })}
                          className={cn(
                            "text-left px-4 py-3 rounded-lg border bg-white dark:bg-zinc-900 hover:shadow-sm transition-all cursor-pointer group",
                            skill.status === "active"
                              ? "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                              : "border-zinc-200/60 dark:border-zinc-800/60 opacity-60 hover:opacity-80"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={13} className="text-amber-500 flex-shrink-0" />
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors flex-1" title={skill.title}>
                              {skill.title}
                            </span>
                            {skill.command && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 font-mono flex-shrink-0">
                                {skill.command}
                              </span>
                            )}
                            {totalUses > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 tabular-nums flex-shrink-0">
                                {totalUses}x
                              </span>
                            )}
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", sc.dot)} title={sc.label} />
                          </div>
                          {skill.summary && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-1.5">{skill.summary}</p>
                          )}
                          {(skill.input || skill.output) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {skill.input && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-500 dark:text-zinc-400">
                                  <ArrowDownToLine size={8} className="text-blue-400" />
                                  {skill.input}
                                </span>
                              )}
                              {skill.output && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-500 dark:text-zinc-400">
                                  <ArrowUpFromLine size={8} className="text-green-400" />
                                  {skill.output}
                                </span>
                              )}
                            </div>
                          )}
                          {(skill.sources || skill.writes) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {skill.sources && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                                  <FolderInput size={8} className="text-amber-400/70" />
                                  {skill.sources}
                                </span>
                              )}
                              {skill.writes && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                                  <FolderOutput size={8} className="text-purple-400/70" />
                                  {skill.writes}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            {usage && (usage.invocations > 0 || usage.mentions > 0) && (
                              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                                {usage.invocations > 0 ? `${usage.invocations} invoked` : ""}
                                {usage.invocations > 0 && usage.mentions > 0 ? " · " : ""}
                                {usage.mentions > 0 ? `${usage.mentions} mentioned` : ""}
                              </span>
                            )}
                            {(skill.updated || skill.lastRevised) && (
                              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-auto">
                                updated {relativeDate(skill.updated || skill.lastRevised!)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Recent Sessions */}
            <section>
              <button
                onClick={() => setSessionsExpanded(!sessionsExpanded)}
                className="w-full text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <ChevronRight size={12} className={cn("transition-transform", sessionsExpanded && "rotate-90")} />
                <Clock size={12} className="text-blue-500" />
                Recent Sessions
                {recentSessions.length > 0 && (
                  <span className="text-[10px] font-normal tabular-nums ml-1">{recentSessions.length}</span>
                )}
              </button>
              {sessionsExpanded && (
                recentSessions.length === 0 ? (
                  <div className="py-6 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <Clock size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400">No sessions yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {recentSessions.slice(0, 5).map((s) => (
                      <button
                        key={s.path}
                        onClick={() => onSessionClick(s)}
                        className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all cursor-pointer group"
                      >
                        <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700 mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{relativeDate(s.date)}</span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{s.date}</span>
                          </div>
                          {s.title && (
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={s.title}>{s.title}</p>
                          )}
                          {s.summary && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">{s.summary}</p>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-700 mt-1 flex-shrink-0 group-hover:text-zinc-500 transition-colors" />
                      </button>
                    ))}
                  </div>
                )
              )}
            </section>
          </div>

          {/* Right column: Instructions + Commands */}
          <div className="w-[320px] flex-shrink-0 space-y-4">
            {/* Instructions (CLAUDE.md preview) */}
            {claudeContent && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Instructions</span>
                  <span className="text-[10px] text-zinc-400">CLAUDE.md</span>
                </div>
                <div className="px-4 py-3">
                  <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed line-clamp-[12]">
                    {instructionsPreview}
                  </pre>
                  {claudeContent.length > 300 && (
                    <button
                      onClick={() => setShowInstructionsModal(true)}
                      className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline mt-2"
                    >
                      Show more
                    </button>
                  )}
                </div>
              </div>
            )}
            {showInstructionsModal && claudeContent && (
              <InstructionsModal
                content={claudeContent}
                title="CLAUDE.md"
                onClose={() => setShowInstructionsModal(false)}
              />
            )}

            {/* Commands */}
            {commandCount > 0 && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Commands</span>
                  <span className="text-[10px] text-zinc-400 tabular-nums">{commandCount}</span>
                </div>
                <button
                  onClick={onCommandsClick}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center gap-2 group"
                >
                  <Zap size={13} className="text-teal-500" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">
                    {commandCount} slash command{commandCount !== 1 ? "s" : ""} defined
                  </span>
                  <ChevronRight size={12} className="text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                </button>
              </div>
            )}

            {/* Bot metadata */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Details</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {profile.department && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Department</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{profile.department}</span>
                  </div>
                )}
                {profile.role && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Role</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{profile.role}</span>
                  </div>
                )}
                {profile.focus && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Focus</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{profile.focus}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">Directory</span>
                  <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]" title={bot.name}>{bot.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
