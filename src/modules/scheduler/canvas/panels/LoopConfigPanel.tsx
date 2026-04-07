// Config panel for Loop nodes — configure iteration mode and item variable name

import type { LoopConfig, NodeConfig } from "../types";

interface Props {
  config: LoopConfig;
  onChange: (config: NodeConfig) => void;
}

export function LoopConfigPanel({ config, onChange }: Props) {
  function update(patch: Partial<LoopConfig>) {
    onChange({ ...config, ...patch });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Loop Settings</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Iterates over records from the upstream data source node and runs downstream nodes once per record.
        </p>
      </div>

      {/* Item variable name */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Item variable name
        </label>
        <input
          type="text"
          value={config.item_variable ?? "item"}
          onChange={(e) => update({ item_variable: e.target.value })}
          placeholder="e.g. company"
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Used in downstream prompt as <code className="font-mono text-emerald-600 dark:text-emerald-400">{`{${config.item_variable || "item"}}`}</code> — each iteration receives one record as JSON.
        </p>
      </div>

      {/* Execution mode */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Execution mode
        </label>
        <select
          value={config.mode ?? "sequential"}
          onChange={(e) => update({ mode: e.target.value as "sequential" })}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
        >
          <option value="sequential">Sequential (one at a time)</option>
        </select>
      </div>
    </div>
  );
}
