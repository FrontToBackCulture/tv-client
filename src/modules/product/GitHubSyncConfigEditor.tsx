// GitHubSyncConfigEditor — edit repos, mappings, and rules inline
// Operates on a draft copy; parent controls save/discard

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import type {
  GitHubSyncConfig,
  RepoConfig,
  Mapping,
  Rule,
  RuleCondition,
} from "../../hooks/github-sync";

// ============================================================================
// Props
// ============================================================================

interface Props {
  config: GitHubSyncConfig;
  onSave: (config: GitHubSyncConfig) => void;
  onDiscard: () => void;
  isSaving: boolean;
}

// ============================================================================
// Top-level editor
// ============================================================================

export function GitHubSyncConfigEditor({
  config,
  onSave,
  onDiscard,
  isSaving,
}: Props) {
  const [draft, setDraft] = useState<GitHubSyncConfig>(() =>
    structuredClone(config)
  );

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);

  const updateRepo = useCallback((idx: number, repo: RepoConfig) => {
    setDraft((d) => {
      const next = structuredClone(d);
      next.repositories[idx] = repo;
      return next;
    });
  }, []);

  const removeRepo = useCallback((idx: number) => {
    setDraft((d) => {
      const next = structuredClone(d);
      next.repositories.splice(idx, 1);
      return next;
    });
  }, []);

  const addRepo = () => {
    setDraft((d) => ({
      repositories: [
        ...d.repositories,
        {
          owner: "",
          repo: "",
          branch: "main",
          mappings: [],
          rules: [],
        },
      ],
    }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Config Editor
        </h3>
        <div className="flex items-center gap-2">
          <Button
            onClick={onDiscard}
            disabled={isSaving}
            variant="secondary"
          >
            Discard
          </Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={!isDirty}
            loading={isSaving}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Repos */}
      {draft.repositories.map((repo, i) => (
        <RepoSection
          key={i}
          repo={repo}
          onChange={(r) => updateRepo(i, r)}
          onRemove={() => removeRepo(i)}
        />
      ))}

      <Button
        onClick={addRepo}
        variant="secondary"
        icon={Plus}
        className="border-dashed"
      >
        Add Repository
      </Button>
    </div>
  );
}

// ============================================================================
// RepoSection
// ============================================================================

function RepoSection({
  repo,
  onChange,
  onRemove,
}: {
  repo: RepoConfig;
  onChange: (r: RepoConfig) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const update = <K extends keyof RepoConfig>(
    key: K,
    value: RepoConfig[K]
  ) => {
    onChange({ ...repo, [key]: value });
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Repo header */}
      <div className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <input
          className="w-32 px-2 py-1 text-sm font-medium bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-teal-500/30 outline-none text-zinc-900 dark:text-zinc-100"
          value={repo.owner}
          onChange={(e) => update("owner", e.target.value)}
          placeholder="owner"
        />
        <span className="text-zinc-400">/</span>
        <input
          className="w-40 px-2 py-1 text-sm font-medium bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-teal-500/30 outline-none text-zinc-900 dark:text-zinc-100"
          value={repo.repo}
          onChange={(e) => update("repo", e.target.value)}
          placeholder="repo"
        />
        <span className="text-xs text-zinc-500">(</span>
        <input
          className="w-20 px-2 py-1 text-xs bg-transparent border-b border-zinc-200 dark:border-zinc-800 focus:ring-2 focus:ring-teal-500/30 outline-none text-zinc-500"
          value={repo.branch}
          onChange={(e) => update("branch", e.target.value)}
          placeholder="branch"
        />
        <span className="text-xs text-zinc-500">)</span>
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">
          {repo.mappings.length} mappings, {repo.rules.length} rules
        </span>
        <IconButton
          onClick={onRemove}
          icon={Trash2}
          variant="danger"
          label="Remove repository"
          size={14}
        />
      </div>

      {expanded && (
        <div className="p-3 space-y-4">
          <MappingsSection
            mappings={repo.mappings}
            onChange={(m) => update("mappings", m)}
          />
          <RulesSection
            rules={repo.rules}
            onChange={(r) => update("rules", r)}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MappingsSection
// ============================================================================

function MappingsSection({
  mappings,
  onChange,
}: {
  mappings: Mapping[];
  onChange: (m: Mapping[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const updateMapping = (idx: number, m: Mapping) => {
    const next = [...mappings];
    next[idx] = m;
    onChange(next);
  };

  const removeMapping = (idx: number) => {
    onChange(mappings.filter((_, i) => i !== idx));
  };

  const addMapping = () => {
    onChange([
      ...mappings,
      {
        name: "",
        githubPath: "",
        knowledgePath: "",
        includeContent: true,
      },
    ]);
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Mappings ({mappings.length})
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-4">
          {mappings.map((m, i) => (
            <MappingRow
              key={i}
              mapping={m}
              onChange={(updated) => updateMapping(i, updated)}
              onRemove={() => removeMapping(i)}
            />
          ))}
          <button
            onClick={addMapping}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <Plus size={12} />
            Add Mapping
          </button>
        </div>
      )}
    </div>
  );
}

function MappingRow({
  mapping,
  onChange,
  onRemove,
}: {
  mapping: Mapping;
  onChange: (m: Mapping) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const update = <K extends keyof Mapping>(key: K, value: Mapping[K]) => {
    onChange({ ...mapping, [key]: value });
  };

  const githubPaths = Array.isArray(mapping.githubPath)
    ? mapping.githubPath
    : [mapping.githubPath];

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md">
      {/* Collapsed view */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown size={12} className="text-zinc-400" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400" />
        )}
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {mapping.name || "(unnamed)"}
        </span>
        <span className="text-xs text-zinc-400 truncate flex-1">
          {githubPaths[0]}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-zinc-400 hover:text-red-500"
        >
          <X size={12} />
        </button>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-100 dark:border-zinc-800">
          <FieldRow label="Name">
            <input
              className="w-full text-xs px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100"
              value={mapping.name || ""}
              onChange={(e) => update("name", e.target.value || undefined)}
            />
          </FieldRow>
          <FieldRow label="GitHub Path">
            <ChipInput
              values={githubPaths}
              onChange={(v) =>
                update("githubPath", v.length === 1 ? v[0] : v)
              }
            />
          </FieldRow>
          <FieldRow label="Knowledge Path">
            <input
              className="w-full text-xs px-2 py-1 font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100"
              value={mapping.knowledgePath}
              onChange={(e) => update("knowledgePath", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="File Types">
            <ChipInput
              values={mapping.fileTypes || []}
              onChange={(v) => update("fileTypes", v.length ? v : undefined)}
            />
          </FieldRow>
          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={mapping.includeContent ?? true}
                onChange={(e) => update("includeContent", e.target.checked)}
                className="rounded"
              />
              Include Content
            </label>
            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={mapping.flattenStructure ?? false}
                onChange={(e) => update("flattenStructure", e.target.checked)}
                className="rounded"
              />
              Flatten
            </label>
            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={mapping.isScopeOnly ?? false}
                onChange={(e) => update("isScopeOnly", e.target.checked)}
                className="rounded"
              />
              Scope Only
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RulesSection
// ============================================================================

function RulesSection({
  rules,
  onChange,
}: {
  rules: Rule[];
  onChange: (r: Rule[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const [newRuleIdx, setNewRuleIdx] = useState<number | null>(null);

  const updateRule = (idx: number, r: Rule) => {
    const next = [...rules];
    next[idx] = r;
    onChange(next);
  };

  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
    if (newRuleIdx === idx) setNewRuleIdx(null);
  };

  const addRule = () => {
    // Detect common pattern from existing rules to pre-fill sensibly
    let basePath = "";
    let templateCondition: RuleCondition = {};

    if (rules.length > 0) {
      // Base path: common prefix of existing targetPaths
      const firstPath = rules[0].targetPath;
      const lastSlash = firstPath.lastIndexOf("/");
      if (lastSlash > 0) {
        basePath = firstPath.slice(0, lastSlash + 1);
      }

      // Detect dominant condition pattern (e.g. folderContains + folderExcludes: test)
      const hasFolderExcludes = rules.filter(
        (r) => r.condition.folderExcludes
      ).length;
      if (hasFolderExcludes > rules.length / 2) {
        templateCondition.folderExcludes = "test";
      }

      // If most rules use folderContains, pre-fill that pattern
      const hasFolderContains = rules.filter(
        (r) => r.condition.folderContains
      ).length;
      const hasFolderEquals = rules.filter(
        (r) => r.condition.folderEquals
      ).length;

      if (hasFolderContains > hasFolderEquals) {
        templateCondition.folderContains = "";
      } else {
        templateCondition.folderEquals = "";
      }
    }

    const idx = rules.length;
    setNewRuleIdx(idx);
    onChange([
      ...rules,
      {
        name: "New connector",
        condition: templateCondition,
        targetPath: basePath,
        includeContent: true,
      },
    ]);
  };

  const lowerFilter = filter.toLowerCase();
  const filteredIndices = rules
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        !filter ||
        (r.name || "").toLowerCase().includes(lowerFilter) ||
        r.targetPath.toLowerCase().includes(lowerFilter) ||
        conditionToString(r.condition).toLowerCase().includes(lowerFilter)
    )
    .map(({ i }) => i);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Rules ({rules.length})
        </span>
        <input
          className="flex-1 text-xs px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100"
          placeholder="Filter rules by name, condition, or path..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          onClick={addRule}
          variant="secondary"
          icon={Plus}
        >
          Add Rule
        </Button>
      </div>

      <div className="space-y-0.5 max-h-[600px] overflow-auto">
        {filteredIndices.map((idx) => (
          <RuleRow
            key={idx}
            rule={rules[idx]}
            onChange={(r) => updateRule(idx, r)}
            onRemove={() => removeRule(idx)}
            defaultExpanded={idx === newRuleIdx}
          />
        ))}
      </div>

      {filter && filteredIndices.length === 0 && (
        <p className="text-xs text-zinc-400 py-2 pl-2">
          No rules match "{filter}"
        </p>
      )}
    </div>
  );
}

// ============================================================================
// RuleRow
// ============================================================================

function RuleRow({
  rule,
  onChange,
  onRemove,
  defaultExpanded = false,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onRemove: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const update = <K extends keyof Rule>(key: K, value: Rule[K]) => {
    onChange({ ...rule, [key]: value });
  };

  const updateCondition = <K extends keyof RuleCondition>(
    key: K,
    value: RuleCondition[K]
  ) => {
    onChange({ ...rule, condition: { ...rule.condition, [key]: value } });
  };

  const condStr = conditionToString(rule.condition);
  const shortTarget = rule.targetPath.split("/").slice(-2).join("/");

  return (
    <div className="border border-zinc-100 dark:border-zinc-800 rounded">
      {/* Collapsed: single scannable line */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/30 group"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown size={12} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400 flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 w-44 truncate flex-shrink-0">
          {rule.name || "(unnamed)"}
        </span>
        <span className="text-xs text-zinc-400 truncate flex-shrink-0 w-40">
          {condStr}
        </span>
        <span className="text-xs text-zinc-400 mx-1 flex-shrink-0">
          &rarr;
        </span>
        <span className="text-xs font-mono text-zinc-500 truncate flex-1">
          {shortTarget}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          <X size={12} />
        </button>
      </div>

      {/* Expanded: inline form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-zinc-100 dark:border-zinc-800">
          <FieldRow label="Name">
            <input
              className="w-full text-xs px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100"
              value={rule.name || ""}
              onChange={(e) => update("name", e.target.value || undefined)}
            />
          </FieldRow>

          {/* Condition fields */}
          <ConditionField
            label="folderEquals"
            value={rule.condition.folderEquals}
            onChange={(v) => updateCondition("folderEquals", v)}
          />
          <ConditionField
            label="folderContains"
            value={rule.condition.folderContains}
            onChange={(v) => updateCondition("folderContains", v)}
            mode={rule.condition.folderContainsMode}
            onModeChange={(m) => updateCondition("folderContainsMode", m)}
          />
          <ConditionField
            label="folderExcludes"
            value={rule.condition.folderExcludes}
            onChange={(v) => updateCondition("folderExcludes", v)}
            mode={rule.condition.folderExcludesMode}
            onModeChange={(m) => updateCondition("folderExcludesMode", m)}
          />
          <ConditionField
            label="filenameContains"
            value={rule.condition.filenameContains}
            onChange={(v) => updateCondition("filenameContains", v)}
            mode={rule.condition.filenameContainsMode}
            onModeChange={(m) => updateCondition("filenameContainsMode", m)}
          />
          <FieldRow label="pathMatches">
            <input
              className="w-full text-xs px-2 py-1 font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100"
              value={rule.condition.pathMatches || ""}
              onChange={(e) =>
                updateCondition(
                  "pathMatches",
                  e.target.value || undefined
                )
              }
              placeholder="regex pattern"
            />
          </FieldRow>

          <FieldRow label="Target Path">
            <input
              className="w-full text-xs px-2 py-1 font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100"
              value={rule.targetPath}
              onChange={(e) => update("targetPath", e.target.value)}
            />
          </FieldRow>

          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={rule.includeContent ?? true}
                onChange={(e) => update("includeContent", e.target.checked)}
                className="rounded"
              />
              Include Content
            </label>
            <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={rule.flattenStructure ?? false}
                onChange={(e) => update("flattenStructure", e.target.checked)}
                className="rounded"
              />
              Flatten
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ConditionField — reusable string|string[] condition with optional mode
// ============================================================================

function ConditionField({
  label,
  value,
  onChange,
  mode,
  onModeChange,
}: {
  label: string;
  value: string | string[] | undefined;
  onChange: (v: string | string[] | undefined) => void;
  mode?: string;
  onModeChange?: (m: string | undefined) => void;
}) {
  const values = value
    ? Array.isArray(value)
      ? value
      : [value]
    : [];
  const showMode = onModeChange && values.length > 1;

  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ChipInput
            values={values}
            onChange={(v) => {
              if (v.length === 0) onChange(undefined);
              else if (v.length === 1) onChange(v[0]);
              else onChange(v);
            }}
          />
        </div>
        {showMode && (
          <select
            className="text-xs px-1 py-0.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-400"
            value={mode || "any"}
            onChange={(e) =>
              onModeChange(
                e.target.value === "any" ? undefined : e.target.value
              )
            }
          >
            <option value="any">any</option>
            <option value="all">all</option>
          </select>
        )}
      </div>
    </FieldRow>
  );
}

// ============================================================================
// ChipInput — tag-style input for string arrays
// ============================================================================

function ChipInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addValue = (raw: string) => {
    const v = raw.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addValue(input);
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded min-h-[26px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded"
        >
          {v}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(values.filter((_, j) => j !== i));
            }}
            className="hover:text-red-500"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="flex-1 min-w-[60px] text-xs bg-transparent outline-none text-zinc-900 dark:text-zinc-100"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (input.trim()) addValue(input);
        }}
        placeholder={values.length === 0 ? "Type + Enter" : ""}
      />
    </div>
  );
}

// ============================================================================
// Shared helpers
// ============================================================================

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 mt-1.5">
      <span className="text-xs text-zinc-500 w-28 flex-shrink-0 pt-1 text-right">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function conditionToString(c: RuleCondition): string {
  const parts: string[] = [];
  if (c.folderEquals) {
    const v = Array.isArray(c.folderEquals) ? c.folderEquals : [c.folderEquals];
    parts.push(`folderEquals: ${v.join(", ")}`);
  }
  if (c.folderContains) {
    const v = Array.isArray(c.folderContains)
      ? c.folderContains
      : [c.folderContains];
    parts.push(`folderContains: ${v.join(", ")}`);
  }
  if (c.folderExcludes) {
    const v = Array.isArray(c.folderExcludes)
      ? c.folderExcludes
      : [c.folderExcludes];
    parts.push(`!${v.join(", ")}`);
  }
  if (c.filenameContains) {
    const v = Array.isArray(c.filenameContains)
      ? c.filenameContains
      : [c.filenameContains];
    parts.push(`filename: ${v.join(", ")}`);
  }
  if (c.pathMatches) parts.push(`path: ${c.pathMatches}`);
  return parts.join(" | ") || "(no condition)";
}
