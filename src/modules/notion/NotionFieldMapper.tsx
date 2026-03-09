// Notion Field Mapper — map Notion properties to Work task fields

import { useState } from "react";
import type {
  NotionPropertySchema,
  FieldMappingEntry,
  WorkTaskField,
} from "../../lib/notion/types";
import { WORK_TASK_FIELDS } from "../../lib/notion/types";

interface FieldMapperProps {
  notionProperties: NotionPropertySchema[];
  initialMapping?: Record<string, FieldMappingEntry | string>;
  workStatuses?: { id: string; name: string }[];
  workUsers?: { id: string; name: string }[];
  onChange: (mapping: Record<string, FieldMappingEntry | string>) => void;
}

export function NotionFieldMapper({
  notionProperties,
  initialMapping = {},
  workStatuses = [],
  workUsers = [],
  onChange,
}: FieldMapperProps) {
  const [mapping, setMapping] =
    useState<Record<string, FieldMappingEntry | string>>(initialMapping);

  const updateMapping = (
    notionProp: string,
    target: WorkTaskField | "",
    valueMap?: Record<string, string>
  ) => {
    const next = { ...mapping };
    if (!target) {
      delete next[notionProp];
    } else if (valueMap && Object.keys(valueMap).length > 0) {
      next[notionProp] = { target, value_map: valueMap };
    } else {
      next[notionProp] = target;
    }
    setMapping(next);
    onChange(next);
  };

  const getTarget = (notionProp: string): string => {
    const m = mapping[notionProp];
    if (!m) return "";
    if (typeof m === "string") return m;
    return m.target;
  };

  const getValueMap = (
    notionProp: string
  ): Record<string, string> | undefined => {
    const m = mapping[notionProp];
    if (!m || typeof m === "string") return undefined;
    return m.value_map as Record<string, string> | undefined;
  };

  // Determine if a field needs value mapping (status, select → status_id, priority, assignee_id)
  const needsValueMap = (target: string, propType: string) => {
    return (
      (target === "status_id" &&
        (propType === "status" || propType === "select")) ||
      (target === "priority" && propType === "select") ||
      (target === "assignee_id" && propType === "people")
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide px-1">
        <span>Notion Property</span>
        <span></span>
        <span>Work Task Field</span>
      </div>

      {notionProperties.map((prop) => {
        const target = getTarget(prop.name);
        const showValueMap = target && needsValueMap(target, prop.type);

        return (
          <div key={prop.name} className="space-y-1">
            <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
              {/* Notion property */}
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {prop.name}
                </span>
                <span className="text-xs text-zinc-400 shrink-0">
                  {prop.type}
                </span>
              </div>

              {/* Arrow */}
              <span className="text-zinc-400 text-sm">→</span>

              {/* Work field dropdown */}
              <select
                value={target}
                onChange={(e) =>
                  updateMapping(
                    prop.name,
                    e.target.value as WorkTaskField | ""
                  )
                }
                className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">— Skip —</option>
                {WORK_TASK_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Value mapping sub-UI */}
            {showValueMap && (
              <ValueMapper
                notionOptions={prop.options ?? []}
                targetField={target}
                workStatuses={workStatuses}
                workUsers={workUsers}
                valueMap={getValueMap(prop.name) ?? {}}
                onChange={(vm) => updateMapping(prop.name, target as WorkTaskField, vm)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Sub-component for mapping individual values (e.g., Notion "Upnext" → Work status UUID)
function ValueMapper({
  notionOptions,
  targetField,
  workStatuses,
  workUsers,
  valueMap,
  onChange,
}: {
  notionOptions: { name: string }[];
  targetField: string;
  workStatuses: { id: string; name: string }[];
  workUsers: { id: string; name: string }[];
  valueMap: Record<string, string>;
  onChange: (vm: Record<string, string>) => void;
}) {
  const options =
    targetField === "status_id"
      ? workStatuses
      : targetField === "assignee_id"
      ? workUsers
      : targetField === "priority"
      ? [
          { id: "1", name: "Urgent" },
          { id: "2", name: "High" },
          { id: "3", name: "Medium" },
          { id: "4", name: "Low" },
          { id: "0", name: "None" },
        ]
      : [];

  if (notionOptions.length === 0 || options.length === 0) return null;

  return (
    <div className="ml-8 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-1">
      <span className="text-xs text-zinc-400">Value mapping:</span>
      {notionOptions.map((opt) => (
        <div
          key={opt.name}
          className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center"
        >
          <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate px-2">
            {opt.name}
          </span>
          <span className="text-zinc-300 text-xs">→</span>
          <select
            value={valueMap[opt.name] ?? ""}
            onChange={(e) => {
              const next = { ...valueMap };
              if (e.target.value) {
                next[opt.name] = e.target.value;
              } else {
                delete next[opt.name];
              }
              onChange(next);
            }}
            className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          >
            <option value="">— Skip —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
