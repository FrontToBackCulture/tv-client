// src/modules/product/AiSkillsTabView.tsx
// Platform-level AI Skills catalog — skills as primary objects, assign table metadata to skills

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Sparkles,
  Database,
  Loader2,
  Check,
  Globe,
  Plus,
  FileText,
  Pencil,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../../lib/cn";
import { useRepository } from "../../stores/repositoryStore";
import {
  useDomainModelEntities,
  useListDomainAiStatus,
} from "../../hooks/useValSync";
import { useListDirectory } from "../../hooks/useFiles";
import { useAiSkills, useCreateAiSkill } from "../../hooks/useAiSkills";
import { useReadFile } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";

// ============================================================================
// Types
// ============================================================================

interface AiModel {
  entity: string;
  name: string;
  displayName: string | null;
  fieldCount: number | null;
  aiSkills: string[];
  schemaPath: string;
}

// ============================================================================
// Component
// ============================================================================

export function AiSkillsTabView() {
  const { activeRepository } = useRepository();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const entitiesPath = activeRepository
    ? `${activeRepository.path}/0_Platform/architecture/domain-model/entities`
    : null;

  const skillsQuery = useAiSkills();
  const skills = skillsQuery.data ?? [];
  const skillSlugs = useMemo(() => skills.map((s) => s.slug), [skills]);
  const createSkillMutation = useCreateAiSkill();

  const entitiesQuery = useDomainModelEntities(entitiesPath);
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
        (f) => !f.is_directory && f.name !== "skill.json"
      ),
    [skillFilesQuery.data]
  );

  // All models with ai_package=true
  const aiModels = useMemo(() => {
    if (!entitiesQuery.data || !entitiesPath) return [];
    const models: AiModel[] = [];
    for (const entity of entitiesQuery.data) {
      for (const model of entity.models) {
        if (model.ai_package) {
          models.push({
            entity: entity.name,
            name: model.name,
            displayName: model.display_name,
            fieldCount: model.field_count,
            aiSkills: model.ai_skills,
            schemaPath: `${entitiesPath}/${entity.name}/${model.name}/schema.json`,
          });
        }
      }
    }
    return models;
  }, [entitiesQuery.data, entitiesPath]);

  // Split into assigned and available using skill.json as source of truth
  // Tables can be assigned to multiple skills
  const { assignedModels, availableModels } = useMemo(() => {
    if (!selectedSkillDef)
      return { assignedModels: [] as AiModel[], availableModels: [] as AiModel[] };
    const skillTables = new Set(selectedSkillDef.tables);
    const assigned: AiModel[] = [];
    const available: AiModel[] = [];
    for (const m of aiModels) {
      const key = `${m.entity}/${m.name}`;
      if (skillTables.has(key)) {
        assigned.push(m);
      } else {
        available.push(m);
      }
    }
    return { assignedModels: assigned, availableModels: available };
  }, [aiModels, selectedSkillDef]);

  // Per-skill stats (from skill.json tables arrays)
  const skillStats = useMemo(() => {
    const stats: Record<string, { tables: number; domains: number }> = {};
    for (const skill of skills) {
      const domains =
        domainStatusQuery.data?.filter((d) =>
          d.configured_skills.includes(skill.slug)
        ).length ?? 0;
      stats[skill.slug] = { tables: skill.tables.length, domains };
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

  // Toggle skill assignment — writes only to skill.json (single source of truth)
  const handleToggle = useCallback(
    async (_schemaPath: string, key: string) => {
      if (!effectiveSelected || !skillFolderPath) return;
      setToggling(key);
      try {
        const skillJsonPath = `${skillFolderPath}/skill.json`;
        const raw = await invoke<string>("read_file", { path: skillJsonPath });
        const skillJson = JSON.parse(raw);
        const currentTables: string[] = skillJson.tables ?? [];
        const isAssigned = currentTables.includes(key);

        if (isAssigned) {
          skillJson.tables = currentTables.filter((t: string) => t !== key);
        } else {
          skillJson.tables = [...currentTables, key];
        }

        if (skillJson.tables.length === 0) {
          delete skillJson.tables;
        }

        await invoke("write_file", {
          path: skillJsonPath,
          content: JSON.stringify(skillJson, null, 2),
        });
        queryClient.invalidateQueries({ queryKey: ["ai-skills"] });
      } catch (err) {
        console.error("Failed to toggle skill assignment:", err);
      } finally {
        setToggling(null);
      }
    },
    [effectiveSelected, skillFolderPath, queryClient]
  );

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

  // Edit description
  const handleStartEditDescription = useCallback(() => {
    setDescriptionDraft(selectedSkillDef?.description ?? "");
    setEditingDescription(true);
    setTimeout(() => descriptionRef.current?.focus(), 0);
  }, [selectedSkillDef]);

  const handleSaveDescription = useCallback(async () => {
    if (!skillFolderPath || !selectedSkillDef) return;
    setSavingDescription(true);
    try {
      const skillJsonPath = `${skillFolderPath}/skill.json`;
      const raw = await invoke<string>("read_file", { path: skillJsonPath });
      const json = JSON.parse(raw);
      json.description = descriptionDraft.trim() || undefined;
      await invoke("write_file", {
        path: skillJsonPath,
        content: JSON.stringify(json, null, 2),
      });
      queryClient.invalidateQueries({ queryKey: ["ai-skills"] });
      setEditingDescription(false);
    } catch (err) {
      console.error("Failed to save description:", err);
    } finally {
      setSavingDescription(false);
    }
  }, [skillFolderPath, selectedSkillDef, descriptionDraft, queryClient]);

  const handleDescriptionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveDescription();
      } else if (e.key === "Escape") {
        setEditingDescription(false);
      }
    },
    [handleSaveDescription]
  );

  const handleOpenSkillFolder = useCallback(() => {
    if (!skillFolderPath) return;
    invoke("open_in_finder", { path: skillFolderPath }).catch(console.error);
  }, [skillFolderPath]);

  // Table card renderer
  const renderTableCard = (m: AiModel, assigned: boolean) => {
    const key = `${m.entity}/${m.name}`;
    const isToggling = toggling === key;
    return (
      <button
        key={key}
        onClick={() => handleToggle(m.schemaPath, key)}
        disabled={isToggling}
        className={cn(
          "text-left px-4 py-3 rounded-lg border transition-all group",
          assigned
            ? "bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800 hover:border-violet-300 dark:hover:border-violet-700"
            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className={cn(
              "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
              assigned
                ? "bg-violet-500 border-violet-500"
                : "border-zinc-300 dark:border-zinc-600 group-hover:border-violet-400"
            )}
          >
            {isToggling ? (
              <Loader2 size={10} className="animate-spin text-white" />
            ) : assigned ? (
              <Check size={10} className="text-white" />
            ) : null}
          </div>
          <span
            className={cn(
              "text-sm font-medium truncate",
              assigned
                ? "text-violet-700 dark:text-violet-300"
                : "text-zinc-700 dark:text-zinc-300"
            )}
          >
            {m.displayName || m.name}
          </span>
        </div>
        <div className="pl-6 flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-mono">
            {m.entity}/{m.name}
          </span>
          {m.fieldCount != null && (
            <span className="text-[10px] text-zinc-400">
              {m.fieldCount} fields
            </span>
          )}
        </div>
      </button>
    );
  };

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
                {stats && (
                  <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">
                    {stats.tables}t
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
          {skills.length} skill{skills.length !== 1 ? "s" : ""} &middot;{" "}
          {aiModels.length} AI tables
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
          <div className="p-6 space-y-6">
            {/* Header + Description */}
            <div>
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Sparkles size={20} className="text-violet-500" />
                  {selectedSkillDef.name}
                </h2>
                <button
                  onClick={handleOpenSkillFolder}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <FolderOpen size={12} />
                  Open Folder
                </button>
              </div>

              {/* Editable description */}
              {editingDescription ? (
                <div className="mt-2">
                  <textarea
                    ref={descriptionRef}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    onKeyDown={handleDescriptionKeyDown}
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                    placeholder="Describe what this skill does..."
                  />
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={handleSaveDescription}
                      disabled={savingDescription}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                    >
                      {savingDescription ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingDescription(false)}
                      className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <span className="text-[10px] text-zinc-400">
                      Cmd+Enter to save
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-1 group/desc">
                  {selectedSkillDef.description ? (
                    <p
                      className="text-sm text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      onClick={handleStartEditDescription}
                    >
                      {selectedSkillDef.description}
                      <Pencil
                        size={11}
                        className="inline ml-1.5 opacity-0 group-hover/desc:opacity-100 transition-opacity text-zinc-400"
                      />
                    </p>
                  ) : (
                    <button
                      onClick={handleStartEditDescription}
                      className="text-sm text-zinc-400 hover:text-violet-500 transition-colors"
                    >
                      + Add description
                    </button>
                  )}
                </div>
              )}

              <p className="text-xs text-zinc-400 mt-2">
                {assignedModels.length} table
                {assignedModels.length !== 1 ? "s" : ""} assigned &middot;{" "}
                {deployedDomains.length} domain
                {deployedDomains.length !== 1 ? "s" : ""} deployed
              </p>
            </div>

            {/* Skill Files */}
            {skillFiles.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mb-2">
                  <FileText size={14} className="text-violet-500" />
                  Files
                </h3>
                <div className="flex flex-wrap gap-2">
                  {skillFiles.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => setPreviewFile({ path: f.path, name: f.name })}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-md bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-300 transition-colors cursor-pointer"
                    >
                      <FileText size={10} />
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Assigned Tables */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mb-3">
                <Database size={14} className="text-violet-500" />
                Assigned Tables ({assignedModels.length})
              </h3>

              {entitiesQuery.isLoading && (
                <div className="text-sm text-zinc-400 py-4">
                  Loading entities...
                </div>
              )}

              {assignedModels.length === 0 && !entitiesQuery.isLoading && (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center">
                  <p className="text-xs text-zinc-400">
                    No tables assigned yet. Add tables from the available list
                    below.
                  </p>
                </div>
              )}

              {assignedModels.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {assignedModels.map((m) => renderTableCard(m, true))}
                </div>
              )}
            </div>

            {/* Available Tables (collapsible) */}
            {availableModels.length > 0 && (
              <div>
                <button
                  onClick={() => setShowAvailable((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  {showAvailable ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <Database size={14} className="text-zinc-400" />
                  Available Tables ({availableModels.length})
                </button>

                {showAvailable && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {availableModels.map((m) => renderTableCard(m, false))}
                  </div>
                )}
              </div>
            )}

            {/* Deployed Domains */}
            {deployedDomains.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mb-3">
                  <Globe size={14} className="text-green-500" />
                  Deployed Domains ({deployedDomains.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {deployedDomains.map((d) => (
                    <span
                      key={d.domain}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {d.domain}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="text-violet-500 flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{displayName}</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{fileName}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
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
