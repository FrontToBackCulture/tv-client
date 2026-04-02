// Slide-over sheet for creating/editing skill-based automations
// Simplified wrapper over the jobs table — always uses skill picker mode

import { useState, useMemo, useEffect } from "react";
import { X, Puzzle } from "lucide-react";
import type { Job, JobInput, SkillRef } from "../../hooks/scheduler";
import { useBots, useBotSkills, type BotSkill } from "../../hooks/useBotSkills";
import { Button, IconButton } from "../../components/ui";
import { FormField, Input, Select, Textarea, CheckboxField } from "../../components/ui";
import { describeCron } from "../../lib/cron";
import { cn } from "../../lib/cn";

const CRON_PRESETS = [
  { label: "Every morning 9am", value: "0 9 * * *" },
  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
  { label: "Every 2 hours", value: "0 */2 * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "No schedule", value: "" },
];

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

interface SkillAutomationSheetProps {
  job?: Job | null;
  onSubmit: (input: JobInput) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export function SkillAutomationSheet({ job, onSubmit, onClose, isLoading }: SkillAutomationSheetProps) {
  const isEdit = !!job;
  const hasSkillRefs = !!job?.skill_refs && job.skill_refs.length > 0;

  const [name, setName] = useState(job?.name ?? "");
  const [cronExpression, setCronExpression] = useState(job?.cron_expression ?? "0 9 * * 1-5");
  const [model, setModel] = useState(job?.model ?? "sonnet");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(job?.slack_webhook_url ?? "");
  const [slackChannelName, setSlackChannelName] = useState(job?.slack_channel_name ?? "");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [generateReport, setGenerateReport] = useState(job?.generate_report ?? false);
  const [reportPrefix, setReportPrefix] = useState(job?.report_prefix ?? "");
  const [additionalInstructions, setAdditionalInstructions] = useState(
    () => hasSkillRefs ? extractAdditionalInstructions(job!.skill_prompt) : ""
  );

  // Bot & skill state
  const { data: bots } = useBots();
  const defaultBot = useMemo(() => {
    if (hasSkillRefs && bots?.length) {
      return bots.find((b) => b.name === job!.skill_refs![0].bot) ?? bots[0];
    }
    return bots?.[0] ?? null;
  }, [bots, hasSkillRefs, job]);

  const [selectedBotName, setSelectedBotName] = useState<string | null>(
    job?.skill_refs?.[0]?.bot ?? null
  );

  const activeBotName = selectedBotName ?? defaultBot?.name ?? null;
  const activeBot = bots?.find((b) => b.name === activeBotName) ?? null;
  const { data: skills } = useBotSkills(activeBot?.skillsPath ?? null);

  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(
    () => new Set(job?.skill_refs?.map((r) => r.slug) ?? [])
  );

  const selectedSkills = useMemo(
    () => skills?.filter((s) => selectedSlugs.has(s.slug)) ?? [],
    [skills, selectedSlugs]
  );

  const toggleSkill = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // Animation
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleClose = () => {
    setMounted(false);
    setTimeout(onClose, 200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let skillPrompt: string;
    let skillRefs: SkillRef[] | null = null;

    if (selectedSkills.length > 0 && activeBotName) {
      skillPrompt = buildSkillPrompt(selectedSkills, additionalInstructions);
      skillRefs = selectedSkills.map((s) => ({
        bot: activeBotName,
        slug: s.slug,
        title: s.title,
      }));
    } else {
      skillPrompt = additionalInstructions.trim();
    }

    onSubmit({
      name: name.trim(),
      skill_prompt: skillPrompt,
      cron_expression: cronExpression.trim() || null,
      model,
      allowed_tools: [],
      slack_webhook_url: slackWebhookUrl.trim() || null,
      slack_channel_name: slackChannelName.trim() || null,
      enabled,
      generate_report: generateReport,
      report_prefix: reportPrefix.trim() || null,
      skill_refs: skillRefs,
      bot_path: activeBot?.path ?? job?.bot_path ?? null,
    });
  };

  const promptValid = selectedSlugs.size > 0 || additionalInstructions.trim().length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/20 z-40 transition-opacity duration-200",
          mounted ? "opacity-100" : "opacity-0",
        )}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-out",
          mounted ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isEdit ? "Edit Automation" : "New Skill Automation"}
          </h2>
          <IconButton icon={X} label="Close" onClick={handleClose} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name */}
          <FormField label="Name">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Morning SOD Check"
            />
          </FormField>

          {/* Bot selector */}
          {bots && bots.length > 0 && (
            <FormField label="Bot">
              <div className="relative">
                <Select
                  value={activeBotName ?? ""}
                  onChange={(e) => {
                    setSelectedBotName(e.target.value);
                    setSelectedSlugs(new Set());
                  }}
                >
                  {bots.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </Select>
              </div>
            </FormField>
          )}

          {/* Skills */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Skills</label>

            {selectedSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedSkills.map((s) => (
                  <span
                    key={s.slug}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800"
                  >
                    <Puzzle size={10} />
                    {s.title}
                    <button type="button" onClick={() => toggleSkill(s.slug)} className="ml-0.5 text-teal-400 hover:text-teal-600">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {skills && skills.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
                {skills.map((skill) => (
                  <label
                    key={skill.slug}
                    className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSlugs.has(skill.slug)}
                      onChange={() => toggleSkill(skill.slug)}
                      className="mt-0.5 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{skill.title}</span>
                        {skill.category && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                            {skill.category}
                          </span>
                        )}
                      </div>
                      {skill.summary && (
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{skill.summary}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {skills && skills.length === 0 && (
              <p className="text-xs text-zinc-400">No skills found in this bot</p>
            )}
          </div>

          {/* Additional instructions */}
          <FormField label="Additional Instructions">
            <Textarea
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              rows={2}
              placeholder="Focus on KOI domain only..."
              className="font-mono"
            />
          </FormField>

          {/* Schedule */}
          <FormField label="Schedule" hint={cronExpression ? describeCron(cronExpression) : "Manual only — no schedule"}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setCronExpression(p.value)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-md border transition-colors",
                    cronExpression === p.value
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 9 * * 1-5"
              className="font-mono"
            />
          </FormField>

          {/* Model */}
          <FormField label="Model">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="haiku">Haiku (fast, cheap)</option>
              <option value="sonnet">Sonnet (balanced)</option>
              <option value="opus">Opus (powerful)</option>
            </Select>
          </FormField>

          {/* Slack */}
          <FormField label="Slack Webhook URL">
            <Input
              type="url"
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
          </FormField>

          {slackWebhookUrl && (
            <FormField label="Channel Name">
              <Input
                type="text"
                value={slackChannelName}
                onChange={(e) => setSlackChannelName(e.target.value)}
                placeholder="#ops-alerts"
              />
            </FormField>
          )}

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <CheckboxField label="Enabled" checked={enabled} onChange={setEnabled} />
            <CheckboxField label="Generate HTML report" checked={generateReport} onChange={setGenerateReport} />
          </div>

          {generateReport && (
            <FormField label="Report Prefix" hint={`Filename: ${reportPrefix.trim() || "report"}-YYYY-MM-DD.html`}>
              <Input
                type="text"
                value={reportPrefix}
                onChange={(e) => setReportPrefix(e.target.value)}
                placeholder="sod"
                className="font-mono"
              />
            </FormField>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <Button variant="ghost" onClick={handleClose} type="button">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !promptValid || isLoading}
            loading={isLoading}
          >
            {isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </>
  );
}
