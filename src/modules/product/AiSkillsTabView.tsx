// src/modules/product/AiSkillsTabView.tsx
// Platform-level AI Skills catalog — manage skill definitions and domain deployments

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Sparkles,
  Loader2,
  Plus,
  FileText,
  FolderOpen,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { useRepository } from "../../stores/repositoryStore";
import {
  useListDomainAiStatus,
} from "../../hooks/val-sync";
import { useListDirectory } from "../../hooks/useFiles";
import { useAiSkills, useCreateAiSkill } from "../../hooks/useAiSkills";
import { useReadFile } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";

export function AiSkillsTabView() {
  const { activeRepository } = useRepository();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const skillsQuery = useAiSkills();
  const skills = skillsQuery.data ?? [];
  const skillSlugs = useMemo(() => skills.map((s) => s.slug), [skills]);
  const createSkillMutation = useCreateAiSkill();

  const entitiesPath = activeRepository
    ? `${activeRepository.path}/0_Platform/architecture/domain-model/entities`
    : null;
  const domainStatusQuery = useListDomainAiStatus(entitiesPath);

  // Auto-select first skill when loaded
  const effectiveSelected =
    selectedSkill && skillSlugs.includes(selectedSkill)
      ? selectedSkill
      : skillSlugs[0] ?? null;

  // Selected skill metadata
  const selectedSkillDef = useMemo(
    () => skills.find((s) => s.slug === effectiveSelected) ?? null,
    [skills, effectiveSelected]
  );

  // Skill folder path for listing files
  const skillFolderPath = activeRepository && effectiveSelected
    ? `${activeRepository.path}/0_Platform/skills/${effectiveSelected}`
    : undefined;
  const skillFilesQuery = useListDirectory(skillFolderPath);
  const skillFiles = useMemo(
    () =>
      (skillFilesQuery.data ?? []).filter(
        (f) => !f.is_directory && f.name !== "skill.json" && f.name !== "SKILL.md"
      ),
    [skillFilesQuery.data]
  );

  // Read SKILL.md content for inline display
  const skillMdPath = skillFolderPath ? `${skillFolderPath}/SKILL.md` : undefined;
  const skillMdQuery = useReadFile(skillMdPath ?? "");
  const skillMdContent = skillMdPath ? skillMdQuery.data : undefined;

  // Per-skill stats
  const skillStats = useMemo(() => {
    const stats: Record<string, { domains: number }> = {};
    for (const skill of skills) {
      const domains =
        domainStatusQuery.data?.filter((d) =>
          d.configured_skills.includes(skill.slug)
        ).length ?? 0;
      stats[skill.slug] = { domains };
    }
    return stats;
  }, [skills, domainStatusQuery.data]);

  // Domains with selected skill configured
  const deployedDomains = useMemo(() => {
    if (!effectiveSelected || !domainStatusQuery.data) return [];
    return domainStatusQuery.data.filter((d) =>
      d.configured_skills.includes(effectiveSelected)
    );
  }, [effectiveSelected, domainStatusQuery.data]);

  // Create new skill
  const handleCreate = useCallback(() => {
    const name = newSkillName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) return;
    createSkillMutation.mutate(
      { slug, name, description: "" },
      {
        onSuccess: (result) => {
          setNewSkillName("");
          setCreating(false);
          setSelectedSkill(result.slug);
        },
      }
    );
  }, [newSkillName, createSkillMutation]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreate();
      } else if (e.key === "Escape") {
        setCreating(false);
        setNewSkillName("");
      }
    },
    [handleCreate]
  );

  const handleStartCreate = useCallback(() => {
    setCreating(true);
    setTimeout(() => createInputRef.current?.focus(), 0);
  }, []);

  const handleOpenSkillFolder = useCallback(() => {
    if (!skillFolderPath) return;
    invoke("open_in_finder", { path: skillFolderPath }).catch(console.error);
  }, [skillFolderPath]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — skill list */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-900/50">
        <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            AI Skills
          </h3>
          <button
            onClick={handleStartCreate}
            className="p-1 rounded-md text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            title="New skill"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {creating && (
            <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
              <input
                ref={createInputRef}
                type="text"
                placeholder="Skill name..."
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                onKeyDown={handleCreateKeyDown}
                onBlur={() => {
                  if (!newSkillName.trim()) {
                    setCreating(false);
                  }
                }}
                disabled={createSkillMutation.isPending}
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-violet-300 dark:border-violet-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              {createSkillMutation.isError && (
                <p className="text-[11px] text-red-500 mt-1">
                  {String(createSkillMutation.error)}
                </p>
              )}
            </div>
          )}

          {skillsQuery.isLoading && (
            <div className="px-3 py-4 text-sm text-zinc-400 text-center">
              Loading...
            </div>
          )}

          {!skillsQuery.isLoading && skills.length === 0 && !creating && (
            <div className="px-3 py-4 text-sm text-zinc-400 text-center">
              No skills yet
            </div>
          )}

          {skills.map((skill) => {
            const stats = skillStats[skill.slug];
            return (
              <button
                key={skill.slug}
                onClick={() => setSelectedSkill(skill.slug)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors",
                  effectiveSelected === skill.slug
                    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                <Sparkles
                  size={14}
                  className={cn(
                    effectiveSelected === skill.slug
                      ? "text-violet-500"
                      : "text-zinc-400"
                  )}
                />
                <div className="flex-1 min-w-0 text-left">
                  <span className="font-medium truncate block">
                    {skill.name}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono truncate block">
                    {skill.slug}
                  </span>
                </div>
                {stats && stats.domains > 0 && (
                  <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">
                    {stats.domains}d
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
          {skills.length} skill{skills.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!effectiveSelected && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            {skills.length === 0
              ? 'Click "+" to create your first skill'
              : "Select a skill from the sidebar"}
          </div>
        )}

        {effectiveSelected && selectedSkillDef && (
          <div className="flex flex-col h-full">
            {/* Compact header bar */}
            <div className="flex-shrink-0 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Sparkles size={16} className="text-violet-500" />
                  {selectedSkillDef.name}
                </h2>
                {deployedDomains.length > 0 && (
                  <span className="text-xs text-zinc-400">
                    {deployedDomains.length} domain{deployedDomains.length !== 1 ? "s" : ""}
                  </span>
                )}
                {skillFiles.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {skillFiles.map((f) => (
                      <button
                        key={f.name}
                        onClick={() => setPreviewFile({ path: f.path, name: f.name })}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                      >
                        <FileText size={9} />
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleOpenSkillFolder}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors flex-shrink-0"
              >
                <FolderOpen size={12} />
                Open Folder
              </button>
            </div>

            {/* SKILL.md content */}
            <div className="flex-1 overflow-y-auto">
              {skillMdQuery.isLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-zinc-400" />
                </div>
              )}
              {skillMdContent && (
                <div className="px-8 py-6">
                  <MarkdownViewer content={skillMdContent} filename="SKILL.md" />
                </div>
              )}
              {!skillMdQuery.isLoading && !skillMdContent && (
                <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
                  No SKILL.md found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* File preview modal */}
      {previewFile && (
        <FilePreviewModal
          filePath={previewFile.path}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// FilePreviewModal — renders markdown/text file in a modal overlay
// ============================================================================

function FilePreviewModal({
  filePath,
  fileName,
  onClose,
}: {
  filePath: string;
  fileName: string;
  onClose: () => void;
}) {
  const { data: content, isLoading } = useReadFile(filePath);
  const displayName = fileName.replace(/\.md$/, "");
  const isMarkdown = fileName.endsWith(".md");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 animate-fade-in">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-modal-in">
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="text-violet-500 flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{displayName}</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{fileName}</span>
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
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          )}
          {content && isMarkdown && (
            <div className="px-6 py-5">
              <MarkdownViewer content={content} filename={fileName} />
            </div>
          )}
          {content && !isMarkdown && (
            <pre className="px-6 py-5 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
