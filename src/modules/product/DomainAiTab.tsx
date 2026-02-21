// src/modules/product/DomainAiTab.tsx
// AI tab for domain detail panel — shows instructions.md + skill management

import { useState, useMemo, useCallback } from "react";
import {
  FileText,
  Brain,
  X,
  Loader2,
  Sparkles,
  Check,
  Package,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useListDirectory, useReadFile, type FileEntry } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { useRepository } from "../../stores/repositoryStore";
import {
  useGenerateAiPackage,
  useSaveDomainAiConfig,
  useSyncAiToS3,
  useS3AiStatus,
  type S3FileStatus,
} from "../../hooks/val-sync";
import { useAiSkillSlugs } from "../../hooks/useAiSkills";

const SKILL_GROUP_ORDER = ["insights", "recon-diagnostics", "analytics"] as const;
const SKILL_GROUP_LABELS: Record<string, string> = {
  insights: "Insights",
  "recon-diagnostics": "Recon Diagnostics",
  analytics: "Analytics",
  other: "Other",
};

interface SkillGroup {
  label: string;
  subgroups?: { label: string; skills: string[] }[];
  skills?: string[];
}

function groupSkills(skills: string[]): SkillGroup[] {
  const groups: Record<string, string[]> = {};
  for (const skill of [...skills].sort()) {
    const prefix = SKILL_GROUP_ORDER.find((p) => skill.startsWith(`${p}-`));
    const key = prefix ?? "other";
    (groups[key] ??= []).push(skill);
  }
  const order = [...SKILL_GROUP_ORDER, "other"];
  return order
    .filter((key) => groups[key]?.length)
    .map((key) => {
      const label = SKILL_GROUP_LABELS[key] ?? key;
      const items = groups[key];
      // Sub-group analytics by domain (analytics-{domain}-...)
      if (key === "analytics") {
        const subs: Record<string, string[]> = {};
        for (const s of items) {
          const rest = s.replace(/^analytics-/, "");
          const domain = rest.split("-")[0];
          (subs[domain] ??= []).push(s);
        }
        const subgroups = Object.keys(subs).sort().map((d) => ({
          label: d.charAt(0).toUpperCase() + d.slice(1),
          skills: subs[d],
        }));
        return { label, subgroups };
      }
      return { label, skills: items };
    });
}

interface DomainAiTabProps {
  aiPath: string; // e.g. /path/to/domain/ai
  domainName: string; // e.g. "lag"
  globalPath: string; // e.g. /path/to/domain (parent of ai/)
}

export function DomainAiTab({ aiPath, domainName, globalPath }: DomainAiTabProps) {
  const AVAILABLE_AI_SKILLS = useAiSkillSlugs();
  const { activeRepository } = useRepository();
  const [selectedDoc, setSelectedDoc] = useState<{ path: string; name: string; type: "skill" | "instructions" } | null>(null);

  const entitiesPath = activeRepository
    ? `${activeRepository.path}/0_Platform/architecture/domain-model/entities`
    : null;
  const templatesPath = activeRepository
    ? `${activeRepository.path}/_team/melvin/bot-mel/skills/ai-project-generator/templates`
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

  // Parse configured skills from ai_config.json
  const configuredSkills = useMemo(() => {
    if (!configFile.data) return [] as string[];
    try {
      const parsed = JSON.parse(configFile.data);
      // Filter out stale skills that no longer exist in 0_Platform/skills/
      return ((parsed.skills ?? []) as string[]).filter(s => AVAILABLE_AI_SKILLS.includes(s));
    } catch {
      return [] as string[];
    }
  }, [configFile.data, AVAILABLE_AI_SKILLS]);

  const [localSkills, setLocalSkills] = useState<string[] | null>(null);
  const selectedSkills = localSkills ?? configuredSkills;

  // Sync local state when config loads/changes
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
    if (!entitiesPath || !templatesPath) return;
    generateMutation.mutate(
      { domain: domainName, entitiesPath, templatesPath, skills: selectedSkills },
      { onSuccess: () => { configFile.refetch(); skillsDir.refetch(); instructionsFile.refetch(); aiDir.refetch(); } }
    );
  }, [domainName, entitiesPath, templatesPath, selectedSkills, generateMutation, configFile, skillsDir, instructionsFile, aiDir]);

  const aiNotFound = aiDir.isError || (aiDir.isSuccess && aiDir.data.length === 0);

  const skillFiles = (skillsDir.data ?? []).filter(
    (f) => f.is_directory && !f.name.startsWith(".")
  );
  const hasInstructions = !!instructionsFile.data;

  if (aiDir.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile header card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-purple-400 to-purple-600" />
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              <Brain size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {domainName}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  AI Context
                </span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Instructions and skill documentation for this domain.
              </p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <Sparkles size={13} className={skillFiles.length > 0 ? "text-violet-500" : "text-zinc-300"} />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{skillFiles.length}</span>
              <span className="text-xs text-zinc-400">Skills</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <FileText size={13} className={hasInstructions ? "text-green-500" : "text-zinc-300"} />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{hasInstructions ? "1" : "0"}</span>
              <span className="text-xs text-zinc-400">Instructions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Skill Assignment + Generate */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-500" />
          <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Assigned Skills
          </label>
        </div>
        <div className="space-y-3">
          {groupSkills(AVAILABLE_AI_SKILLS).map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">{group.label}</p>
              {group.subgroups ? (
                <div className="space-y-2 pl-2 border-l-2 border-zinc-100 dark:border-zinc-800">
                  {group.subgroups.map((sub) => (
                    <div key={sub.label}>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-1">{sub.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sub.skills.map((skill) => {
                          const active = selectedSkills.includes(skill);
                          const shortName = skill.replace(/^analytics-[^-]+-/, "");
                          return (
                            <SkillPill key={skill} skill={skill} shortName={shortName} active={active} onToggle={handleSkillToggle} />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {group.skills!.map((skill) => {
                    const active = selectedSkills.includes(skill);
                    const shortName = skill.replace(/^(insights|recon-diagnostics)-/, "");
                    return (
                      <SkillPill key={skill} skill={skill} shortName={shortName} active={active} onToggle={handleSkillToggle} />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !entitiesPath || selectedSkills.length === 0}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              !generateMutation.isPending && entitiesPath && selectedSkills.length > 0
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
            )}
          >
            {generateMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Package size={14} />
            )}
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
            <span className="text-xs text-red-600 dark:text-red-400">
              Failed: {String(generateMutation.error)}
            </span>
          )}
        </div>
        {selectedSkills.length === 0 && (
          <p className="text-[11px] text-zinc-400">
            Select at least one skill before generating.
          </p>
        )}
        {generateMutation.isSuccess && generateMutation.data.errors.length > 0 && (
          <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1">
              Warnings ({generateMutation.data.errors.length})
            </p>
            <ul className="text-[11px] text-amber-600 dark:text-amber-400 space-y-0.5">
              {generateMutation.data.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Publish AI to S3 */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudUpload size={14} className="text-teal-500" />
            <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Publish AI to S3
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => s3Status.refetch()}
              disabled={s3Status.isFetching}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
              title="Refresh S3 status"
            >
              <RefreshCw size={10} className={s3Status.isFetching ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => s3SyncMutation.mutate({ domain: domainName, globalPath })}
              disabled={s3SyncMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded transition-colors"
            >
              {s3SyncMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CloudUpload size={12} />
              )}
              Push to S3
            </button>
          </div>
        </div>

        {s3SyncMutation.isSuccess && (
          <div className="p-2 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
            {s3SyncMutation.data.message} ({s3SyncMutation.data.duration_ms}ms)
          </div>
        )}
        {s3SyncMutation.isError && (
          <p className="text-xs text-red-500">
            {(s3SyncMutation.error as Error).message}
          </p>
        )}

        {/* S3 Status */}
        {s3Status.isLoading && (
          <div className="flex items-center gap-2 py-3 text-xs text-zinc-400">
            <Loader2 size={12} className="animate-spin" />
            Checking S3 status...
          </div>
        )}
        {s3Status.isError && (
          <p className="text-xs text-zinc-400 py-2">
            Could not check S3 status: {(s3Status.error as Error).message}
          </p>
        )}
        {s3Status.data && (
          <div className="space-y-2">
            {/* Summary chips */}
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-zinc-500">
                Local: <span className="font-medium text-zinc-700 dark:text-zinc-300">{s3Status.data.local_count} files</span>
              </span>
              <span className="text-zinc-500">
                S3: <span className="font-medium text-zinc-700 dark:text-zinc-300">{s3Status.data.s3_count} files</span>
              </span>
              {s3Status.data.local_count === s3Status.data.s3_count && s3Status.data.s3_count > 0 && (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                  <CheckCircle2 size={10} /> In sync
                </span>
              )}
              {s3Status.data.s3_count === 0 && s3Status.data.local_count > 0 && (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                  <AlertCircle size={10} /> Not published
                </span>
              )}
              {!s3Status.data.has_ai_folder && (
                <span className="text-zinc-400">No ai/ folder</span>
              )}
            </div>

            {/* File list */}
            {s3Status.data.files.length > 0 && (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500">
                      <th className="text-left px-2 py-1 font-medium">File</th>
                      <th className="text-center px-2 py-1 font-medium w-16">Local</th>
                      <th className="text-center px-2 py-1 font-medium w-16">S3</th>
                      <th className="text-right px-2 py-1 font-medium w-32">S3 Last Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s3Status.data.files.map((f: S3FileStatus) => (
                      <tr key={f.path} className="border-t border-zinc-100 dark:border-zinc-800/50">
                        <td className="px-2 py-1 font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]" title={f.path}>
                          {f.path}
                        </td>
                        <td className="text-center px-2 py-1">
                          {f.in_local ? (
                            <CheckCircle2 size={12} className="inline text-green-500" />
                          ) : (
                            <XCircle size={12} className="inline text-red-400" />
                          )}
                        </td>
                        <td className="text-center px-2 py-1">
                          {f.in_s3 ? (
                            <CheckCircle2 size={12} className="inline text-green-500" />
                          ) : (
                            <XCircle size={12} className="inline text-zinc-300 dark:text-zinc-600" />
                          )}
                        </td>
                        <td className="text-right px-2 py-1 text-zinc-400">
                          {f.s3_last_modified
                            ? new Date(f.s3_last_modified).toLocaleString("en-SG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {aiNotFound && (
        <div className="flex items-center justify-center py-8">
          <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 max-w-md text-center">
            <Brain size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
            <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              No AI context found
            </h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Assign skills above, then click "Generate Package".
            </p>
          </div>
        </div>
      )}

      {!aiNotFound && (
        <div className="flex items-start gap-6">
          {/* Left column: Skills */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-violet-500" />
              <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Skills
              </label>
              {skillFiles.length > 0 && (
                <span className="text-[10px] font-normal text-zinc-400 tabular-nums">
                  {skillFiles.length}
                </span>
              )}
            </div>

            {skillFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {skillFiles.map((file) => (
                  <SkillDocGridCard
                    key={file.path}
                    file={file}
                    onClick={() => setSelectedDoc({ path: `${file.path}/SKILL.md`, name: file.name, type: "skill" })}
                  />
                ))}
              </div>
            ) : (
              <div className="py-4 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                <Sparkles size={16} className="mx-auto mb-1.5 text-zinc-300 dark:text-zinc-700" />
                <p className="text-xs text-zinc-400">No skill docs yet</p>
              </div>
            )}
          </div>

          {/* Right column: Instructions */}
          <div className="w-[320px] flex-shrink-0 space-y-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-500" />
              <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Instructions
              </label>
            </div>

            <InstructionsCard
              content={instructionsFile.data}
              isLoading={instructionsFile.isLoading}
              isError={instructionsFile.isError}
              onShowMore={() => setSelectedDoc({ path: instructionsPath, name: "instructions.md", type: "instructions" })}
            />
          </div>
        </div>
      )}

      {/* Document modal — shared for skills and instructions */}
      {selectedDoc && (
        <DocModal
          filePath={selectedDoc.path}
          fileName={selectedDoc.name}
          type={selectedDoc.type}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}

function SkillPill({ skill, shortName, active, onToggle }: { skill: string; shortName: string; active: boolean; onToggle: (s: string) => void }) {
  return (
    <button
      onClick={() => onToggle(skill)}
      title={skill}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
        active
          ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700"
          : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700"
      )}
    >
      {active ? <Check size={11} /> : <Sparkles size={11} />}
      {shortName}
    </button>
  );
}

/** Grid card for a skill doc */
function SkillDocGridCard({ file, onClick }: { file: FileEntry; onClick: () => void }) {
  const displayName = file.name.replace(/\.md$/, "");

  const sizeLabel = file.size < 1024
    ? `${file.size} B`
    : `${(file.size / 1024).toFixed(1)} KB`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left px-4 py-3 rounded-lg border bg-white dark:bg-zinc-900 hover:shadow-sm transition-all cursor-pointer group",
        "border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={13} className="text-violet-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors flex-1">
          {displayName}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-zinc-400">{sizeLabel}</span>
        {file.modified && (
          <span className="text-[9px] text-zinc-400">{formatRelative(file.modified)}</span>
        )}
      </div>
    </button>
  );
}

/** Unified modal for viewing skill docs or instructions */
function DocModal({
  filePath,
  fileName,
  type,
  onClose,
}: {
  filePath: string;
  fileName: string;
  type: "skill" | "instructions";
  onClose: () => void;
}) {
  const { data: content, isLoading } = useReadFile(filePath);
  const displayName = fileName.replace(/\.md$/, "");

  const icon = type === "skill" ? (
    <Sparkles size={14} className="text-violet-500 flex-shrink-0" />
  ) : (
    <Brain size={14} className="text-purple-500 flex-shrink-0" />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 animate-fade-in">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-modal-in">
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {icon}
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{displayName}</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">&middot;</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{fileName}</span>
              </div>
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
          {content && (
            <div className="px-6 py-5">
              <MarkdownViewer content={content} filename={fileName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Instructions card with truncated preview */
function InstructionsCard({
  content,
  isLoading,
  isError,
  onShowMore,
}: {
  content: string | undefined;
  isLoading: boolean;
  isError: boolean;
  onShowMore: () => void;
}) {
  if (isLoading) {
    return (
      <div className="p-3 rounded border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
        Loading instructions...
      </div>
    );
  }

  if (isError || !content) {
    return (
      <div className="p-3 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-xs text-zinc-400">
        No instructions.md found — will be generated with the package.
      </div>
    );
  }

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="p-3">
        <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed line-clamp-[12]">
          {content}
        </pre>
      </div>
      <button
        onClick={onShowMore}
        className="w-full px-3 py-1.5 text-[11px] text-teal-600 dark:text-teal-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 transition-colors"
      >
        Show more
      </button>
    </div>
  );
}

/** Format a timestamp as relative time */
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
