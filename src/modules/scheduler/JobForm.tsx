import { useState } from "react";
import { X } from "lucide-react";
import type { SchedulerJob, JobInput } from "../../hooks/scheduler";

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

export function JobForm({ job, onSubmit, onClose, isLoading }: JobFormProps) {
  const [name, setName] = useState(job?.name ?? "");
  const [skillPrompt, setSkillPrompt] = useState(job?.skillPrompt ?? "");
  const [cronExpression, setCronExpression] = useState(job?.cronExpression ?? "0 9 * * 1-5");
  const [model, setModel] = useState(job?.model ?? "sonnet");
  const [maxBudget, setMaxBudget] = useState<string>(job?.maxBudget?.toString() ?? "");
  const [allowedTools, setAllowedTools] = useState(job?.allowedTools?.join(", ") ?? "");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(job?.slackWebhookUrl ?? "");
  const [slackChannelName, setSlackChannelName] = useState(job?.slackChannelName ?? "");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [generateReport, setGenerateReport] = useState(job?.generateReport ?? true);

  const isEdit = !!job;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      skillPrompt: skillPrompt.trim(),
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
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isEdit ? "Edit Job" : "New Scheduled Job"}
          </h2>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Job Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Morning SOD Check"
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Skill / Prompt</label>
            <textarea
              value={skillPrompt}
              onChange={(e) => setSkillPrompt(e.target.value)}
              required
              rows={4}
              placeholder="Run the SOD check for all domains and report any failures..."
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Schedule</label>
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
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              required
              placeholder="0 9 * * 1-5"
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
            <p className="mt-1 text-xs text-zinc-400">{describeCron(cronExpression)}</p>
          </div>

          {/* Model */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="haiku">Haiku (fast, cheap)</option>
                <option value="sonnet">Sonnet (balanced)</option>
                <option value="opus">Opus (powerful)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Max Budget ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="No limit"
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Allowed tools */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Allowed Tools (comma-separated)</label>
            <input
              type="text"
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              placeholder="mcp__val__execute_sql, mcp__val__list_tables"
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Slack */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Slack Webhook URL</label>
              <input
                type="url"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Channel Name</label>
              <input
                type="text"
                value={slackChannelName}
                onChange={(e) => setSlackChannelName(e.target.value)}
                placeholder="#ops-alerts"
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={generateReport}
                onChange={(e) => setGenerateReport(e.target.checked)}
                className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">HTML report</span>
              <span className="text-[10px] text-zinc-400">Save to S3</span>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !skillPrompt.trim() || !cronExpression.trim() || isLoading}
            className="px-4 py-1.5 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Saving..." : isEdit ? "Update Job" : "Create Job"}
          </button>
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
