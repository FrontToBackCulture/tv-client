// Notion Field Mapper — map Work task fields to Notion properties
// Left: Work Task Fields (fixed), Right: Notion property dropdown

import { useState } from "react";
import type {
  NotionPropertySchema,
  FieldMappingEntry,
  WorkTaskField,
} from "../../lib/notion/types";
import { WORK_TASK_FIELDS } from "../../lib/notion/types";
import { useNotionUsers, useNotionDatabasePages } from "../../hooks/useNotion";

interface FieldMapperProps {
  notionProperties: NotionPropertySchema[];
  initialMapping?: Record<string, FieldMappingEntry | string>;
  workStatuses?: { id: string; name: string }[];
  workUsers?: { id: string; name: string }[];
  workCompanies?: { id: string; name: string }[];
  onChange: (mapping: Record<string, FieldMappingEntry | string>) => void;
}

export function NotionFieldMapper({
  notionProperties,
  initialMapping = {},
  workStatuses = [],
  workUsers = [],
  workCompanies = [],
  onChange,
}: FieldMapperProps) {
  const { data: notionUsers = [] } = useNotionUsers();
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

  // For company_id mapped to a relation property, fetch the related database pages
  const companySource = getSource("company_id");
  const companyNotionProp = companySource ? getNotionProp(companySource) : undefined;
  const companyRelationDbId = companyNotionProp?.type === "relation" ? companyNotionProp.relation_database_id ?? null : null;
  const { data: relationPages = [] } = useNotionDatabasePages(companyRelationDbId);

  // Determine if a field needs value mapping
  const needsValueMap = (workField: string, notionPropType: string) => {
    return (
      (workField === "status_id" &&
        (notionPropType === "status" || notionPropType === "select")) ||
      (workField === "priority" && notionPropType === "select") ||
      (workField === "assignee_id" && notionPropType === "people") ||
      (workField === "company_id" &&
        (notionPropType === "select" || notionPropType === "relation" || notionPropType === "rich_text"))
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide px-1">
        <span>Notion Property</span>
        <span></span>
        <span>Work Task Field</span>
      </div>

      {WORK_TASK_FIELDS.map((field) => {
        const source = getSource(field.value);
        const notionProp = source ? getNotionProp(source) : undefined;
        const showValueMap =
          source && notionProp && needsValueMap(field.value, notionProp.type);

        // Build Notion options for value mapping
        const notionOptionsForValueMap = (() => {
          if (!showValueMap || !notionProp) return [];
          // People fields: pull from Notion workspace users
          if (notionProp.type === "people") {
            const fromNotion = notionUsers.map(u => u.name).filter(Boolean);
            const fromExisting = Object.keys(getValueMap(field.value) ?? {});
            const merged = new Set([...fromNotion, ...fromExisting]);
            return Array.from(merged).sort().map(n => ({ name: n }));
          }
          // Relation fields (e.g. company): pull from related database pages
          if (notionProp.type === "relation" && field.value === "company_id" && relationPages.length > 0) {
            const fromRelation = relationPages.map(([_id, title]) => title);
            const fromExisting = Object.keys(getValueMap(field.value) ?? {});
            const merged = new Set([...fromRelation, ...fromExisting]);
            return Array.from(merged).sort().map(n => ({ name: n }));
          }
          return notionProp.options ?? [];
        })();

        return (
          <div key={field.value} className="space-y-1">
            <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
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

              {/* Arrow */}
              <span className="text-zinc-400 text-sm">→</span>

              {/* Work task field (fixed label) */}
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {field.label}
                </span>
              </div>
            </div>

            {/* Value mapping sub-UI */}
            {showValueMap && notionProp && (
              <ValueMapper
                notionOptions={notionOptionsForValueMap}
                workField={field.value}
                workStatuses={workStatuses}
                workUsers={workUsers}
                workCompanies={workCompanies}
                valueMap={getValueMap(field.value) ?? {}}
                onChange={(vm) =>
                  updateMapping(field.value as WorkTaskField, source, vm)
                }
                allowManualEntry={notionProp.type === "people" || (field.value === "company_id" && !notionProp.options?.length)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Fuzzy match score: 0 = no match, higher = better */
function matchScore(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 100;
  if (al.includes(bl) || bl.includes(al)) return 80;
  // Word overlap
  const aWords = new Set(al.split(/[\s\-_]+/).filter(Boolean));
  const bWords = new Set(bl.split(/[\s\-_]+/).filter(Boolean));
  let overlap = 0;
  for (const w of aWords) { if (bWords.has(w)) overlap++; }
  if (overlap > 0) return 40 + (overlap / Math.max(aWords.size, bWords.size)) * 40;
  // First letters match
  if (al[0] === bl[0]) return 10;
  return 0;
}

// Sub-component for mapping individual values (e.g., Notion "Upnext" → Work status UUID)
function ValueMapper({
  notionOptions,
  workField,
  workStatuses,
  workUsers,
  workCompanies = [],
  valueMap,
  onChange,
  allowManualEntry = false,
}: {
  notionOptions: { name: string }[];
  workField: string;
  workStatuses: { id: string; name: string }[];
  workUsers: { id: string; name: string }[];
  workCompanies?: { id: string; name: string }[];
  valueMap: Record<string, string>;
  onChange: (vm: Record<string, string>) => void;
  allowManualEntry?: boolean;
}) {
  const [newNotionName, setNewNotionName] = useState("");

  const options =
    workField === "status_id"
      ? workStatuses
      : workField === "assignee_id"
      ? workUsers
      : workField === "company_id"
      ? workCompanies
      : workField === "priority"
      ? [
          { id: "1", name: "Urgent" },
          { id: "2", name: "High" },
          { id: "3", name: "Medium" },
          { id: "4", name: "Low" },
          { id: "0", name: "None" },
        ]
      : [];

  if (options.length === 0) return null;

  const entries = notionOptions;

  const handleAddEntry = () => {
    const name = newNotionName.trim();
    if (!name || valueMap[name] !== undefined) return;
    onChange({ ...valueMap, [name]: "" });
    setNewNotionName("");
  };

  const unmappedCount = entries.filter(e => !valueMap[e.name]).length;

  const handleAutoMap = () => {
    const next = { ...valueMap };
    const usedIds = new Set(Object.values(next).filter(Boolean));

    for (const entry of entries) {
      if (next[entry.name]) continue; // already mapped
      let bestOption: { id: string; name: string } | null = null;
      let bestScore = 0;
      for (const opt of options) {
        if (usedIds.has(opt.id)) continue; // already used (avoid duplicates for assignee/company)
        const score = matchScore(entry.name, opt.name);
        if (score > bestScore) {
          bestScore = score;
          bestOption = opt;
        }
      }
      if (bestOption && bestScore >= 40) {
        next[entry.name] = bestOption.id;
        // For fields where each value should map to a unique option (company, assignee), mark as used
        if (workField === "company_id" || workField === "assignee_id") {
          usedIds.add(bestOption.id);
        }
      }
    }
    onChange(next);
  };

  return (
    <div className="ml-8 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Value mapping:</span>
        {unmappedCount > 0 && (
          <button
            onClick={handleAutoMap}
            className="text-[10px] font-medium px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
          >
            Auto-map {unmappedCount} unmapped
          </button>
        )}
      </div>
      {entries.map((opt) => (
        <div
          key={opt.name}
          className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center"
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
          {allowManualEntry && (
            <button
              onClick={() => {
                const next = { ...valueMap };
                delete next[opt.name];
                onChange(next);
              }}
              className="text-zinc-400 hover:text-red-500 p-0.5"
              title="Remove"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {allowManualEntry && (
        <div className="flex items-center gap-2 mt-1.5">
          <input
            type="text"
            value={newNotionName}
            onChange={(e) => setNewNotionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddEntry(); }}
            placeholder="Notion person name..."
            className="flex-1 px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
          />
          <button
            onClick={handleAddEntry}
            disabled={!newNotionName.trim()}
            className="px-2 py-1 text-xs font-medium rounded bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 transition-colors"
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
