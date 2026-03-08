// src/modules/product/AiSkillsTabView.tsx
// Platform-level AI Skills catalog — manage skill definitions and domain deployments

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Sparkles,
  Plus,
  FileText,
  FolderOpen,
  X,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CloudUpload,
  RefreshCw,
  Minus,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import { useRepository } from "../../stores/repositoryStore";
import {
  useListDomainAiStatus,
  useSkillDeploymentStatus,
  type SkillDomainDeployment,
} from "../../hooks/val-sync";
import { useListDirectory } from "../../hooks/useFiles";
import { useCreateAiSkill } from "../../hooks/useAiSkills";
import { useReadFile } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { useSkillRegistry, type SkillCategory } from "../skills/useSkillRegistry";

type SkillDef = { slug: string; name: string; description: string; category: string };

export function AiSkillsTabView() {
  const { activeRepository } = useRepository();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const createInputRef = useRef<HTMLInputElement>(null);
  const registryQuery = useSkillRegistry();
  const registry = registryQuery.data;
  const skills: SkillDef[] = useMemo(() => {
    if (!registry) return [];
    return Object.entries(registry.skills)
      .filter(([, e]) => e.target === "platform" || e.target === "both")
      .map(([slug, e]) => ({ slug, name: e.name || slug, description: e.description || "", category: e.category || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [registry]);
  const categories = registry?.categories ?? [];
  const skillSlugs = useMemo(() => skills.map((s) => s.slug), [skills]);
  const createSkillMutation = useCreateAiSkill();

  const entitiesPath = activeRepository
    ? `${activeRepository.path}/0_Platform/architecture/domain-model/entities`
    : null;
  const skillsPath = activeRepository
    ? `${activeRepository.path}/_skills`
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
    ? `${activeRepository.path}/_skills/${effectiveSelected}`
    : undefined;
  const skillFilesQuery = useListDirectory(skillFolderPath);
  const skillFiles = useMemo(
    () =>
      (skillFilesQuery.data ?? []).filter(
        (f) => !f.is_directory && f.name !== "SKILL.md" && f.name !== "README.md" && !f.name.startsWith(".")
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

  // Content tab: "docs" or "deployment"
  const [contentTab, setContentTab] = useState<"docs" | "deployment">("docs");

  // Deployment status for selected skill
  const deploymentQuery = useSkillDeploymentStatus(
    contentTab === "deployment" ? effectiveSelected : null,
    skillsPath
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — skill list */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-900/50">
        <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
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
                <p className="text-xs text-red-500 mt-1">
                  {String(createSkillMutation.error)}
                </p>
              )}
            </div>
          )}

          {registryQuery.isLoading && (
            <div className="px-3 py-4 text-sm text-zinc-400 text-center">
              Loading...
            </div>
          )}

          {!registryQuery.isLoading && skills.length === 0 && !creating && (
            <div className="px-3 py-4 text-sm text-zinc-400 text-center">
              No skills yet
            </div>
          )}

          <CategoryTree
            skills={skills}
            categories={categories}
            selectedSlug={effectiveSelected}
            skillStats={skillStats}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            onSelect={setSelectedSkill}
          />
        </div>

        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
          {skills.length} skill{skills.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!effectiveSelected && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            {skills.length === 0
              ? 'Click "+" to create your first skill'
              : "Select a skill from the sidebar"}
          </div>
        )}

        {effectiveSelected && selectedSkillDef && (
          <>
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
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

            {/* Tab bar */}
            <div className="flex-shrink-0 px-6 border-b border-zinc-200 dark:border-zinc-800 flex gap-1">
              {(["docs", "deployment"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setContentTab(tab)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
                    contentTab === tab
                      ? "border-violet-500 text-violet-700 dark:text-violet-300"
                      : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  )}
                >
                  {tab === "docs" ? (
                    <span className="flex items-center gap-1.5">
                      <FileText size={12} />
                      Documentation
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <CloudUpload size={12} />
                      Deployment
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {contentTab === "docs" && (
                <>
                  {skillMdQuery.isLoading && (
                    <SectionLoading className="py-16" />
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
                </>
              )}

              {contentTab === "deployment" && (
                <SkillDeploymentPanel
                  query={deploymentQuery}
                  masterFileCount={deploymentQuery.data?.master_file_count}
                />
              )}
            </div>
          </>
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

function SkillSidebarItem({ skill, active, stats, onSelect }: { skill: SkillDef; active: boolean; stats?: { domains: number }; onSelect: (slug: string) => void }) {
  return (
    <button
      onClick={() => onSelect(skill.slug)}
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors",
        active
          ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      )}
    >
      <Sparkles size={14} className={cn(active ? "text-violet-500" : "text-zinc-400")} />
      <div className="flex-1 min-w-0 text-left">
        <span className="font-medium truncate block">{skill.name}</span>
        <span className="text-xs text-zinc-400 font-mono truncate block">{skill.slug}</span>
      </div>
      {stats && stats.domains > 0 && (
        <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">{stats.domains}d</span>
      )}
    </button>
  );
}

// ============================================================================
// CategoryTree — groups skills by registry categories (same as Skills module)
// ============================================================================

function CategoryTree({
  skills,
  categories,
  selectedSlug,
  skillStats,
  collapsedGroups,
  onToggleGroup,
  onSelect,
}: {
  skills: SkillDef[];
  categories: SkillCategory[];
  selectedSlug: string | null;
  skillStats: Record<string, { domains: number }>;
  collapsedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onSelect: (slug: string) => void;
}) {
  const topLevel = useMemo(
    () => [...categories].filter((c) => !c.parent).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label)),
    [categories]
  );

  const childrenOf = useCallback(
    (parentId: string) =>
      [...categories].filter((c) => c.parent === parentId).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label)),
    [categories]
  );

  const skillsByCategory = useMemo(() => {
    const map = new Map<string, SkillDef[]>();
    for (const s of skills) {
      const cat = s.category || "";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return map;
  }, [skills]);

  const totalCount = useCallback(
    (catId: string) => {
      let count = skillsByCategory.get(catId)?.length ?? 0;
      for (const child of childrenOf(catId)) {
        count += skillsByCategory.get(child.id)?.length ?? 0;
      }
      return count;
    },
    [skillsByCategory, childrenOf]
  );

  // Uncategorized skills (no category or category not in registry)
  const catIds = new Set(categories.map((c) => c.id));
  const uncategorized = skills.filter((s) => !s.category || !catIds.has(s.category));

  return (
    <>
      {topLevel.map((cat) => {
        const children = childrenOf(cat.id);
        const total = totalCount(cat.id);
        if (total === 0 && children.length === 0) return null;

        const collapsed = collapsedGroups.has(cat.id);
        return (
          <div key={cat.id}>
            <button
              onClick={() => onToggleGroup(cat.id)}
              className="w-full flex items-center gap-1 px-3 pt-3 pb-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <ChevronRight size={10} className={cn("text-zinc-400 transition-transform", !collapsed && "rotate-90")} />
              <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                {cat.label}
              </span>
              <span className="text-xs text-zinc-300 dark:text-zinc-600 ml-0.5">{total}</span>
            </button>
            {!collapsed && (
              <>
                {/* Direct skills in this category */}
                {(skillsByCategory.get(cat.id) ?? []).map((skill) => (
                  <SkillSidebarItem key={skill.slug} skill={skill} active={selectedSlug === skill.slug} stats={skillStats[skill.slug]} onSelect={onSelect} />
                ))}
                {/* Child categories */}
                {children.map((child) => {
                  const childSkills = skillsByCategory.get(child.id) ?? [];
                  if (childSkills.length === 0) return null;
                  const subKey = `${cat.id}/${child.id}`;
                  const subCollapsed = collapsedGroups.has(subKey);
                  return (
                    <div key={child.id}>
                      <button
                        onClick={() => onToggleGroup(subKey)}
                        className="w-full flex items-center gap-1 px-5 pt-2 pb-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <ChevronRight size={9} className={cn("text-zinc-400 transition-transform", !subCollapsed && "rotate-90")} />
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">{child.label}</span>
                        <span className="text-xs text-zinc-300 dark:text-zinc-600 ml-0.5">{childSkills.length}</span>
                      </button>
                      {!subCollapsed && childSkills.map((skill) => (
                        <SkillSidebarItem key={skill.slug} skill={skill} active={selectedSlug === skill.slug} stats={skillStats[skill.slug]} onSelect={onSelect} />
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <div>
          <button
            onClick={() => onToggleGroup("_uncategorized")}
            className="w-full flex items-center gap-1 px-3 pt-3 pb-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <ChevronRight size={10} className={cn("text-zinc-400 transition-transform", !collapsedGroups.has("_uncategorized") && "rotate-90")} />
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Uncategorized
            </span>
            <span className="text-xs text-zinc-300 dark:text-zinc-600 ml-0.5">{uncategorized.length}</span>
          </button>
          {!collapsedGroups.has("_uncategorized") && uncategorized.map((skill) => (
            <SkillSidebarItem key={skill.slug} skill={skill} active={selectedSlug === skill.slug} stats={skillStats[skill.slug]} onSelect={onSelect} />
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================================
// SkillDeploymentPanel — cross-domain deployment status for a skill
// ============================================================================

const DRIFT_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  in_sync: { icon: CheckCircle2, color: "text-green-500", label: "In Sync" },
  drifted: { icon: AlertTriangle, color: "text-amber-500", label: "Drifted" },
  missing: { icon: XCircle, color: "text-red-400", label: "Missing" },
  not_configured: { icon: Minus, color: "text-zinc-300 dark:text-zinc-600", label: "—" },
  error: { icon: XCircle, color: "text-red-500", label: "Error" },
};

function SkillDeploymentPanel({
  query,
  masterFileCount,
}: {
  query: { data?: { domains: SkillDomainDeployment[] }; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void; isFetching: boolean };
  masterFileCount?: number;
}) {
  if (query.isLoading) {
    return <SectionLoading className="py-16" />;
  }

  if (query.isError) {
    return (
      <div className="px-6 py-8 text-sm text-red-500">
        Failed to load deployment status: {String(query.error)}
      </div>
    );
  }

  const domains = query.data?.domains ?? [];
  const configured = domains.filter((d) => d.configured);
  const onS3 = domains.filter((d) => d.on_s3);
  const drifted = domains.filter((d) => d.drift_status === "drifted");
  const inSync = domains.filter((d) => d.drift_status === "in_sync");

  return (
    <div className="px-6 py-5 space-y-4">
      {/* Summary chips */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          Master files: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{masterFileCount ?? "—"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          Configured: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{configured.length}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          On S3: <span className="font-semibold text-teal-600 dark:text-teal-400">{onS3.length}</span>
        </div>
        {inSync.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 size={11} /> {inSync.length} in sync
          </div>
        )}
        {drifted.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={11} /> {drifted.length} drifted
          </div>
        )}
        <button
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          <RefreshCw size={10} className={query.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Deployment table */}
      {domains.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500">
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-center px-2 py-2 font-medium w-14">Type</th>
                <th className="text-center px-2 py-2 font-medium w-20">Configured</th>
                <th className="text-center px-2 py-2 font-medium w-20">Generated</th>
                <th className="text-center px-2 py-2 font-medium w-14">S3</th>
                <th className="text-center px-2 py-2 font-medium w-20">Drift</th>
                <th className="text-right px-3 py-2 font-medium w-16">Files</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => {
                const drift = DRIFT_CONFIG[d.drift_status] ?? DRIFT_CONFIG.error;
                const DriftIcon = drift.icon;
                return (
                  <tr
                    key={d.domain}
                    className={cn(
                      "border-t border-zinc-100 dark:border-zinc-800/50",
                      !d.configured && "opacity-40"
                    )}
                  >
                    <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                      {d.domain}
                    </td>
                    <td className="text-center px-2 py-2 text-zinc-400">
                      <span className="text-xs">{d.domain_type === "production" ? "prod" : d.domain_type}</span>
                    </td>
                    <td className="text-center px-2 py-2">
                      {d.configured ? (
                        <CheckCircle2 size={14} className="inline text-green-500" />
                      ) : (
                        <Minus size={14} className="inline text-zinc-300 dark:text-zinc-600" />
                      )}
                    </td>
                    <td className="text-center px-2 py-2">
                      {d.generated ? (
                        <CheckCircle2 size={14} className="inline text-green-500" />
                      ) : d.configured ? (
                        <XCircle size={14} className="inline text-red-400" />
                      ) : (
                        <Minus size={14} className="inline text-zinc-300 dark:text-zinc-600" />
                      )}
                    </td>
                    <td className="text-center px-2 py-2">
                      {d.on_s3 ? (
                        <CheckCircle2 size={14} className="inline text-teal-500" />
                      ) : d.configured ? (
                        <XCircle size={14} className="inline text-zinc-300 dark:text-zinc-600" />
                      ) : (
                        <Minus size={14} className="inline text-zinc-300 dark:text-zinc-600" />
                      )}
                    </td>
                    <td className="text-center px-2 py-2">
                      <span className={cn("inline-flex items-center gap-1", drift.color)}>
                        <DriftIcon size={12} />
                        <span className="text-xs">{drift.label}</span>
                      </span>
                    </td>
                    <td className="text-right px-3 py-2 text-zinc-400 tabular-nums">
                      {d.configured ? d.local_file_count : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{fileName}</span>
            </div>
            <IconButton
              onClick={onClose}
              icon={X}
              label="Close"
              className="flex-shrink-0"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <SectionLoading className="py-16" />
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
