// DIO Automation Card — Data → Instruction → Output
// Each card is a row from dio_automations table, fully inline-editable.

import { useState } from "react";
import {
  Database, Brain, Send, ArrowRight, Play, Loader2, Trash2,
} from "lucide-react";
import type { DioAutomation, DioSources, PostMode } from "../../hooks/chat/useTaskAdvisor";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_THREAD_TITLE_NEW,
  DEFAULT_THREAD_TITLE_SAME,
  MODEL_OPTIONS,
  SOURCE_OPTIONS,
} from "../../hooks/chat/useTaskAdvisor";
import { useBots } from "../../hooks/useBotSkills";
import { useUpdateDio, useDeleteDio } from "../../hooks/chat/useDioAutomations";
import { PipelineStep } from "./PipelineStep";
import { ScheduleSection, intervalHoursToCron, cronToIntervalHours } from "./ScheduleSection";
import { cn } from "../../lib/cn";

interface DioAutomationCardProps {
  automation: DioAutomation;
  onRunNow: (id: string) => void;
  running?: boolean;
}

export function DioAutomationCard({ automation, onRunNow, running }: DioAutomationCardProps) {
  const updateDio = useUpdateDio();
  const deleteDio = useDeleteDio();
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Local state for inline editing
  const [sources, setSources] = useState<DioSources>(automation.sources);
  const [model, setModel] = useState(automation.model);
  const [systemPrompt, setSystemPrompt] = useState(automation.system_prompt || "");
  // intervalHours and activeHours are handled by ScheduleSection
  const [postMode, setPostMode] = useState<PostMode>(automation.post_mode);
  const [threadId, setThreadId] = useState(automation.thread_id || `dio:${automation.id}:daily`);
  const [threadTitle, setThreadTitle] = useState(automation.thread_title || "");
  const [botAuthor, setBotAuthor] = useState(automation.bot_author || "bot-mel");
  const { data: bots } = useBots();

  function save(fields: Record<string, unknown>) {
    updateDio.mutate({ id: automation.id, ...fields } as any);
  }

  const activeSourceLabels = Object.entries(sources)
    .filter(([, v]) => v)
    .map(([k]) => SOURCE_OPTIONS.find((s) => s.key === k)?.label || k);

  const modelLabel = MODEL_OPTIONS.find((m) => m.value === model)?.label || model;
  const postModeLabel = postMode === "same_thread" ? `Same thread · ${botAuthor}` : `New thread · ${botAuthor}`;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2.5">
          <Database size={16} className={automation.enabled ? "text-blue-500" : "text-zinc-400"} />
          <div>
            <div className={cn("text-sm font-medium", automation.enabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500")}>
              {automation.name}
            </div>
            {automation.description && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{automation.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={() => { deleteDio.mutate(automation.id); setConfirmDelete(false); }} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="p-1 text-zinc-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={automation.enabled}
            onClick={() => save({ enabled: !automation.enabled })}
            className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", automation.enabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600")}
          >
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform", automation.enabled ? "translate-x-4" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      {/* Pipeline — clickable */}
      <div className="flex items-stretch border-t border-zinc-200 dark:border-zinc-800">
        <PipelineStep
          icon={Database}
          step="1"
          title="Data"
          lines={activeSourceLabels.length > 0 ? activeSourceLabels : ["No sources"]}
          accent="text-blue-500 dark:text-blue-400"
          bg={activeStep === 1 ? "bg-blue-100 dark:bg-blue-950/50" : "bg-blue-50 dark:bg-blue-950/20"}
          isActive={activeStep === 1}
          onClick={() => setActiveStep(activeStep === 1 ? null : 1)}
        />
        <div className="flex items-center flex-shrink-0 px-0.5 text-zinc-300 dark:text-zinc-700"><ArrowRight size={14} /></div>
        <PipelineStep
          icon={Brain}
          step="2"
          title="Instruction"
          lines={[modelLabel]}
          accent="text-purple-500 dark:text-purple-400"
          bg={activeStep === 2 ? "bg-purple-100 dark:bg-purple-950/50" : "bg-purple-50 dark:bg-purple-950/20"}
          isActive={activeStep === 2}
          onClick={() => setActiveStep(activeStep === 2 ? null : 2)}
        />
        <div className="flex items-center flex-shrink-0 px-0.5 text-zinc-300 dark:text-zinc-700"><ArrowRight size={14} /></div>
        <PipelineStep
          icon={Send}
          step="3"
          title="Output"
          lines={[postModeLabel]}
          accent="text-teal-500 dark:text-teal-400"
          bg={activeStep === 3 ? "bg-teal-100 dark:bg-teal-950/50" : "bg-teal-50 dark:bg-teal-950/20"}
          isActive={activeStep === 3}
          onClick={() => setActiveStep(activeStep === 3 ? null : 3)}
        />
      </div>

      {/* Step 1: Data */}
      {activeStep === 1 && (
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5 bg-blue-50/50 dark:bg-blue-950/10">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-2">Data sources</div>
          {SOURCE_OPTIONS.map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-3 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={sources[key]}
                onChange={(e) => {
                  const next = { ...sources, [key]: e.target.checked };
                  setSources(next);
                  save({ sources: next });
                }}
                className="mt-0.5 rounded border-zinc-200 dark:border-zinc-800 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <div className="text-sm text-zinc-800 dark:text-zinc-200">{label}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Step 2: Instruction */}
      {activeStep === 2 && (
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3 bg-purple-50/50 dark:bg-purple-950/10">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Model</label>
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); save({ model: e.target.value }); }}
              className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
            >
              {MODEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Personality / instructions</label>
              {systemPrompt && (
                <button onClick={() => { setSystemPrompt(""); save({ system_prompt: null }); }} className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-500">Reset</button>
              )}
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              onBlur={() => save({ system_prompt: systemPrompt || null })}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              rows={12}
              className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-2 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 resize-y"
            />
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Leave empty for default. Saved on blur.</div>
          </div>
        </div>
      )}

      {/* Step 3: Output */}
      {activeStep === 3 && (
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3 bg-teal-50/50 dark:bg-teal-950/10">
          {/* Bot author */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Post as</label>
            <select
              value={botAuthor}
              onChange={(e) => { setBotAuthor(e.target.value); save({ bot_author: e.target.value }); }}
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

          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Threading mode</div>
          <div className="flex gap-2">
            {([
              { value: "new_thread" as const, label: "New thread", desc: "Each run opens its own thread" },
              { value: "same_thread" as const, label: "Same thread", desc: "All runs reply to one ongoing thread" },
            ]).map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => { setPostMode(value); save({ post_mode: value }); }}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-left transition-colors",
                  postMode === value ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-600",
                )}
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thread title</label>
            <input
              type="text"
              value={threadTitle}
              onChange={(e) => setThreadTitle(e.target.value)}
              onBlur={() => save({ thread_title: threadTitle || null })}
              placeholder={postMode === "same_thread" ? DEFAULT_THREAD_TITLE_SAME : DEFAULT_THREAD_TITLE_NEW}
              className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Variables: <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{date}"}</code>{" "}
              <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{time}"}</code>{" "}
              <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{day}"}</code>
            </div>
          </div>

          {postMode === "same_thread" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thread ID</label>
              <div className="flex gap-2">
                <input type="text" value={threadId} onChange={(e) => setThreadId(e.target.value)} onBlur={() => save({ thread_id: threadId })}
                  className="flex-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-zinc-900 dark:text-zinc-100 font-mono" />
                <button onClick={() => { const newId = `dio:${automation.id}:${Date.now()}`; setThreadId(newId); save({ thread_id: newId }); }}
                  className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-200 dark:hover:border-zinc-600 transition-colors">
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schedule */}
      <ScheduleSection
        cron={intervalHoursToCron(automation.interval_hours)}
        onCronChange={(cron) => {
          const hours = cronToIntervalHours(cron);
          if (hours !== null) {
            save({ interval_hours: hours });
          }
          // For non-interval crons (e.g. "0 9 * * 1-5"), store as interval_hours=0 as a fallback
          // In practice users will pick interval presets for DIO automations
        }}
        activeHours={automation.active_hours}
        onActiveHoursChange={(ah) => save({ active_hours: ah })}
      />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Last: {automation.last_run_at ? new Date(automation.last_run_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) : "Never"}
        </span>
        <button
          onClick={() => onRunNow(automation.id)}
          disabled={running}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {running ? "Running..." : "Run now"}
        </button>
      </div>
    </div>
  );
}
