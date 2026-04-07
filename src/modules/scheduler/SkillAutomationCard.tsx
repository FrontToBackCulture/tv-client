// Skill Automation Card — same layout as DIO: pipeline steps + schedule below
// Skills → Instruction → Output, with schedule outside the pipeline.

import { useState, useMemo } from "react";
import {
  Puzzle, Play, Loader2, Trash2, Square, Brain,
  ArrowRight, Send, X,
} from "lucide-react";
import type { Job, SkillRef } from "../../hooks/scheduler";
import { useRunningJobsStore, useUpdateJob } from "../../hooks/scheduler";
import { useBots, useSkills, type BotSkill } from "../../hooks/useBotSkills";
import { PipelineStep } from "./PipelineStep";
import { ScheduleSection } from "./ScheduleSection";
import { Select, Textarea } from "../../components/ui";
import { cn } from "../../lib/cn";

function buildSkillPrompt(skills: BotSkill[], additional: string): string {
  if (skills.length === 0) return additional;
  const lines = skills.map((s) => `Read the skill at ${s.skillPath} and execute the full workflow.`);
  let prompt = lines.join("\n");
  if (additional.trim()) prompt += `\n\n${additional.trim()}`;
  prompt += "\n\nOutput the final report in markdown.";
  return prompt;
}

function extractAdditionalInstructions(prompt: string): string {
  const lines = prompt.split("\n");
  const nonSkillLines: string[] = [];
  let pastSkillLines = false;
  for (const line of lines) {
    if (line.startsWith("Read the skill at ") && line.endsWith("and execute the full workflow.")) {
      pastSkillLines = true;
      continue;
    }
    if (pastSkillLines) nonSkillLines.push(line);
  }
  let text = nonSkillLines.join("\n").trim();
  if (text.endsWith("Output the final report in markdown.")) {
    text = text.slice(0, -"Output the final report in markdown.".length).trim();
  }
  return text;
}

interface SkillAutomationCardProps {
  job: Job;
  onToggle: (id: string, enabled: boolean) => void;
  onRunNow: (id: string) => void;
  onStop?: (runId: string) => void;
  onEdit: (job: Job) => void;
  onDelete: (id: string) => void;
}

export function SkillAutomationCard({
  job, onToggle, onRunNow, onStop, onEdit: _onEdit, onDelete,
}: SkillAutomationCardProps) {
  const runningInfo = useRunningJobsStore((s) => s.runningJobs[job.id]);
  const isRunning = !!runningInfo || job.last_run_status === "running";
  const updateJob = useUpdateJob();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | null>(null);

  const skillNames = job.skill_refs?.map((r) => r.title) ?? [];
  const skillSummary = skillNames.length > 0 ? skillNames : ["Custom prompt"];

  const botAuthorName = job.bot_path
    ? job.bot_path.split("/").filter(Boolean).pop() || "bot-mel"
    : "bot-mel";
  const outputSummary = `New thread · ${botAuthorName}`;

  function saveField(fields: Partial<Record<string, unknown>>) {
    updateJob.mutate({ id: job.id, input: fields as any });
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2.5">
          <Puzzle size={16} className={job.enabled ? "text-indigo-500" : "text-zinc-400"} />
          <div>
            <div className={cn("text-sm font-medium", job.enabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500")}>
              {job.name}
            </div>
            {isRunning && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-blue-500">
                <Loader2 size={10} className="animate-spin" />
                {runningInfo?.step || "running"}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={() => { onDelete(job.id); setConfirmDelete(false); }} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="p-1 text-zinc-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={14} />
            </button>
          )}
          <button type="button" role="switch" aria-checked={job.enabled}
            onClick={() => onToggle(job.id, !job.enabled)}
            className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", job.enabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600")}>
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-200 transition-transform", job.enabled ? "translate-x-4" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      {/* Pipeline — clickable */}
      <div className="flex items-stretch border-t border-zinc-200 dark:border-zinc-800">
        <PipelineStep
          icon={Puzzle} step="1" title="Skills" lines={skillSummary}
          accent="text-indigo-500 dark:text-indigo-400"
          bg={activeStep === 1 ? "bg-indigo-100 dark:bg-indigo-950/50" : "bg-indigo-50 dark:bg-indigo-950/20"}
          isActive={activeStep === 1} onClick={() => setActiveStep(activeStep === 1 ? null : 1)}
        />
        <div className="flex items-center flex-shrink-0 px-0.5 text-zinc-300 dark:text-zinc-700"><ArrowRight size={14} /></div>
        <PipelineStep
          icon={Brain} step="2" title="Instruction" lines={[job.model === "sonnet" ? "Sonnet (balanced)" : job.model === "haiku" ? "Haiku (fast, cheap)" : job.model === "opus" ? "Opus (powerful)" : job.model]}
          accent="text-purple-500 dark:text-purple-400"
          bg={activeStep === 2 ? "bg-purple-100 dark:bg-purple-950/50" : "bg-purple-50 dark:bg-purple-950/20"}
          isActive={activeStep === 2} onClick={() => setActiveStep(activeStep === 2 ? null : 2)}
        />
        <div className="flex items-center flex-shrink-0 px-0.5 text-zinc-300 dark:text-zinc-700"><ArrowRight size={14} /></div>
        <PipelineStep
          icon={Send} step="3" title="Output" lines={[outputSummary]}
          accent="text-teal-500 dark:text-teal-400"
          bg={activeStep === 3 ? "bg-teal-100 dark:bg-teal-950/50" : "bg-teal-50 dark:bg-teal-950/20"}
          isActive={activeStep === 3} onClick={() => setActiveStep(activeStep === 3 ? null : 3)}
        />
      </div>

      {/* Step 1: Skills */}
      {activeStep === 1 && <SkillsPanel job={job} onSave={saveField} />}

      {/* Step 2: Instruction */}
      {activeStep === 2 && <InstructionPanel job={job} onSave={saveField} />}

      {/* Step 3: Output */}
      {activeStep === 3 && <OutputPanel job={job} onSave={saveField} />}

      {/* Schedule (outside pipeline, shared component) */}
      <ScheduleSection
        cron={job.cron_expression ?? ""}
        onCronChange={(cron) => saveField({ cron_expression: cron || null })}
        activeHours={null}
        onActiveHoursChange={() => {}}
      />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Last: {job.last_run_at ? new Date(job.last_run_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) : "Never"}
          </span>
          {job.last_run_status && !isRunning && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              job.last_run_status === "success" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
              job.last_run_status === "failed" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
            )}>{job.last_run_status}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && onStop && runningInfo?.runId && (
            <button onClick={() => onStop(runningInfo.runId)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Square size={10} className="fill-current" /> Stop
            </button>
          )}
          <button onClick={() => onRunNow(job.id)} disabled={isRunning}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {isRunning ? "Running..." : "Run now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Skills (skill selection only — bot selector moved to Step 2)
// ---------------------------------------------------------------------------

function SkillsPanel({ job, onSave }: { job: Job; onSave: (f: any) => void }) {
  const { data: skills } = useSkills();
  const botName = job.skill_refs?.[0]?.bot ?? "bot-mel";
  const [search, setSearch] = useState("");

  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(
    () => new Set(job.skill_refs?.map((r) => r.slug) ?? [])
  );

  const selectedSkills = useMemo(
    () => skills?.filter((s) => selectedSlugs.has(s.slug)) ?? [],
    [skills, selectedSlugs]
  );

  const filteredSkills = useMemo(() => {
    if (!skills) return [];
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }, [skills, search]);

  function toggleSkill(slug: string) {
    const next = new Set(selectedSlugs);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setSelectedSlugs(next);

    const newSelected = skills?.filter((s) => next.has(s.slug)) ?? [];
    const additional = job.skill_refs?.length ? extractAdditionalInstructions(job.skill_prompt) : "";
    if (newSelected.length > 0) {
      const skillRefs: SkillRef[] = newSelected.map((s) => ({ bot: botName, slug: s.slug, title: s.title }));
      onSave({ skill_prompt: buildSkillPrompt(newSelected, additional), skill_refs: skillRefs });
    } else {
      onSave({ skill_refs: null });
    }
  }

  return (
    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3 bg-indigo-50/50 dark:bg-indigo-950/10">
      {selectedSkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSkills.map((s) => (
            <span key={s.slug} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800">
              <Puzzle size={10} /> {s.title}
              <button type="button" onClick={() => toggleSkill(s.slug)} className="ml-0.5 text-teal-400 hover:text-teal-600"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
      />

      {filteredSkills.length > 0 ? (
        <div className="max-h-[220px] overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
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
      ) : (
        <p className="text-xs text-zinc-400">No skills found in _skills/ folder.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Instruction (bot + model + additional instructions)
// ---------------------------------------------------------------------------

function InstructionPanel({ job, onSave }: { job: Job; onSave: (f: any) => void }) {
  const { data: bots } = useBots();
  const currentBotName = job.skill_refs?.[0]?.bot ?? bots?.[0]?.name ?? null;
  const [botName, setBotName] = useState(currentBotName);


  const [model, setModel] = useState(job.model);
  const [additional, setAdditional] = useState(
    () => job.skill_refs?.length ? extractAdditionalInstructions(job.skill_prompt) : job.skill_prompt
  );

  function saveBotChange(newBotName: string) {
    setBotName(newBotName);
    const bot = bots?.find((b) => b.name === newBotName);
    onSave({ bot_path: bot?.path ?? null });
  }

  function saveModel(val: string) {
    setModel(val);
    onSave({ model: val });
  }

  function saveInstructions() {
    if (job.skill_refs?.length) {
      const skills: BotSkill[] = job.skill_refs.map((r) => ({
        slug: r.slug, title: r.title, summary: "", tools: "", category: "",
        skillPath: `_skills/${r.slug}/SKILL.md`,
      }));
      onSave({ skill_prompt: buildSkillPrompt(skills, additional) });
    } else {
      onSave({ skill_prompt: additional });
    }
  }

  return (
    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3 bg-purple-50/50 dark:bg-purple-950/10">
      {/* Bot selector — determines CLAUDE.md context */}
      {bots && bots.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Bot context</label>
          <Select value={botName ?? ""} onChange={(e) => saveBotChange(e.target.value)}>
            {bots.map((b) => {
              const folderName = b.path.split("/").filter(Boolean).pop() || `bot-${b.name}`;
              return <option key={b.name} value={b.name}>{folderName}</option>;
            })}
          </Select>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Runs under this bot's CLAUDE.md identity and settings
          </div>
        </div>
      )}

      {/* Model */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Model</label>
        <Select value={model} onChange={(e) => saveModel(e.target.value)}>
          <option value="haiku">Haiku (fast, cheap)</option>
          <option value="sonnet">Sonnet (balanced)</option>
          <option value="opus">Opus (powerful)</option>
        </Select>
      </div>

      {/* Additional instructions */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Additional instructions</label>
        <Textarea value={additional} onChange={(e) => setAdditional(e.target.value)} onBlur={saveInstructions} rows={3} placeholder="Focus on KOI domain only..." className="font-mono" />
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Appended after skill prompts. Saved on blur.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Output
// ---------------------------------------------------------------------------

function OutputPanel({ job, onSave }: { job: Job; onSave: (f: any) => void }) {
  const { data: bots } = useBots();
  const currentAuthor = job.bot_path
    ? job.bot_path.split("/").filter(Boolean).pop() || "bot-mel"
    : "bot-mel";
  const [botAuthor, setBotAuthor] = useState(currentAuthor);

  return (
    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3 bg-teal-50/50 dark:bg-teal-950/10">
      {/* Bot author */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Post as</label>
        <select
          value={botAuthor}
          onChange={(e) => {
            setBotAuthor(e.target.value);
            const bot = bots?.find((b) => (b.path.split("/").filter(Boolean).pop() || "") === e.target.value);
            if (bot) onSave({ bot_path: bot.path });
          }}
          className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
        >
          {bots?.map((b) => {
              const botName = b.path.split("/").filter(Boolean).pop() || `bot-${b.name}`;
              return <option key={botName} value={botName}>{botName}</option>;
            }) ?? (
              <option value={botAuthor}>{botAuthor}</option>
            )}
        </select>
      </div>

      {/* Threading mode */}
      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Threading mode</div>
      <div className="flex gap-2">
        {([
          { value: "new_thread", label: "New thread", desc: "Each run opens its own thread" },
          { value: "same_thread", label: "Same thread", desc: "All runs reply to one ongoing thread" },
        ]).map(({ value, label, desc }) => (
          <button
            key={value}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-left transition-colors",
              value === "new_thread"
                ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-600",
            )}
          >
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</div>
          </button>
        ))}
      </div>

    </div>
  );
}

// ScheduleSection is imported from ./ScheduleSection
