// Config panel for Action nodes — configure operation, target table, source query, and field mapping

import { useState, useEffect } from "react";
import type { ActionConfig, NodeConfig } from "../types";

interface Props {
  config: ActionConfig;
  onChange: (config: NodeConfig) => void;
}

const OPERATIONS = [
  { value: "insert", label: "Add Records" },
  { value: "update", label: "Update Records" },
  { value: "upsert", label: "Add / Update" },
  { value: "delete", label: "Delete Records" },
] as const;

export function ActionConfigPanel({ config, onChange }: Props) {
  const [localQuery, setLocalQuery] = useState(config.source_query ?? "");
  const [localMapping, setLocalMapping] = useState(
    config.field_mapping ? JSON.stringify(config.field_mapping, null, 2) : ""
  );
  const [localStatic, setLocalStatic] = useState(
    config.static_values ? JSON.stringify(config.static_values, null, 2) : ""
  );

  // Sync local state when config changes externally
  useEffect(() => {
    setLocalQuery(config.source_query ?? "");
    setLocalMapping(config.field_mapping ? JSON.stringify(config.field_mapping, null, 2) : "");
    setLocalStatic(config.static_values ? JSON.stringify(config.static_values, null, 2) : "");
  }, [config.source_query, config.field_mapping, config.static_values]);

  function update(patch: Partial<ActionConfig>) {
    onChange({ ...config, ...patch });
  }

  function handleQueryBlur() {
    update({ source_query: localQuery || null });
  }

  function handleMappingBlur() {
    try {
      const parsed = localMapping.trim() ? JSON.parse(localMapping) : null;
      update({ field_mapping: parsed });
    } catch {
      // Invalid JSON — don't save
    }
  }

  function handleStaticBlur() {
    try {
      const parsed = localStatic.trim() ? JSON.parse(localStatic) : null;
      update({ static_values: parsed });
    } catch {
      // Invalid JSON — don't save
    }
  }

  return (
    <div className="space-y-5">
      {/* Operation */}
      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Operation
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {OPERATIONS.map((op) => (
            <button
              key={op.value}
              onClick={() => update({ operation: op.value })}
              className={`px-2 py-1.5 rounded-md text-xs border transition-colors ${
                config.operation === op.value
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300"
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Table */}
      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Target Schema
        </label>
        <input
          type="text"
          value={config.target_schema ?? "public"}
          onChange={(e) => update({ target_schema: e.target.value })}
          placeholder="public"
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Target Table
        </label>
        <input
          type="text"
          value={config.target_table ?? ""}
          onChange={(e) => update({ target_table: e.target.value })}
          placeholder="e.g. crm_companies"
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none"
        />
      </div>

      {/* Match Key (for update/upsert/delete) */}
      {config.operation !== "insert" && (
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
            Match Key
          </label>
          <input
            type="text"
            value={config.match_key ?? ""}
            onChange={(e) => update({ match_key: e.target.value || null })}
            placeholder="e.g. id, uen"
            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none"
          />
          <p className="text-[10px] text-zinc-400 mt-1">Column to match source rows to target rows</p>
        </div>
      )}

      {/* Source Query */}
      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Source Query
        </label>
        <textarea
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onBlur={handleQueryBlur}
          rows={6}
          placeholder="SELECT ... FROM ... WHERE ..."
          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none resize-y"
        />
        <p className="text-[10px] text-zinc-400 mt-1">SQL query that returns the data to write</p>
      </div>

      {/* Field Mapping */}
      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Field Mapping (JSON)
        </label>
        <textarea
          value={localMapping}
          onChange={(e) => setLocalMapping(e.target.value)}
          onBlur={handleMappingBlur}
          rows={4}
          placeholder={'{\n  "source_col": "target_col"\n}'}
          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none resize-y"
        />
        <p className="text-[10px] text-zinc-400 mt-1">Maps source query columns to target table columns</p>
      </div>

      {/* Static Values */}
      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Static Values (JSON)
        </label>
        <textarea
          value={localStatic}
          onChange={(e) => setLocalStatic(e.target.value)}
          onBlur={handleStaticBlur}
          rows={3}
          placeholder={'{\n  "updated_at": "now()"\n}'}
          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none resize-y"
        />
        <p className="text-[10px] text-zinc-400 mt-1">Hardcoded values applied to every row</p>
      </div>
    </div>
  );
}
