// DomainAiTab — Tree + detail pane for AI context management
// Left: instructions.md + skill list. Right: content preview or management panel.

import { useState, useMemo, useCallback } from "react";
import {
  Brain,
  Loader2,
  Sparkles,
  Check,
  Package,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  BadgeCheck,
  AlertCircle,
  Settings,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui/DetailStates";
import { useListDirectory, useReadFile } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { useKnowledgePaths } from "../../hooks/useKnowledgePaths";
import {
  useGenerateAiPackage,
  useSaveDomainAiConfig,
  useSyncAiToS3,
  useS3AiStatus,
  type S3FileStatus,
} from "../../hooks/val-sync";
import { useSkillCheckAll, type SkillCategory } from "../skills/useSkillRegistry";
import { useSkills } from "../../hooks/skills/useSkills";
import { SkillAssignmentGrid } from "../../components/SkillAssignmentGrid";
import { DriftDiffModal, DriftBadge } from "../../components/DriftDiffModal";
import { useQueryClient } from "@tanstack/react-query";

interface DomainAiTabProps {
  aiPath: string;
  domainName: string;
  globalPath: string;
}

type SelectedItem = { type: "instructions" } | { type: "skill"; slug: string; path: string } | { type: "manage" } | { type: "s3" } | null;

export function DomainAiTab({ aiPath, domainName, globalPath }: DomainAiTabProps) {
  // Skills from Supabase
  const { data: supabaseSkills = [] } = useSkills();

  const AVAILABLE_AI_SKILLS = useMemo(() => {
    return supabaseSkills
      .filter((s) => (s.target === "platform" || s.target === "both") && s.status !== "deleted" && s.status !== "inactive" && s.status !== "deprecated")
      .map((s) => s.slug)
      .sort();
  }, [supabaseSkills]);

  const categories = useMemo<SkillCategory[]>(() => {
    const catSet = new Set<string>();
    for (const s of supabaseSkills) {
      if (s.category) catSet.add(s.category);
    }
    return [...catSet].sort().map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, " ") }));
  }, [supabaseSkills]);

  const skillEntries = useMemo(() => {
    const map: Record<string, { name: string; category: string; description?: string; target?: string; verified?: boolean }> = {};
    for (const s of supabaseSkills) {
      map[s.slug] = { name: s.name, category: s.category, description: s.description, target: s.target, verified: s.verified };
    }
    return map;
  }, [supabaseSkills]);
  const paths = useKnowledgePaths();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SelectedItem>({ type: "manage" });
  const [driftModal, setDriftModal] = useState<{ slug: string; name: string; targetPath: string } | null>(null);
  const [showAssignSkills, setShowAssignSkills] = useState(false);


  // Drift detection
  const { data: driftStatuses = [] } = useSkillCheckAll();
  const domainSkillsRelPath = paths
    ? (() => {
        const repoPath = paths.base;
        const fullSkillsPath = `${aiPath}/skills`;
        return fullSkillsPath.startsWith(repoPath) ? fullSkillsPath.slice(repoPath.length + 1) : null;
      })()
    : null;

  const driftBySlug = useMemo(() => {
    const map = new Map<string, { status: string; source_modified: string; target_modified: string }>();
    if (!domainSkillsRelPath) return map;
    const prefix = domainSkillsRelPath + "/";
    for (const d of driftStatuses) {
      if (d.distribution_path.startsWith(prefix)) {
        map.set(d.slug, { status: d.status, source_modified: d.source_modified, target_modified: d.target_modified });
      }
    }
    return map;
  }, [driftStatuses, domainSkillsRelPath]);

  const centralSkillsPath = paths ? paths.skills : null;
  const templatesPath = paths
    ? `${paths.base}/_team/melvin/bot-mel/skills/ai-project-generator/templates`
    : null;

  const skillsPath = `${aiPath}/skills`;
  const instructionsPath = `${aiPath}/instructions.md`;
  const configPath = `${aiPath}/ai_config.json`;

  const aiDir = useListDirectory(aiPath);
  const skillsDir = useListDirectory(skillsPath);
  const instructionsFile = useReadFile(instructionsPath);
  const configFile = useReadFile(configPath);

  const generateMutation = useGenerateAiPackage();
  const saveConfigMutation = useSaveDomainAiConfig();
  const s3SyncMutation = useSyncAiToS3();
  const s3Status = useS3AiStatus(domainName, globalPath);

  // Parse configured skills
  const configuredSkills = useMemo(() => {
    if (!configFile.data) return [] as string[];
    try {
      const parsed = JSON.parse(configFile.data);
      return ((parsed.skills ?? []) as string[]).filter(s => AVAILABLE_AI_SKILLS.includes(s));
    } catch {
      return [] as string[];
    }
  }, [configFile.data, AVAILABLE_AI_SKILLS]);

  const [localSkills, setLocalSkills] = useState<string[] | null>(null);
  const selectedSkills = localSkills ?? configuredSkills;

  const configKey = configuredSkills.join(",");
  const [lastConfigKey, setLastConfigKey] = useState("");
  if (configKey !== lastConfigKey) {
    setLastConfigKey(configKey);
    setLocalSkills(null);
  }

  const handleSkillToggle = useCallback(
    (skill: string) => {
      const current = localSkills ?? configuredSkills;
      const next = current.includes(skill)
        ? current.filter((s) => s !== skill)
        : [...current, skill];
      setLocalSkills(next);
      saveConfigMutation.mutate({ domain: domainName, skills: next });
    },
    [localSkills, configuredSkills, domainName, saveConfigMutation]
  );

  const handleGenerate = useCallback(() => {
    if (!centralSkillsPath || !templatesPath) return;
    generateMutation.mutate(
      { domain: domainName, skillsPath: centralSkillsPath, templatesPath, skills: selectedSkills },
      { onSuccess: () => { configFile.refetch(); skillsDir.refetch(); instructionsFile.refetch(); aiDir.refetch(); } }
    );
  }, [domainName, centralSkillsPath, templatesPath, selectedSkills, generateMutation, configFile, skillsDir, instructionsFile, aiDir]);

  const skillFiles = (skillsDir.data ?? []).filter(
    (f) => f.is_directory && !f.name.startsWith(".")
  );
  const hasInstructions = !!instructionsFile.data;

  // Build S3 sync lookup per file (must be before early return — hooks can't be conditional)
  const s3FileMap = useMemo(() => {
    const map = new Map<string, { inLocal: boolean; inS3: boolean }>();
    if (!s3Status.data?.files) return map;
    for (const f of s3Status.data.files) {
      map.set(f.path, { inLocal: f.in_local, inS3: f.in_s3 });
    }
    return map;
  }, [s3Status.data]);

  const s3InSync = s3Status.data
    ? s3Status.data.local_count === s3Status.data.s3_count && s3Status.data.s3_count > 0
    : false;

  if (aiDir.isLoading) {
    return <SectionLoading className="py-12" />;
  }

  return (
    <div className="flex h-full gap-0">
      {/* Left: Tree */}
      <div className="w-[260px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-auto flex flex-col">
        <div className="flex-1 py-2 overflow-auto">
          {/* Manage item */}
          <button
            onClick={() => setSelected({ type: "manage" })}
            className={cn(
              "w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors",
              selected?.type === "manage"
                ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            )}
          >
            <Settings size={14} className={selected?.type === "manage" ? "text-teal-500" : "text-zinc-400"} />
            <span className={cn("text-xs font-medium", selected?.type === "manage" && "text-teal-700 dark:text-teal-300")}>
              Manage & Publish
            </span>
          </button>

          {/* Instructions */}
          <button
            onClick={() => setSelected({ type: "instructions" })}
            className={cn(
              "w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors",
              selected?.type === "instructions"
                ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            )}
          >
            <Brain size={14} className={cn(
              selected?.type === "instructions" ? "text-teal-500" : hasInstructions ? "text-purple-500" : "text-zinc-300"
            )} />
            <span className={cn("text-xs truncate flex-1", selected?.type === "instructions" && "font-medium")}>
              instructions.md
            </span>
            {!hasInstructions && <span className="text-xs text-zinc-400 ml-auto">missing</span>}
            {hasInstructions && s3FileMap.has("instructions.md") && (
              <S3Dot inS3={s3FileMap.get("instructions.md")!.inS3} />
            )}
          </button>

          {/* Skills header */}
          <div className="px-3 pt-3 pb-1">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Skills ({skillFiles.length})
            </span>
          </div>

          {/* Skill items */}
          {skillFiles.map((file) => {
            const slug = file.name;
            const entry = skillEntries[slug];
            const drift = driftBySlug.get(slug);
            const title = entry?.name || slug;
            const isSelected = selected?.type === "skill" && selected.slug === slug;
            const s3Key = `skills/${slug}/SKILL.md`;
            const s3Info = s3FileMap.get(s3Key);

            return (
              <button
                key={file.path}
                onClick={() => setSelected({ type: "skill", slug, path: `${file.path}/SKILL.md` })}
                className={cn(
                  "w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors",
                  isSelected
                    ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                )}
              >
                <Sparkles size={13} className={isSelected ? "text-teal-500" : "text-violet-500"} />
                <span className={cn("text-xs truncate flex-1", isSelected && "font-medium")} title={title}>
                  {title}
                </span>
                {entry?.verified && (
                  <BadgeCheck size={11} className="text-blue-500 flex-shrink-0" />
                )}
                {drift && (
                  <DriftBadge
                    status={drift.status}
                    targetModified={drift.status === "in_sync" ? formatRelative(drift.target_modified) : undefined}
                    onClick={drift.status === "drifted" && domainSkillsRelPath ? (e) => {
                      e.stopPropagation();
                      setDriftModal({ slug, name: title, targetPath: domainSkillsRelPath + "/" + slug });
                    } : undefined}
                  />
                )}
                {s3Info && <S3Dot inS3={s3Info.inS3} />}
              </button>
            );
          })}

          {skillFiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-400">No skills deployed yet</p>
          )}

          {/* S3 Files */}
          {s3Status.data && s3Status.data.files.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  S3 Files ({s3Status.data.files.length})
                </span>
              </div>
              <button
                onClick={() => setSelected({ type: "s3" })}
                className={cn(
                  "w-full flex items-center gap-1.5 px-3 py-1.5 text-left transition-colors",
                  selected?.type === "s3"
                    ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                )}
              >
                <CloudUpload size={13} className={selected?.type === "s3" ? "text-teal-500" : "text-zinc-400"} />
                <span className={cn("text-xs truncate flex-1", selected?.type === "s3" && "font-medium")}>
                  View all S3 files
                </span>
                {s3InSync ? (
                  <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Bottom bar: S3 status + Push */}
        <div className="flex-shrink-0 px-3 py-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <CloudUpload size={11} />
              {s3Status.data ? (
                s3InSync ? (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                    <CheckCircle2 size={9} /> In sync
                  </span>
                ) : (
                  <span>{s3Status.data.local_count} local, {s3Status.data.s3_count} S3</span>
                )
              ) : (
                <span>S3</span>
              )}
            </div>
            <button
              onClick={() => s3Status.refetch()}
              disabled={s3Status.isFetching}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              <RefreshCw size={10} className={s3Status.isFetching ? "animate-spin" : ""} />
            </button>
          </div>
          <button
            onClick={() => s3SyncMutation.mutate({ domain: domainName, globalPath })}
            disabled={s3SyncMutation.isPending}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {s3SyncMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <CloudUpload size={11} />}
            Push to S3
          </button>
          {s3SyncMutation.isSuccess && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 text-center">
              {s3SyncMutation.data.message}
            </p>
          )}
        </div>
      </div>

      {/* Right: Content */}
      <div className="flex-1 overflow-auto">
        {selected?.type === "instructions" && (
          <InstructionsView content={instructionsFile.data} isLoading={instructionsFile.isLoading} />
        )}

        {selected?.type === "skill" && (
          <SkillView filePath={selected.path} />
        )}

        {selected?.type === "s3" && s3Status.data && (
          <S3FilesView files={s3Status.data.files} localCount={s3Status.data.local_count} s3Count={s3Status.data.s3_count} />
        )}

        {selected?.type === "manage" && (
          <ManagePanel
            selectedSkills={selectedSkills}
            availableSkills={AVAILABLE_AI_SKILLS}
            skillEntries={skillEntries}
            categories={categories}
            showAssignSkills={showAssignSkills}
            setShowAssignSkills={setShowAssignSkills}
            onSkillToggle={handleSkillToggle}
            onGenerate={handleGenerate}
            generateMutation={generateMutation}
            centralSkillsPath={centralSkillsPath}
          />
        )}

        {!selected && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Select an item to view
          </div>
        )}
      </div>

      {/* Drift diff modal */}
      {driftModal && (
        <DriftDiffModal
          slug={driftModal.slug}
          skillName={driftModal.name}
          targetPath={driftModal.targetPath}
          leftLabel="Current (domain copy)"
          onClose={() => setDriftModal(null)}
          onSynced={() => queryClient.invalidateQueries({ queryKey: ["skill-drift"] })}
        />
      )}
    </div>
  );
}

// ─── Instructions View ──────────────────────────────────────────────────────

function InstructionsView({ content, isLoading }: { content: string | undefined; isLoading: boolean }) {
  if (isLoading) return <SectionLoading className="py-12" />;
  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
        No instructions.md found — generate a package to create one.
      </div>
    );
  }
  return (
    <div className="p-6">
      <MarkdownViewer content={content} filename="instructions.md" />
    </div>
  );
}

// ─── Skill View ─────────────────────────────────────────────────────────────

function SkillView({ filePath }: { filePath: string }) {
  const { data: content, isLoading } = useReadFile(filePath);
  if (isLoading) return <SectionLoading className="py-12" />;
  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
        Could not load skill file
      </div>
    );
  }
  return (
    <div className="p-6">
      <MarkdownViewer content={content} filename="SKILL.md" />
    </div>
  );
}

// ─── Manage Panel ───────────────────────────────────────────────────────────

function ManagePanel({
  selectedSkills,
  availableSkills,
  skillEntries,
  categories,
  showAssignSkills,
  setShowAssignSkills,
  onSkillToggle,
  onGenerate,
  generateMutation,
  centralSkillsPath,
}: {
  selectedSkills: string[];
  availableSkills: string[];
  skillEntries: Record<string, { name: string; category: string }>;
  categories: SkillCategory[];
  showAssignSkills: boolean;
  setShowAssignSkills: (v: boolean) => void;
  onSkillToggle: (skill: string) => void;
  onGenerate: () => void;
  generateMutation: ReturnType<typeof useGenerateAiPackage>;
  centralSkillsPath: string | null;
}) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Manage & Publish</h2>
        <p className="text-xs text-zinc-400">
          Assign skills to this domain, generate the AI package, and publish to S3 for the client portal.
        </p>
      </div>

      {/* Skill Assignment */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-500" />
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Assigned Skills
            </label>
            {selectedSkills.length > 0 && (
              <span className="text-xs text-zinc-400 tabular-nums">{selectedSkills.length}</span>
            )}
          </div>
          <button
            onClick={() => setShowAssignSkills(!showAssignSkills)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              showAssignSkills
                ? "bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700 text-violet-600"
                : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-violet-300 hover:text-violet-600"
            )}
          >
            <Sparkles size={12} />
            {showAssignSkills ? "Hide Registry" : "Assign Skills"}
          </button>
        </div>
        {showAssignSkills && (
          <SkillAssignmentGrid
            skills={availableSkills}
            skillEntries={skillEntries}
            categories={categories}
            selectedSkills={selectedSkills}
            onToggle={onSkillToggle}
          />
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={onGenerate}
            disabled={generateMutation.isPending || !centralSkillsPath || selectedSkills.length === 0}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              !generateMutation.isPending && centralSkillsPath && selectedSkills.length > 0
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
            )}
          >
            {generateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            {generateMutation.isPending ? "Generating..." : "Generate Package"}
          </button>
          {generateMutation.isSuccess && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check size={12} />
              {generateMutation.data.skills_copied.length} skills
              {generateMutation.data.instructions_generated && ", instructions updated"}
            </span>
          )}
          {generateMutation.isError && (
            <span className="text-xs text-red-600">{String(generateMutation.error)}</span>
          )}
        </div>
        {selectedSkills.length === 0 && (
          <p className="text-xs text-zinc-400">Select at least one skill before generating.</p>
        )}
      </div>

    </div>
  );
}

function S3FilesView({ files, localCount, s3Count }: { files: S3FileStatus[]; localCount: number; s3Count: number }) {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">S3 Published Files</h2>
        <p className="text-xs text-zinc-400">
          {localCount} local files, {s3Count} in S3.
          {localCount === s3Count && s3Count > 0 && " All files in sync."}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-zinc-400 uppercase tracking-wider">
            <th className="text-left py-1.5 font-medium">File</th>
            <th className="text-center py-1.5 font-medium w-16">Local</th>
            <th className="text-center py-1.5 font-medium w-16">S3</th>
            <th className="text-right py-1.5 font-medium w-36">S3 Last Modified</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.path} className="border-t border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 font-mono text-zinc-700 dark:text-zinc-300 text-xs">{f.path}</td>
              <td className="py-2 text-center">
                {f.in_local ? <CheckCircle2 size={13} className="inline text-green-500" /> : <AlertCircle size={13} className="inline text-red-400" />}
              </td>
              <td className="py-2 text-center">
                {f.in_s3 ? <CheckCircle2 size={13} className="inline text-green-500" /> : <AlertCircle size={13} className="inline text-zinc-300 dark:text-zinc-600" />}
              </td>
              <td className="py-2 text-right text-xs text-zinc-400">
                {f.s3_last_modified
                  ? new Date(f.s3_last_modified).toLocaleString("en-SG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function S3Dot({ inS3 }: { inS3: boolean }) {
  return (
    <span title={inS3 ? "Published to S3" : "Not in S3"} className="flex-shrink-0">
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full", inS3 ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600")} />
    </span>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
