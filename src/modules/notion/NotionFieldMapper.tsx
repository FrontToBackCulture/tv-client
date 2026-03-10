// Notion Field Mapper — map Work task fields to Notion properties
// Left: Work Task Fields (fixed), Right: Notion property dropdown

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
  // mapping shape: { "work_field": "NotionPropName" | { source: "NotionPropName", value_map: {...} } }
  const [mapping, setMapping] =
    useState<Record<string, FieldMappingEntry | string>>(initialMapping);

  const updateMapping = (
    workField: WorkTaskField,
    notionProp: string,
    valueMap?: Record<string, string>
  ) => {
    const next = { ...mapping };
    if (!notionProp) {
      delete next[workField];
    } else if (valueMap && Object.keys(valueMap).length > 0) {
      next[workField] = { source: notionProp, value_map: valueMap };
    } else {
      next[workField] = notionProp;
    }
    setMapping(next);
    onChange(next);
  };

  const getSource = (workField: string): string => {
    const m = mapping[workField];
    if (!m) return "";
    if (typeof m === "string") return m;
    return (m as any).source ?? "";
  };

  const getValueMap = (
    workField: string
  ): Record<string, string> | undefined => {
    const m = mapping[workField];
    if (!m || typeof m === "string") return undefined;
    return (m as any).value_map as Record<string, string> | undefined;
  };

  // Get the Notion property schema for a given property name
  const getNotionProp = (name: string) =>
    notionProperties.find((p) => p.name === name);

  // Determine if a field needs value mapping
  const needsValueMap = (workField: string, notionPropType: string) => {
    return (
      (workField === "status_id" &&
        (notionPropType === "status" || notionPropType === "select")) ||
      (workField === "priority" && notionPropType === "select") ||
      (workField === "assignee_id" && notionPropType === "people")
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide px-1">
        <span>Work Task Field</span>
        <span></span>
        <span>Notion Property</span>
      </div>

      {WORK_TASK_FIELDS.map((field) => {
        const source = getSource(field.value);
        const notionProp = source ? getNotionProp(source) : undefined;
        const showValueMap =
          source && notionProp && needsValueMap(field.value, notionProp.type);

        return (
          <div key={field.value} className="space-y-1">
            <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
              {/* Work task field (fixed label) */}
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {field.label}
                </span>
              </div>

              {/* Arrow */}
              <span className="text-zinc-400 text-sm">←</span>

              {/* Notion property dropdown */}
              <select
                value={source}
                onChange={(e) =>
                  updateMapping(field.value as WorkTaskField, e.target.value)
                }
                className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">— Skip —</option>
                {notionProperties.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Value mapping sub-UI */}
            {showValueMap && notionProp && (
              <ValueMapper
                notionOptions={notionProp.options ?? []}
                workField={field.value}
                workStatuses={workStatuses}
                workUsers={workUsers}
                valueMap={getValueMap(field.value) ?? {}}
                onChange={(vm) =>
                  updateMapping(field.value as WorkTaskField, source, vm)
                }
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
  workField,
  workStatuses,
  workUsers,
  valueMap,
  onChange,
}: {
  notionOptions: { name: string }[];
  workField: string;
  workStatuses: { id: string; name: string }[];
  workUsers: { id: string; name: string }[];
  valueMap: Record<string, string>;
  onChange: (vm: Record<string, string>) => void;
}) {
  const options =
    workField === "status_id"
      ? workStatuses
      : workField === "assignee_id"
      ? workUsers
      : workField === "priority"
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
