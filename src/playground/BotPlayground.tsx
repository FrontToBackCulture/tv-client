// src/playground/BotPlayground.tsx
// Prototype: Bots module redesign — overview card + drill-down views
// Toggle via Shift+Cmd+X → "Bots" tab

import { useState, useMemo, useEffect } from "react";
import { Bot, Clock, Loader2, Users } from "lucide-react";
import { useListDirectory, useReadFile, FileEntry } from "../hooks/useFiles";
import { useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useBotSettingsStore } from "../stores/botSettingsStore";
import { useViewContextStore } from "../stores/viewContextStore";
import { useFolderFiles, FolderFile } from "../hooks/useFolderFiles";
import { ViewTab } from "../components/ViewTab";

import {
  type BotEntry,
  type DetailView,
  GROUP_ORDER,
  getDeptGroup,
  formatBotName,
  parseBotProfile,
  parseSkillFrontmatter,
  extractDateFromPath,
} from "./botPlaygroundTypes";
import { SkillModal } from "./BotSkillModal";
import { BotOverview } from "./BotOverviewPanel";
import { SessionDetail, CommandListView, SessionsTimeline } from "./BotSessionViews";
import { BotSidebar } from "./BotSidebar";

export function BotPlayground() {
  const botsPath = useBotSettingsStore((s) => s.botsPath);
  const teamPath = botsPath || undefined;

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"directory" | "sessions">("directory");
  const [detailView, setDetailView] = useState<DetailView>(null);
  const [sessionDetailView, setSessionDetailView] = useState<{ date: string; title: string | null; summary: string | null; path: string } | null>(null);
  const [skillModal, setSkillModal] = useState<{ skillName: string; skillPath: string; title: string } | null>(null);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  const selectedBotName = selectedPath?.split("/").pop() ?? null;
  useEffect(() => {
    setViewContext(activeView, activeView === "directory" ? "Bot Directory" : "Recent Sessions");
    setViewDetail(selectedBotName ? `Bot: ${selectedBotName}` : null);
  }, [activeView, selectedBotName, setViewContext, setViewDetail]);

  // Load team directory
  const { data: teamEntries = [], isLoading: loadingTeam } = useListDirectory(teamPath);

  // Scan all member folders for personal bots
  const memberFolders = useMemo(
    () => teamEntries.filter((e) => e.is_directory && !e.name.startsWith("bot-") && !e.name.startsWith("_")),
    [teamEntries]
  );

  const memberQueries = useQueries({
    queries: memberFolders.map((folder) => ({
      queryKey: ["directory", folder.path],
      queryFn: () => invoke<FileEntry[]>("list_directory", { path: folder.path }),
    })),
  });

  // Build bot list
  const allBots = useMemo(() => {
    const teamBots: BotEntry[] = teamEntries
      .filter((e) => e.is_directory && e.name.startsWith("bot-"))
      .map((e) => ({ name: e.name, dirPath: e.path, group: getDeptGroup(e.name) }));

    // Collect personal bots from all member folders
    const allPersonalBots: BotEntry[] = [];
    memberFolders.forEach((folder, i) => {
      const entries = memberQueries[i]?.data || [];
      const bots = entries
        .filter((e) => e.is_directory && e.name.startsWith("bot-"))
        .map((e) => ({ name: e.name, dirPath: e.path, group: "personal", owner: folder.name }));
      allPersonalBots.push(...bots);
    });

    return [...allPersonalBots, ...teamBots].sort((a, b) => {
      const aOrder = GROUP_ORDER.indexOf(a.group);
      const bOrder = GROUP_ORDER.indexOf(b.group);
      if ((aOrder >= 0 ? aOrder : 999) !== (bOrder >= 0 ? bOrder : 999))
        return (aOrder >= 0 ? aOrder : 999) - (bOrder >= 0 ? bOrder : 999);
      return a.name.localeCompare(b.name);
    });
  }, [teamEntries, memberFolders, memberQueries]);

  const grouped = useMemo(() => {
    const groups: Record<string, BotEntry[]> = {};
    for (const bot of allBots) {
      if (!groups[bot.group]) groups[bot.group] = [];
      groups[bot.group].push(bot);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
    });
  }, [allBots]);

  const selectedBot = allBots.find((b) => b.dirPath === selectedPath);

  // CLAUDE.md for selected bot
  const claudeMdPath = selectedPath ? `${selectedPath}/CLAUDE.md` : undefined;
  const { data: claudeContent, isLoading: loadingClaude } = useReadFile(claudeMdPath);
  const profile = useMemo(() => parseBotProfile(claudeContent), [claudeContent]);

  // Commands for selected bot
  const commandsDir = selectedPath ? `${selectedPath}/.claude/commands` : undefined;
  const { data: commandEntries = [] } = useListDirectory(commandsDir);
  const commandCount = commandEntries.filter((e) => !e.is_directory && e.name.endsWith(".md")).length;

  // Skills for selected bot
  const skillsDir = selectedPath ? `${selectedPath}/skills` : undefined;
  const { data: skillEntries = [] } = useListDirectory(skillsDir);
  const skillFolders = skillEntries.filter((e) => e.is_directory);

  // Batch-read skill SKILL.md files
  const skillContentQueries = useQueries({
    queries: skillFolders.map((f) => ({
      queryKey: ["file", `${f.path}/SKILL.md`],
      queryFn: () => invoke<string>("read_file", { path: `${f.path}/SKILL.md` }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  // Read skill subfolders
  const skillSubfolderQueries = useQueries({
    queries: skillFolders.map((f) => ({
      queryKey: ["dir", f.path],
      queryFn: () => invoke<{ name: string; path: string; is_directory: boolean }[]>("list_directory", { path: f.path }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  // Read skill categories
  const categoriesPath = skillsDir ? `${skillsDir}/_categories.json` : undefined;
  const { data: categoriesRaw } = useReadFile(categoriesPath);
  const skillCategoriesData = useMemo(() => {
    if (!categoriesRaw) return { categories: [] as { id: string; label: string }[], skills: {} as Record<string, string> };
    try {
      const parsed = JSON.parse(categoriesRaw);
      return { categories: parsed.categories || [], skills: parsed.skills || {} };
    } catch {
      return { categories: [] as { id: string; label: string }[], skills: {} as Record<string, string> };
    }
  }, [categoriesRaw]);

  const skillList = useMemo(() => {
    return skillFolders.map((f, i) => {
      const content = skillContentQueries[i]?.data;
      const subfolders = skillSubfolderQueries[i]?.data || [];
      const titleMatch = content?.match(/^#\s+(.+)$/m);
      const summaryMatch = content?.match(/^summary:\s*"?([^"\n]+)"?/m) || content?.match(/^>\s*(.+)$/m);
      const meta = parseSkillFrontmatter(content);
      return {
        name: f.name,
        path: f.path,
        title: titleMatch?.[1] || f.name,
        summary: summaryMatch?.[1]?.trim() || "",
        subfolders: subfolders.filter((s) => s.is_directory && !s.name.startsWith(".")).map((s) => s.name),
        status: meta.status,
        lastRevised: meta.lastRevised,
        updated: meta.updated,
        category: skillCategoriesData.skills[f.name] || null,
        command: meta.command,
        input: meta.input,
        output: meta.output,
        sources: meta.sources,
        writes: meta.writes,
        tools: meta.tools,
      };
    });
  }, [skillFolders, skillContentQueries, skillSubfolderQueries, skillCategoriesData]);

  // Skill Usage Tracking
  const tvKnowledgeRoot = botsPath ? botsPath.replace(/\/_team\/?$/, "") : null;
  const skillUsageDir = tvKnowledgeRoot ? `${tvKnowledgeRoot}/.claude/skill-usage` : undefined;
  const { data: usageLogFiles = [] } = useListDirectory(skillUsageDir);
  const jsonlFiles = usageLogFiles.filter((f) => f.name.endsWith(".jsonl"));

  const usageLogQueries = useQueries({
    queries: jsonlFiles.map((f) => ({
      queryKey: ["file", f.path],
      queryFn: () => invoke<string>("read_file", { path: f.path }),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Sessions — scoped to the selected bot's owner
  const sessionsPath = useMemo(() => {
    if (!selectedBot) return null;
    if (selectedBot.owner && teamPath) {
      return `${teamPath}/${selectedBot.owner}/sessions`;
    }
    return `${selectedBot.dirPath}/sessions`;
  }, [selectedBot, teamPath]);
  const { data: sessionFiles = [] } = useFolderFiles(sessionsPath, 100);

  const botSessions = useMemo(() => {
    return sessionFiles
      .filter((f) => f.name === "notes.md")
      .map((f) => ({
        date: extractDateFromPath(f.path) || "",
        title: f.title,
        summary: f.summary,
        path: f.path,
      }))
      .filter((s) => s.date)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sessionFiles]);

  // Scan recent session notes for /skill-name mentions
  const sessionNoteQueries = useQueries({
    queries: botSessions.slice(0, 20).map((s) => ({
      queryKey: ["file", s.path],
      queryFn: () => invoke<string>("read_file", { path: s.path }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  // Aggregate usage counts from both sources
  const skillUsage = useMemo(() => {
    const result: Record<string, { invocations: number; mentions: number }> = {};

    // Count from JSONL logs
    usageLogQueries.forEach((q) => {
      if (!q.data) return;
      for (const line of q.data.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.skill) {
            if (!result[entry.skill]) result[entry.skill] = { invocations: 0, mentions: 0 };
            result[entry.skill].invocations++;
          }
        } catch { /* skip malformed lines */ }
      }
    });

    // Count /skill-name mentions in session notes
    const skillNames = skillList.map((s) => s.name);
    sessionNoteQueries.forEach((q) => {
      if (!q.data) return;
      for (const name of skillNames) {
        const regex = new RegExp(`\\/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        const matches = q.data.match(regex);
        if (matches) {
          if (!result[name]) result[name] = { invocations: 0, mentions: 0 };
          result[name].mentions += matches.length;
        }
      }
    });

    return result;
  }, [usageLogQueries, sessionNoteQueries, skillList]);

  // All sessions — aggregated across all member + team bot session folders (for Sessions tab)
  const allSessionSources = useMemo(() => {
    if (!teamPath) return [];
    const sources: { path: string; owner: string }[] = [];
    for (const folder of memberFolders) {
      sources.push({ path: `${folder.path}/sessions`, owner: folder.name });
    }
    for (const entry of teamEntries) {
      if (entry.is_directory && entry.name.startsWith("bot-")) {
        sources.push({ path: `${entry.path}/sessions`, owner: formatBotName(entry.name) });
      }
    }
    return sources;
  }, [teamPath, memberFolders, teamEntries]);

  const allSessionQueries = useQueries({
    queries: allSessionSources.map((src) => ({
      queryKey: ["folder-files", src.path, 100],
      queryFn: () => invoke<FolderFile[]>("get_folder_files", { path: src.path, limit: 100 }).catch(() => [] as FolderFile[]),
    })),
  });

  const allSessions = useMemo(() => {
    const all: { date: string; title: string | null; summary: string | null; path: string; owner?: string }[] = [];
    allSessionSources.forEach((src, i) => {
      const q = allSessionQueries[i];
      if (!q?.data) return;
      for (const f of q.data) {
        if (f.name !== "notes.md") continue;
        const date = extractDateFromPath(f.path);
        if (date) all.push({ date, title: f.title, summary: f.summary, path: f.path, owner: src.owner });
      }
    });
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [allSessionSources, allSessionQueries]);

  // Navigation
  const handleSelectBot = (path: string) => {
    setSelectedPath(path);
    setDetailView(null);
  };

  const handleBackToOverview = () => setDetailView(null);

  if (loadingTeam) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!teamPath) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950 text-zinc-400">
        <div className="text-center">
          <Bot size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No bots path configured</p>
          <p className="text-xs mt-1 text-zinc-500">Set your bots directory in Settings</p>
        </div>
      </div>
    );
  }

  // Determine right-panel content
  let content: React.ReactNode;

  if (detailView && selectedBot) {
    if (detailView.type === "session") {
      content = <SessionDetail sessionPath={detailView.sessionPath} date={detailView.date} title={detailView.title} onBack={handleBackToOverview} />;
    } else if (detailView.type === "commands" && commandsDir) {
      content = <CommandListView commandsDir={commandsDir} onBack={handleBackToOverview} />;
    }
  } else if (selectedBot) {
    content = (
      <div className="h-full overflow-y-auto pt-6">
        <BotOverview
          bot={selectedBot}
          profile={profile}
          claudeContent={claudeContent}
          isLoading={loadingClaude}
          skillCount={skillList.length}
          commandCount={commandCount}
          recentSessions={botSessions.slice(0, 5)}
          skillList={skillList}
          skillCategories={skillCategoriesData.categories}
          skillUsage={skillUsage}
          onSkillClick={(skill) => setSkillModal({ skillName: skill.name, skillPath: skill.path, title: skill.title })}
          onSessionClick={(session) => setDetailView({ type: "session", sessionPath: session.path, date: session.date, title: session.title })}
          onCommandsClick={() => setDetailView({ type: "commands" })}
        />
      </div>
    );
  } else {
    // No bot selected — show welcome
    content = (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <div className="text-center">
          <Bot size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Select a bot to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Directory" icon={Users} active={activeView === "directory"} onClick={() => { setActiveView("directory"); }} />
        <ViewTab label="Sessions" icon={Clock} active={activeView === "sessions"} onClick={() => { setActiveView("sessions"); setSelectedPath(null); setDetailView(null); setSessionDetailView(null); }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeView === "directory" ? (
          <>
            <BotSidebar
              bots={allBots}
              grouped={grouped}
              selectedPath={selectedPath}
              search={search}
              onSearch={setSearch}
              onSelect={handleSelectBot}
            />
            <div className="flex-1 min-w-0">{content}</div>
          </>
        ) : (
          <>
            <SessionsTimeline
              sessions={allSessions}
              selectedPath={sessionDetailView?.path ?? null}
              onSessionClick={(s) => setSessionDetailView(s)}
            />
            {sessionDetailView ? (
              <div className="flex-1 min-w-0">
                <SessionDetail
                  sessionPath={sessionDetailView.path}
                  date={sessionDetailView.date}
                  title={sessionDetailView.title}
                  onBack={() => setSessionDetailView(null)}
                />
              </div>
            ) : (
              <div className="flex-1 min-w-0 flex items-center justify-center text-zinc-400">
                <div className="text-center">
                  <Clock size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Select a session to view</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Skill modal overlay */}
      {skillModal && (
        <SkillModal
          skillPath={skillModal.skillPath}
          skillName={skillModal.skillName}
          title={skillModal.title}
          usage={skillUsage[skillModal.skillName]}
          onClose={() => setSkillModal(null)}
        />
      )}
    </div>
  );
}
