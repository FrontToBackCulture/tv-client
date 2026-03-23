// BotPlayground: Bot overview two-column layout with profile, skills, sessions

import { useState, useMemo, useCallback } from "react";
import {
  X,
  Search,
  Clock,
  Sparkles,
  Zap,
  Loader2,
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderInput,
  FolderOutput,
  BadgeCheck,
  Trash2,
  Database,
  Settings,
} from "lucide-react";
import { cn } from "../lib/cn";
import { SkillAssignmentGrid } from "../components/SkillAssignmentGrid";
import { BotConfigPanel } from "./BotConfigPanel";
import { DriftDiffModal, DriftBadge } from "../components/DriftDiffModal";
import { useSkillRegistry, useSkillDistributeTo, useSkillCheckAll } from "../modules/skills/useSkillRegistry";
import { useRepository } from "../stores/repositoryStore";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  type BotEntry,
  type BotProfile,
  type SkillStatus,
  type MemoryFile,
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
  memoryList,
  memoryDir,
  onSkillClick,
  onSkillDelete,
  onSessionClick,
  onCommandsClick,
  onMemoryClick,
  claudeMdPath,
  availableSkillDirs,
}: {
  bot: BotEntry;
  profile: BotProfile;
  claudeContent: string | undefined;
  isLoading: boolean;
  skillCount: number;
  commandCount: number;
  recentSessions: { date: string; title: string | null; summary: string | null; path: string }[];
  skillList: { name: string; path: string; title: string; summary: string; subfolders: string[]; status: SkillStatus; verified: boolean; lastRevised: string | null; updated: string | null; category: string | null; command: string | null; input: string | null; output: string | null; sources: string | null; writes: string | null; tools: string | null }[];
  skillCategories: { id: string; label: string }[];
  memoryList: MemoryFile[];
  memoryDir: string | undefined;
  claudeMdPath?: string;
  availableSkillDirs?: string[];
  onSkillClick: (skill: { name: string; path: string; title: string }) => void;
  onSkillDelete?: (skill: { name: string; path: string; title: string }) => void;
  onSessionClick: (session: { path: string; date: string; title: string | null }) => void;
  onCommandsClick: () => void;
  onMemoryClick: (mem: MemoryFile) => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);
  const [showAssignSkills, setShowAssignSkills] = useState(false);
  const [assigningSkill, setAssigningSkill] = useState<string | null>(null);
  const [assignFeedback, setAssignFeedback] = useState<{ slug: string; action: "added" | "removed" } | null>(null);
  const [activeTab, setActiveTab] = useState<"skills" | "sessions" | "memory" | "config">("config");
  const [skillFilter, setSkillFilter] = useState<"all" | SkillStatus>("active");
  const [skillTab, setSkillTab] = useState<string>("all");
  const [skillSearch, setSkillSearch] = useState("");
  const [driftModal, setDriftModal] = useState<{ slug: string; name: string; targetPath: string } | null>(null);

  // Skill registry for assignment
  const registryQuery = useSkillRegistry();
  const registry = registryQuery.data;
  const { activeRepository } = useRepository();
  const distributeMutation = useSkillDistributeTo();
  const queryClient = useQueryClient();
  const { data: driftStatuses = [] } = useSkillCheckAll();

  const availableBotSkills = useMemo(() => {
    if (!registry) return [] as string[];
    return Object.keys(registry.skills).sort();
  }, [registry]);

  const registryCategories = registry?.categories ?? [];
  const registryEntries = registry?.skills ?? {};

  // Current skills already in this bot's skills/ folder
  const currentBotSkillSlugs = useMemo(
    () => skillList.map((s) => s.name),
    [skillList]
  );

  // Compute the relative skills path for skill_distribute_to
  const botSkillsRelPath = useMemo(() => {
    if (!activeRepository || !bot.dirPath) return null;
    const repoPath = activeRepository.path;
    if (bot.dirPath.startsWith(repoPath)) {
      return bot.dirPath.slice(repoPath.length + 1) + "/skills";
    }
    return null;
  }, [activeRepository, bot.dirPath]);

  // Build drift map for this bot's skills
  const driftBySlug = useMemo(() => {
    const map = new Map<string, { status: string; source_modified: string; target_modified: string }>();
    console.log("[DEBUG] driftBySlug: botSkillsRelPath=", botSkillsRelPath, "driftStatuses count=", driftStatuses.length);
    if (!botSkillsRelPath) return map;
    const prefix = botSkillsRelPath + "/";
    for (const d of driftStatuses) {
      if (d.distribution_path.startsWith(prefix)) {
        map.set(d.slug, { status: d.status, source_modified: d.source_modified, target_modified: d.target_modified });
      }
    }
    console.log("[DEBUG] driftBySlug: matched", map.size, "of", driftStatuses.length);
    return map;
  }, [driftStatuses, botSkillsRelPath]);

  const handleAssignToggle = useCallback(
    async (slug: string) => {
      if (!botSkillsRelPath || assigningSkill) return;
      setAssigningSkill(slug);
      setAssignFeedback(null);
      const isAssigned = currentBotSkillSlugs.includes(slug);
      try {
        if (isAssigned) {
          const fullPath = `${bot.dirPath}/skills/${slug}`;
          await invoke("delete_file", { path: fullPath });
          setAssignFeedback({ slug, action: "removed" });
        } else {
          await distributeMutation.mutateAsync({
            slug,
            targetPath: botSkillsRelPath,
            distType: "bot",
          });
          setAssignFeedback({ slug, action: "added" });
        }
      } catch (err) {
        console.error("Failed to toggle skill:", err);
      } finally {
        setAssigningSkill(null);
      }
      queryClient.invalidateQueries({ queryKey: ["directory", `${bot.dirPath}/skills`] });
      // Clear feedback after 2s
      setTimeout(() => setAssignFeedback(null), 2000);
    },
    [botSkillsRelPath, currentBotSkillSlugs, bot.dirPath, distributeMutation, queryClient, assigningSkill]
  );

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
    list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [skillList, skillFilter, skillTab, skillSearch]);


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
                  <span className={cn("px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full", colors.badge, colors.text)}>
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
              <button onClick={() => setActiveTab("skills")} className="focus:outline-none">
                <StatPill icon={Sparkles} label="Skills" count={skillCount} color="text-amber-500" clickable={true} />
              </button>
              <button onClick={onCommandsClick} className="focus:outline-none">
                <StatPill icon={Zap} label="Commands" count={commandCount} color="text-teal-500" clickable={commandCount > 0} />
              </button>
              <button onClick={() => setActiveTab("sessions")} className="focus:outline-none">
                <StatPill icon={Clock} label="Sessions" count={recentSessions.length} color="text-blue-500" clickable={true} />
              </button>
              {memoryList.length > 0 && (
                <button onClick={() => setActiveTab("memory")} className="focus:outline-none">
                  <StatPill icon={Database} label="Memory" count={memoryList.length} color="text-violet-500" clickable={true} />
                </button>
              )}
              <button
                onClick={() => setShowAssignSkills(!showAssignSkills)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ml-auto",
                  showAssignSkills
                    ? "bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400"
                    : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600"
                )}
              >
                <Sparkles size={12} />
                {showAssignSkills ? "Hide Registry" : "Assign Skills"}
              </button>
            </div>
          </div>
        </div>

        {/* Skill Assignment Panel */}
        {showAssignSkills && availableBotSkills.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-500" />
                <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  Assign Skills from Registry
                </label>
              </div>
              <div className="flex items-center gap-3">
                {assigningSkill && (
                  <span className="flex items-center gap-1.5 text-xs text-violet-500">
                    <Loader2 size={11} className="animate-spin" />
                    Updating...
                  </span>
                )}
                {assignFeedback && !assigningSkill && (
                  <span className={cn(
                    "text-xs font-medium",
                    assignFeedback.action === "added" ? "text-emerald-500" : "text-zinc-400"
                  )}>
                    {assignFeedback.action === "added" ? "Added" : "Removed"}{" "}
                    {registryEntries[assignFeedback.slug]?.name || assignFeedback.slug}
                  </span>
                )}
                <button
                  onClick={() => setShowAssignSkills(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  Close
                </button>
              </div>
            </div>
            <SkillAssignmentGrid
              skills={availableBotSkills}
              skillEntries={registryEntries}
              categories={registryCategories}
              selectedSkills={currentBotSkillSlugs}
              onToggle={handleAssignToggle}
            />
          </div>
        )}

        {/* Two-column body */}
        <div className="flex gap-6">
          {/* Left column: Skills or Sessions */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
              {claudeMdPath && (
                <button
                  onClick={() => setActiveTab("config")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                    activeTab === "config"
                      ? "border-teal-500 text-zinc-800 dark:text-zinc-100"
                      : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  )}
                >
                  <Settings size={12} />
                  CLAUDE.md
                </button>
              )}
              <button
                onClick={() => setActiveTab("skills")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === "skills"
                    ? "border-amber-500 text-zinc-800 dark:text-zinc-100"
                    : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                )}
              >
                <Sparkles size={12} />
                Skills
                <span className="text-xs tabular-nums opacity-60">{skillCount}</span>
              </button>
              <button
                onClick={() => setActiveTab("sessions")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === "sessions"
                    ? "border-blue-500 text-zinc-800 dark:text-zinc-100"
                    : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                )}
              >
                <Clock size={12} />
                Sessions
                {recentSessions.length > 0 && (
                  <span className="text-xs tabular-nums opacity-60">{recentSessions.length}</span>
                )}
              </button>
              {memoryList.length > 0 && (
                <button
                  onClick={() => setActiveTab("memory")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                    activeTab === "memory"
                      ? "border-violet-500 text-zinc-800 dark:text-zinc-100"
                      : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  )}
                >
                  <Database size={12} />
                  Memory
                  <span className="text-xs tabular-nums opacity-60">{memoryList.length}</span>
                </button>
              )}
            </div>

            {/* Skills */}
            {activeTab === "skills" && skillList.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {skillSearch
                      ? `${filteredSkills.length} result${filteredSkills.length !== 1 ? "s" : ""}`
                      : skillFilter === "all"
                        ? `${skillList.filter((s) => s.status === "active").length} active / ${skillList.length}`
                        : `${filteredSkills.length} ${skillFilter}`}
                  </span>
                    <div className="flex items-center gap-1 ml-auto">
                      {/* Search */}
                      <div className="relative mr-1">
                        <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={skillSearch}
                          onChange={(e) => setSkillSearch(e.target.value)}
                          className="w-[100px] pl-5 pr-5 py-0.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500 focus:w-[140px] transition-all"
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
                              "px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
                              skillFilter === f
                                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            )}
                          >
                            {f === "all" ? "All" : SKILL_STATUS_CONFIG[f].label}
                          </button>
                        );
                      })}
                    </div>
                </div>
                {(() => {
                  // Derive tabs from actual skills in this bot, not the full registry
                  const baseList = skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter);
                  const catCounts = new Map<string, number>();
                  for (const s of baseList) {
                    if (s.category) catCounts.set(s.category, (catCounts.get(s.category) || 0) + 1);
                  }
                  if (catCounts.size <= 1) return null; // no tabs needed if all same category
                  // Resolve labels from skillCategories prop
                  const labelMap = new Map(skillCategories.map((c) => [c.id, c.label]));
                  const tabs = [...catCounts.entries()]
                    .map(([id, count]) => ({ id, label: labelMap.get(id) || id, count }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                  return (
                    <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                      <button
                        onClick={() => setSkillTab("all")}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                          skillTab === "all"
                            ? "border-amber-500 text-amber-600 dark:text-amber-400"
                            : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        )}
                      >
                        All
                        <span className="ml-1 text-xs tabular-nums opacity-60">{baseList.length}</span>
                      </button>
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setSkillTab(tab.id)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                            skillTab === tab.id
                              ? "border-amber-500 text-amber-600 dark:text-amber-400"
                              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          )}
                        >
                          {tab.label}
                          <span className="ml-1 text-xs tabular-nums opacity-60">{tab.count}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-2">
                    {filteredSkills.map((skill) => {
                      const sc = SKILL_STATUS_CONFIG[skill.status];
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
                            {skill.verified && (
                              <span title="Meets skill authoring standard">
                                <BadgeCheck size={13} className="text-blue-500 flex-shrink-0" />
                              </span>
                            )}
                            {onSkillDelete && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onSkillDelete({ name: skill.name, path: skill.path, title: skill.title }); }}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0"
                                title="Delete skill"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", sc.dot)} title={sc.label} />
                          </div>
                          {skill.summary && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-1.5">{skill.summary}</p>
                          )}
                          {(skill.input || skill.output) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {skill.input && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  <ArrowDownToLine size={8} className="text-blue-400" />
                                  {skill.input}
                                </span>
                              )}
                              {skill.output && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  <ArrowUpFromLine size={8} className="text-green-400" />
                                  {skill.output}
                                </span>
                              )}
                            </div>
                          )}
                          {(skill.sources || skill.writes) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {skill.sources && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                                  <FolderInput size={8} className="text-amber-400/70" />
                                  {skill.sources}
                                </span>
                              )}
                              {skill.writes && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                                  <FolderOutput size={8} className="text-purple-400/70" />
                                  {skill.writes}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(() => {
                              const drift = driftBySlug.get(skill.name);
                              return (
                                <DriftBadge
                                  status={drift?.status ?? "not_tracked"}
                                  targetModified={drift?.status === "in_sync" ? relativeDate(drift.target_modified) : undefined}
                                  onClick={drift?.status === "drifted" && botSkillsRelPath ? (e) => {
                                    e.stopPropagation();
                                    setDriftModal({ slug: skill.name, name: skill.title, targetPath: botSkillsRelPath + "/" + skill.name });
                                  } : undefined}
                                />
                              );
                            })()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
              </section>
            )}

            {/* Sessions */}
            {activeTab === "sessions" && (
              <section>
                {recentSessions.length === 0 ? (
                  <div className="py-6 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <Clock size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400">No sessions yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {recentSessions.map((s) => (
                      <button
                        key={s.path}
                        onClick={() => onSessionClick(s)}
                        className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all cursor-pointer group"
                      >
                        <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700 mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{relativeDate(s.date)}</span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-600">{s.date}</span>
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
                )}
              </section>
            )}

            {/* Memory */}
            {activeTab === "memory" && (
              <section>
                {memoryDir && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3 font-mono truncate" title={memoryDir}>
                    {memoryDir.replace(/^\/Users\/[^/]+/, "~")}
                  </p>
                )}
                {memoryList.length === 0 ? (
                  <div className="py-6 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <Database size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400">No memory files</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {memoryList.map((mem) => {
                      const typeColors: Record<string, string> = {
                        user: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
                        feedback: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
                        project: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                        reference: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
                      };
                      return (
                        <button
                          key={mem.path}
                          onClick={() => onMemoryClick(mem)}
                          className="w-full text-left px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Database size={13} className="text-violet-500 flex-shrink-0" />
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors flex-1">
                              {mem.memoryName}
                            </span>
                            {mem.type && (
                              <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded", typeColors[mem.type] || "bg-zinc-100 dark:bg-zinc-800 text-zinc-500")}>
                                {mem.type}
                              </span>
                            )}
                            <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-700 flex-shrink-0 group-hover:text-zinc-500 transition-colors" />
                          </div>
                          {mem.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{mem.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Config */}
            {activeTab === "config" && claudeMdPath && (
              <section>
                <BotConfigPanel
                  claudeContent={claudeContent}
                  claudeMdPath={claudeMdPath}
                  availableSkillDirs={availableSkillDirs ?? []}
                />
              </section>
            )}
          </div>

          {/* Right column: Instructions + Commands (hidden in config tab) */}
          <div className={cn("w-[320px] flex-shrink-0 space-y-4", activeTab === "config" && "hidden")}>
            {driftModal && (
              <DriftDiffModal
                slug={driftModal.slug}
                skillName={driftModal.name}
                targetPath={driftModal.targetPath}
                onClose={() => setDriftModal(null)}
                onSynced={() => queryClient.invalidateQueries({ queryKey: ["skill-drift"] })}
              />
            )}

            {/* Commands */}
            {commandCount > 0 && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Commands</span>
                  <span className="text-xs text-zinc-400 tabular-nums">{commandCount}</span>
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
                    <span className="text-xs text-zinc-400">Department</span>
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{profile.department}</span>
                  </div>
                )}
                {profile.role && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Role</span>
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{profile.role}</span>
                  </div>
                )}
                {profile.focus && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Focus</span>
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{profile.focus}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Directory</span>
                  <span className="text-xs font-mono text-zinc-400 truncate max-w-[180px]" title={bot.name}>{bot.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
