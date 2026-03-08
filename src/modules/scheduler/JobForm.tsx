import { useState, useMemo } from "react";
import { X, ChevronDown, Puzzle } from "lucide-react";
import type { SchedulerJob, JobInput, SkillRef } from "../../hooks/scheduler";
import { useBots, useBotSkills, type BotSkill } from "../../hooks/useBotSkills";
import { Button, IconButton } from "../../components/ui";
import { FormField, Input, Select, Textarea, CheckboxField } from "../../components/ui";

// Common cron presets
const CRON_PRESETS = [
  { label: "Every morning 9am", value: "0 9 * * *" },
  { label: "Every morning 8am", value: "0 8 * * *" },
  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Custom", value: "" },
];

interface JobFormProps {
  job?: SchedulerJob | null;
  onSubmit: (input: JobInput) => void;
  onClose: () => void;
  isLoading?: boolean;
}

/** Build the full skillPrompt from selected skills + additional instructions */
function buildSkillPrompt(
  skills: BotSkill[],
  additional: string
): string {
  if (skills.length === 0) return additional;
  const lines = skills.map(
    (s) => `Read the skill at ${s.skillPath} and execute the full workflow.`
  );
  let prompt = lines.join("\n");
  if (additional.trim()) prompt += `\n\n${additional.trim()}`;
  prompt += "\n\nOutput the final report in markdown.";
  return prompt;
}

/** Extract additional instructions from a skillPrompt (everything after skill lines) */
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
  // Strip trailing "Output the final report in markdown."
  let text = nonSkillLines.join("\n").trim();
  if (text.endsWith("Output the final report in markdown.")) {
    text = text.slice(0, -"Output the final report in markdown.".length).trim();
  }
  return text;
}

export function JobForm({ job, onSubmit, onClose, isLoading }: JobFormProps) {
  const isEdit = !!job;
  const hasSkillRefs = !!job?.skillRefs && job.skillRefs.length > 0;

  // Form state
  const [name, setName] = useState(job?.name ?? "");
  const [cronExpression, setCronExpression] = useState(job?.cronExpression ?? "0 9 * * 1-5");
  const [model, setModel] = useState(job?.model ?? "sonnet");
  const [maxBudget, setMaxBudget] = useState<string>(job?.maxBudget?.toString() ?? "");
  const [allowedTools, setAllowedTools] = useState(job?.allowedTools?.join(", ") ?? "");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(job?.slackWebhookUrl ?? "");
  const [slackChannelName, setSlackChannelName] = useState(job?.slackChannelName ?? "");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [generateReport, setGenerateReport] = useState(job?.generateReport ?? true);
  const [reportPrefix, setReportPrefix] = useState(job?.reportPrefix ?? "");

  // Skill selection mode vs raw prompt mode
  const [useSkillPicker, setUseSkillPicker] = useState(!isEdit || hasSkillRefs);
  const [rawSkillPrompt, setRawSkillPrompt] = useState(job?.skillPrompt ?? "");

  // Bot & skill state
  const { data: bots } = useBots();
  const defaultBot = useMemo(() => {
    if (hasSkillRefs && bots?.length) {
      return bots.find((b) => b.name === job!.skillRefs![0].bot) ?? bots[0];
    }
    return bots?.[0] ?? null;
  }, [bots, hasSkillRefs, job]);

  const [selectedBotName, setSelectedBotName] = useState<string | null>(
    job?.skillRefs?.[0]?.bot ?? null
  );

  const activeBotName = selectedBotName ?? defaultBot?.name ?? null;
  const activeBot = bots?.find((b) => b.name === activeBotName) ?? null;

  const { data: skills } = useBotSkills(activeBot?.skillsPath ?? null);

  // Selected skill slugs
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(
    () => new Set(job?.skillRefs?.map((r) => r.slug) ?? [])
  );

  // Additional instructions (text beyond skill paths)
  const [additionalInstructions, setAdditionalInstructions] = useState(
    () => hasSkillRefs ? extractAdditionalInstructions(job!.skillPrompt) : ""
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let skillPrompt: string;
    let skillRefs: SkillRef[] | null = null;

    if (useSkillPicker && selectedSkills.length > 0 && activeBotName) {
      skillPrompt = buildSkillPrompt(selectedSkills, additionalInstructions);
      skillRefs = selectedSkills.map((s) => ({
        bot: activeBotName,
        slug: s.slug,
        title: s.title,
      }));
    } else if (useSkillPicker) {
      // Skill picker mode but no skills selected — use additional instructions as prompt
      skillPrompt = additionalInstructions.trim();
    } else {
      skillPrompt = rawSkillPrompt.trim();
    }

    onSubmit({
      name: name.trim(),
      skillPrompt,
      cronExpression: cronExpression.trim(),
      model,
      maxBudget: maxBudget ? parseFloat(maxBudget) : null,
      allowedTools: allowedTools
        ? allowedTools.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      slackWebhookUrl: slackWebhookUrl.trim() || null,
      slackChannelName: slackChannelName.trim() || null,
      enabled,
      generateReport,
      reportPrefix: reportPrefix.trim() || null,
      skillRefs,
      botPath: activeBot?.path ?? job?.botPath ?? null,
    });
  };

  const promptValid = useSkillPicker
    ? selectedSlugs.size > 0 || additionalInstructions.trim().length > 0
    : rawSkillPrompt.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isEdit ? "Edit Job" : "New Scheduled Job"}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <FormField label="Job Name">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Morning SOD Check"
            />
          </FormField>

          {/* Mode toggle */}
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {useSkillPicker ? "Skills" : "Skill / Prompt"}
            </label>
            <button
              type="button"
              onClick={() => {
                if (useSkillPicker) {
                  // Switching to raw — pre-fill with generated prompt
                  if (selectedSkills.length > 0) {
                    setRawSkillPrompt(buildSkillPrompt(selectedSkills, additionalInstructions));
                  }
                }
                setUseSkillPicker(!useSkillPicker);
              }}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              {useSkillPicker ? "Edit full prompt" : "Use skill picker"}
            </button>
          </div>

          {useSkillPicker ? (
            <>
              {/* Bot dropdown */}
              {bots && bots.length > 0 && (
                <FormField label="Bot">
                  <div className="relative">
                    <Select
                      value={activeBotName ?? ""}
                      onChange={(e) => {
                        setSelectedBotName(e.target.value);
                        setSelectedSlugs(new Set());
                      }}
                      className="appearance-none"
                    >
                      {bots.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                </FormField>
              )}

              {/* Selected skills chips */}
              {selectedSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkills.map((s) => (
                    <span
                      key={s.slug}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800"
                    >
                      <Puzzle size={10} />
                      {s.title}
                      <button
                        type="button"
                        onClick={() => toggleSkill(s.slug)}
                        className="ml-0.5 text-teal-400 hover:text-teal-600"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Skill checkboxes */}
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
                          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {skill.title}
                          </span>
                          {skill.category && (
                            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                              {skill.category}
                            </span>
                          )}
                        </div>
                        {skill.summary && (
                          <p className="text-xs text-zinc-400 truncate mt-0.5">
                            {skill.summary}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {skills && skills.length === 0 && (
                <p className="text-xs text-zinc-400">No skills found in this bot</p>
              )}

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
            </>
          ) : (
            /* Raw prompt textarea (legacy / advanced) */
            <div>
              <Textarea
                value={rawSkillPrompt}
                onChange={(e) => setRawSkillPrompt(e.target.value)}
                required
                rows={4}
                placeholder="Run the SOD check for all domains and report any failures..."
                className="font-mono"
              />
            </div>
          )}

          {/* Schedule */}
          <FormField label="Schedule" hint={describeCron(cronExpression)}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => p.value && setCronExpression(p.value)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    cronExpression === p.value
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              required
              placeholder="0 9 * * 1-5"
              className="font-mono"
            />
          </FormField>

          {/* Model */}
          <div className="flex gap-4">
            <FormField label="Model" className="flex-1">
              <Select
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="haiku">Haiku (fast, cheap)</option>
                <option value="sonnet">Sonnet (balanced)</option>
                <option value="opus">Opus (powerful)</option>
              </Select>
            </FormField>
            <FormField label="Max Budget ($)" className="flex-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="No limit"
              />
            </FormField>
          </div>

          {/* Allowed tools */}
          <FormField label="Allowed Tools (comma-separated)">
            <Input
              type="text"
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              placeholder="mcp__val__execute_sql, mcp__val__list_tables"
              className="font-mono"
            />
          </FormField>

          {/* Slack */}
          <div className="flex gap-4">
            <FormField label="Slack Webhook URL" className="flex-1">
              <Input
                type="url"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </FormField>
            <FormField label="Channel Name" className="w-40">
              <Input
                type="text"
                value={slackChannelName}
                onChange={(e) => setSlackChannelName(e.target.value)}
                placeholder="#ops-alerts"
              />
            </FormField>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <CheckboxField
              label="Enabled"
              checked={enabled}
              onChange={setEnabled}
            />
            <CheckboxField
              label="HTML report (Save to S3)"
              checked={generateReport}
              onChange={setGenerateReport}
            />
          </div>

          {/* Report Prefix (shown when generateReport is checked) */}
          {generateReport && (
            <FormField label="Report Prefix" hint={`Report filename: ${reportPrefix.trim() || "sod"}-YYYY-MM-DD.html`}>
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
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !promptValid || !cronExpression.trim() || isLoading}
            loading={isLoading}
          >
            {isEdit ? "Update Job" : "Create Job"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Simple human-readable cron description
function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Cron: ${expr}`;

  const [min, hour, , , dow] = parts;

  const dowMap: Record<string, string> = {
    "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat", "7": "Sun",
    "1-5": "weekdays", "0-6": "every day", "*": "every day",
  };

  let schedule = "";

  if (min.startsWith("*/")) {
    return `Every ${min.slice(2)} minutes`;
  }

  if (hour === "*" && min === "0") {
    schedule = "Every hour";
  } else if (hour !== "*") {
    const h = parseInt(hour);
    const m = parseInt(min) || 0;
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    schedule = `At ${h12}:${m.toString().padStart(2, "0")}${ampm}`;
  } else {
    schedule = `At minute ${min}`;
  }

  if (dow !== "*") {
    schedule += `, ${dowMap[dow] ?? dow}`;
  }

  return schedule;
}
