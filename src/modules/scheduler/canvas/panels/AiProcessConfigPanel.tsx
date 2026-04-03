// AI Process (Instruction) config panel

import { useState } from "react";
import { useBots } from "@/hooks/useBotSkills";
import { MODEL_OPTIONS, DEFAULT_SYSTEM_PROMPT } from "@/hooks/chat/useTaskAdvisor";
import { Select, Textarea } from "@/components/ui";
import type { AutomationType, AiProcessConfig } from "../types";

interface Props {
  config: AiProcessConfig;
  automationType: AutomationType;
  onChange: (config: AiProcessConfig) => void;
}

// Skill automations use short model names; DIO uses full model IDs
const SKILL_MODEL_OPTIONS = [
  { value: "haiku", label: "Haiku (fast, cheap)" },
  { value: "sonnet", label: "Sonnet (balanced)" },
  { value: "opus", label: "Opus (powerful)" },
];

export function AiProcessConfigPanel({ config, automationType, onChange }: Props) {
  const { data: bots } = useBots();
  const isDio = automationType === "dio";
  const modelOptions = isDio ? MODEL_OPTIONS : SKILL_MODEL_OPTIONS;

  const [systemPrompt, setSystemPrompt] = useState(config.system_prompt ?? "");
  const [additional, setAdditional] = useState(config.additional_instructions ?? "");

  const currentBotName = config.bot_path
    ? config.bot_path.split("/").filter(Boolean).pop()
    : config.bot_author ?? bots?.[0]?.name ?? null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Instruction Settings</h3>

      {/* Bot selector (skill automations use bot_path for CLAUDE.md context) */}
      {!isDio && bots && bots.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Bot context</label>
          <Select
            value={currentBotName ?? ""}
            onChange={(e) => {
              const bot = bots.find((b) => b.name === e.target.value);
              onChange({ ...config, bot_path: bot?.path ?? null });
            }}
          >
            {bots.map((b) => {
              const folderName = b.path.split("/").filter(Boolean).pop() || `bot-${b.name}`;
              return <option key={b.name} value={b.name}>{folderName}</option>;
            })}
          </Select>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Runs under this bot's CLAUDE.md identity and settings
          </p>
        </div>
      )}

      {/* Model */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Model</label>
        <Select
          value={config.model}
          onChange={(e) => onChange({ ...config, model: e.target.value })}
        >
          {modelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>

      {/* System prompt (DIO) or Additional instructions (Skill) */}
      {isDio ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Personality / instructions</label>
            {systemPrompt && (
              <button
                onClick={() => { setSystemPrompt(""); onChange({ ...config, system_prompt: null }); }}
                className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-500"
              >
                Reset
              </button>
            )}
          </div>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={() => onChange({ ...config, system_prompt: systemPrompt || null })}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            rows={10}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Leave empty for default. Saved on blur.</p>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Additional instructions</label>
          <Textarea
            value={additional}
            onChange={(e) => setAdditional(e.target.value)}
            onBlur={() => onChange({ ...config, additional_instructions: additional || null })}
            rows={3}
            placeholder="Focus on KOI domain only..."
            className="font-mono"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Appended after skill prompts. Saved on blur.</p>
        </div>
      )}
    </div>
  );
}
