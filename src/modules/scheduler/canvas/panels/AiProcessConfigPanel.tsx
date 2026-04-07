// AI Process (Instruction) config panel — unified

import { useState } from "react";
import { useBots } from "@/hooks/useBotSkills";
import { Select, Textarea } from "@/components/ui";
import type { AiProcessConfig } from "../types";

interface Props {
  config: AiProcessConfig;
  onChange: (config: AiProcessConfig) => void;
}

const MODEL_OPTIONS = [
  { value: "haiku", label: "Haiku (fast, cheap)" },
  { value: "sonnet", label: "Sonnet (balanced)" },
  { value: "opus", label: "Opus (powerful)" },
];

export function AiProcessConfigPanel({ config, onChange }: Props) {
  const { data: bots } = useBots();
  const [additional, setAdditional] = useState(config.additional_instructions ?? "");

  const currentBotName = config.bot_path
    ? config.bot_path.split("/").filter(Boolean).pop()
    : config.bot_author ?? bots?.[0]?.name ?? null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Instruction Settings</h3>

      {bots && bots.length > 0 && (
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Model</label>
        <Select
          value={config.model}
          onChange={(e) => onChange({ ...config, model: e.target.value })}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Instructions</label>
        <Textarea
          value={additional}
          onChange={(e) => setAdditional(e.target.value)}
          onBlur={() => onChange({ ...config, additional_instructions: additional || null })}
          rows={5}
          placeholder="Describe what this automation should do..."
          className="font-mono"
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">The prompt sent to Claude. Saved on blur.</p>
      </div>
    </div>
  );
}
