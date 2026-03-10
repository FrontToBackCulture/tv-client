// src/modules/skills/PromptBuilder.tsx
// Prompt Builder: select skill → pick template → fill variables → copy prompt.
// Supports date range presets, single date presets, domain auto-fill, and saving configs.

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Copy,
  Check,
  Save,
  Loader2,
  FileText,
  ChevronRight,
  Calendar,
  Zap,
  FolderOpen,
  History,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { useRepository } from "../../stores/repositoryStore";
import { useDiscoverDomains } from "../../hooks/val-sync";
import { toast } from "../../stores/toastStore";
import type { SkillRegistry } from "./useSkillRegistry";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PromptTemplate {
  name: string;
  filename: string;
  path: string;
  content: string;
  promptBlock: string;
  title: string;
  summary: string;
  variables: TemplateVariable[];
}

interface TemplateVariable {
  raw: string;
  key: string;
  label: string;
  type: "text" | "domain" | "date" | "path";
}

// A processed field: either a simple var, a date range (pair), or a single date
type ProcessedField =
  | { kind: "simple"; variable: TemplateVariable }
  | { kind: "date-range"; id: string; label: string; startVar: TemplateVariable; endVar: TemplateVariable; guessedPreset?: string }
  | { kind: "date-single"; variable: TemplateVariable; guessedPreset?: string };

interface SavedConfig {
  skill: string;
  template: string;
  domain: string;
  values: Record<string, string>;
  dateSelections: Record<string, string>; // field key → preset key or "custom"
  saved_at: string;
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  // Use local date parts to avoid UTC timezone shift
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Range presets — single selection fills both start and end
// All ranges are inclusive on both ends and use full completed months only.
// "Last N months" = N full months ending at last day of previous month.
// E.g. on 2026-03-11, "Last 3 months" = 2025-12-01 → 2026-02-28.
const RANGE_PRESETS: Record<string, { label: string; resolveStart: () => string; resolveEnd: () => string }> = {
  last_3m: {
    label: "Last 3 full months",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth() - 3, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth(), 0)); },
  },
  last_6m: {
    label: "Last 6 full months",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth() - 6, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth(), 0)); },
  },
  last_12m: {
    label: "Last 12 full months",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth() - 12, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth(), 0)); },
  },
  same_period_prior_year_3m: {
    label: "Same 3 months, prior year",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear() - 1, d.getMonth() - 3, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear() - 1, d.getMonth(), 0)); },
  },
  same_period_prior_year_6m: {
    label: "Same 6 months, prior year",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear() - 1, d.getMonth() - 6, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear() - 1, d.getMonth(), 0)); },
  },
  same_period_prior_year_12m: {
    label: "Same 12 months, prior year",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear() - 1, d.getMonth() - 12, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear() - 1, d.getMonth(), 0)); },
  },
  last_month: {
    label: "Last month",
    resolveStart: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)); },
    resolveEnd: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth(), 0)); },
  },
  last_quarter: {
    label: "Last full quarter",
    resolveStart: () => {
      const d = new Date();
      const curQ = Math.floor(d.getMonth() / 3); // 0-indexed quarter (0=Q1, 1=Q2...)
      const prevQStart = (curQ - 1) * 3; // prev quarter start month (0-indexed)
      return fmtDate(new Date(d.getFullYear(), prevQStart, 1));
    },
    resolveEnd: () => {
      const d = new Date();
      const curQ = Math.floor(d.getMonth() / 3);
      const prevQEnd = curQ * 3; // first month after prev quarter
      return fmtDate(new Date(d.getFullYear(), prevQEnd, 0)); // last day of prev quarter
    },
  },
};

// Single date presets
const SINGLE_DATE_PRESETS: Record<string, { label: string; resolve: () => string }> = {
  today: {
    label: "Today",
    resolve: () => fmtDate(new Date()),
  },
  current_month_start: {
    label: "1st of current month",
    resolve: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)); },
  },
  last_month_start: {
    label: "1st of last month",
    resolve: () => { const d = new Date(); return fmtDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)); },
  },
  focus_month_name: {
    label: "Last complete month (full)",
    resolve: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth() - 1, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });
    },
  },
  focus_month_short: {
    label: "Last complete month (short)",
    resolve: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth() - 1, 1)
        .toLocaleDateString("en-US", { month: "short" }).toLowerCase();
    },
  },
  same_3m_prior_year_text: {
    label: "Same 3 months, prior year",
    resolve: () => {
      const d = new Date();
      const start = new Date(d.getFullYear() - 1, d.getMonth() - 3, 1);
      const end = new Date(d.getFullYear() - 1, d.getMonth() - 1, 1);
      return `${fmtMonthYear(start)} - ${fmtMonthYear(end)}`;
    },
  },
};

// ─── Variable detection ─────────────────────────────────────────────────────

const DOMAIN_VARS = new Set(["domain"]);
const PATH_VARS = new Set(["domain_reports_path"]);
const DATE_LIKE_PATTERNS = [
  "YYYY-MM-DD", "months ago", "month start", "current month", "prior year",
  "focus_month", "rolling", "last month", "last year", "most recent complete",
];

function classifyVariable(raw: string): TemplateVariable {
  const inner = raw.replace(/^\{|\}$/g, "").trim();
  const key = inner.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  const label = inner.replace(/_/g, " ");

  if (DOMAIN_VARS.has(key)) return { raw, key, label: "Domain", type: "domain" };
  if (PATH_VARS.has(key)) return { raw, key, label: "Reports folder path", type: "path" };
  if (DATE_LIKE_PATTERNS.some((p) => inner.toLowerCase().includes(p.toLowerCase()))) {
    return { raw, key, label, type: "date" };
  }
  return { raw, key, label, type: "text" };
}

function extractPromptBlock(content: string): { promptBlock: string; variables: TemplateVariable[] } {
  const promptSection = content.match(/##\s*Prompt\s*\n+```[^\n]*\n([\s\S]*?)```/);
  const block = promptSection ? promptSection[1].trim() : "";

  const varSet = new Set<string>();
  const vars: TemplateVariable[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    const raw = match[0];
    if (!varSet.has(raw)) {
      varSet.add(raw);
      vars.push(classifyVariable(raw));
    }
  }

  return { promptBlock: block, variables: vars };
}

function extractFrontmatter(content: string): { title: string; summary: string } {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return { title: "", summary: "" };
  const yaml = fm[1];
  const title = yaml.match(/title:\s*"?([^"\n]+)"?/)?.[1] ?? "";
  const summary = yaml.match(/summary:\s*"?([^"\n]+)"?/)?.[1] ?? "";
  return { title, summary };
}

// ─── Range detection ────────────────────────────────────────────────────────

function guessRangePreset(startLabel: string, _endLabel: string): string | undefined {
  const s = startLabel.toLowerCase();

  if (s.includes("12 months ago")) return "last_12m";
  if (s.includes("6 months ago")) return "last_6m";
  if (s.includes("3 months ago") && !s.includes("prior year")) return "last_3m";
  if (s.includes("prior year") && s.includes("3 month")) return "same_period_prior_year_3m";
  if (s.includes("prior year") && s.includes("6 month")) return "same_period_prior_year_6m";
  if (s.includes("prior year") && s.includes("12 month")) return "same_period_prior_year_12m";
  return undefined;
}

function guessSinglePreset(label: string): string | undefined {
  const l = label.toLowerCase();
  if (l.includes("yyyy-mm-dd")) return "today";
  if (l.includes("current month start") || l === "current month start") return "current_month_start";
  if (l.includes("most recent complete month") && !l.includes("short")) return "focus_month_name";
  if (l.includes("focus month") || l.includes("most recent complete")) return "focus_month_short";
  if (l.includes("same 3 months") && l.includes("prior year")) return "same_3m_prior_year_text";
  if (l.includes("last month") && l.includes("start")) return "last_month_start";
  return undefined;
}

function processVariables(promptBlock: string, variables: TemplateVariable[]): ProcessedField[] {
  const dateVars = variables.filter((v) => v.type === "date");
  const usedInRange = new Set<string>();
  const rangeMap = new Map<string, ProcessedField>(); // startVar.key → range field

  // Detect range pairs: {dateVar} - {dateVar} on the same line
  const lines = promptBlock.split("\n");
  for (const line of lines) {
    // Match patterns like {var1} - {var2}
    const rangeMatch = line.match(/\{([^}]+)\}\s*-\s*\{([^}]+)\}/);
    if (!rangeMatch) continue;

    const rawStart = `{${rangeMatch[1]}}`;
    const rawEnd = `{${rangeMatch[2]}}`;
    const startVar = dateVars.find((v) => v.raw === rawStart);
    const endVar = dateVars.find((v) => v.raw === rawEnd);

    if (startVar && endVar) {
      usedInRange.add(startVar.key);
      usedInRange.add(endVar.key);

      // Extract label from line context (text before the vars)
      const labelMatch = line.match(/^[\s-]*([^:{]+)/);
      const rangeLabel = labelMatch ? labelMatch[1].trim() : `${startVar.label} to ${endVar.label}`;

      const rangeId = `${startVar.key}__${endVar.key}`;
      const field: ProcessedField = {
        kind: "date-range",
        id: rangeId,
        label: rangeLabel.charAt(0).toUpperCase() + rangeLabel.slice(1),
        startVar,
        endVar,
        guessedPreset: guessRangePreset(startVar.label, endVar.label),
      };
      rangeMap.set(startVar.key, field);
    }
  }

  // Build processed list in original variable order
  const result: ProcessedField[] = [];
  const seen = new Set<string>();

  for (const v of variables) {
    if (seen.has(v.key)) continue;

    if (v.type !== "date") {
      result.push({ kind: "simple", variable: v });
      seen.add(v.key);
    } else if (rangeMap.has(v.key)) {
      // This var is the start of a range — emit the range field
      const range = rangeMap.get(v.key)!;
      result.push(range);
      if (range.kind === "date-range") {
        seen.add(range.startVar.key);
        seen.add(range.endVar.key);
      }
    } else if (usedInRange.has(v.key)) {
      // End var of a range — already emitted, skip
      seen.add(v.key);
    } else {
      // Standalone date
      result.push({
        kind: "date-single",
        variable: v,
        guessedPreset: guessSinglePreset(v.label),
      });
      seen.add(v.key);
    }
  }

  return result;
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface PromptBuilderProps {
  registry: SkillRegistry;
}

export function PromptBuilder({ registry }: PromptBuilderProps) {
  const { activeRepository } = useRepository();
  const skillsBase = activeRepository ? `${activeRepository.path}/_skills` : null;
  const domainsPath = activeRepository ? `${activeRepository.path}/0_Platform/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  // State
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dateSelections, setDateSelections] = useState<Record<string, string>>({}); // field key → preset or "custom"
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Saved configs discovered across all domains
  const [savedConfigs, setSavedConfigs] = useState<Array<{ domain: string; skill: string; template: string; path: string; saved_at: string }>>([]);
  const [scanningConfigs, setScanningConfigs] = useState(false);

  // Skills that have prompts/ folder
  const [skillsWithPrompts, setSkillsWithPrompts] = useState<string[]>([]);
  const [scanningSkills, setScanningSkills] = useState(false);

  // Scan for skills with prompts/ folders
  useEffect(() => {
    if (!skillsBase || !registry.skills) return;
    let cancelled = false;
    setScanningSkills(true);

    const scan = async () => {
      const slugs = Object.keys(registry.skills);
      const withPrompts: string[] = [];

      for (const slug of slugs) {
        try {
          const entries = await invoke<Array<{ name: string; is_directory: boolean }>>(
            "list_directory",
            { path: `${skillsBase}/${slug}/prompts` },
          );
          if (entries.some((e) => !e.is_directory && e.name.endsWith(".md"))) {
            withPrompts.push(slug);
          }
        } catch {
          // No prompts/ folder
        }
      }

      if (!cancelled) {
        setSkillsWithPrompts(withPrompts.sort());
        setScanningSkills(false);
      }
    };

    scan();
    return () => { cancelled = true; };
  }, [skillsBase, registry.skills]);

  // Scan all domains for saved prompt configs
  useEffect(() => {
    const domains = domainsQuery.data;
    if (!domains || domains.length === 0) return;
    let cancelled = false;
    setScanningConfigs(true);

    const scanConfigs = async () => {
      const found: typeof savedConfigs = [];

      for (const domain of domains) {
        const configDir = `${domain.global_path}/reports/prompt-configs`;
        try {
          const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
            "list_directory",
            { path: configDir },
          );
          const jsonFiles = entries.filter((e) => !e.is_directory && e.name.endsWith(".json"));

          for (const file of jsonFiles) {
            try {
              const content = await invoke<string>("read_file", { path: file.path });
              const config: SavedConfig = JSON.parse(content);
              found.push({
                domain: config.domain || domain.domain,
                skill: config.skill,
                template: config.template,
                path: file.path,
                saved_at: config.saved_at ?? "",
              });
            } catch { /* skip unreadable */ }
          }
        } catch {
          // No prompt-configs folder for this domain
        }
      }

      if (!cancelled) {
        // Sort: most recently saved first
        found.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
        setSavedConfigs(found);
        setScanningConfigs(false);
      }
    };

    scanConfigs();
    return () => { cancelled = true; };
  }, [domainsQuery.data]);

  // Pending config to apply after templates load
  const [pendingConfig, setPendingConfig] = useState<{ skill: string; template: string; domain: string } | null>(null);

  // Load a saved config: set skill, stash pending template + domain
  const handleLoadConfig = useCallback((config: typeof savedConfigs[0]) => {
    // If same skill is already selected, templates are already loaded — apply directly
    if (selectedSkill === config.skill && templates.some((t) => t.name === config.template)) {
      setSelectedTemplate(config.template);
      setValues((prev) => ({ ...prev, domain: config.domain }));
      setPendingConfig(null);
    } else {
      // Different skill — need to wait for templates to load
      setPendingConfig({ skill: config.skill, template: config.template, domain: config.domain });
      setSelectedSkill(config.skill);
      setSelectedTemplate(null);
      setValues((prev) => ({ ...prev, domain: config.domain }));
    }
  }, [selectedSkill, templates]);

  // After templates load, apply pending config
  useEffect(() => {
    if (!pendingConfig || templates.length === 0) return;
    if (templates.some((t) => t.name === pendingConfig.template)) {
      setSelectedTemplate(pendingConfig.template);
      setValues((prev) => ({ ...prev, domain: pendingConfig.domain }));
      setPendingConfig(null);
    }
  }, [templates, pendingConfig]);

  // Load templates when skill is selected
  useEffect(() => {
    if (!skillsBase || !selectedSkill) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }

    let cancelled = false;
    setLoadingTemplates(true);

    const loadTemplates = async () => {
      const promptsPath = `${skillsBase}/${selectedSkill}/prompts`;
      try {
        const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
          "list_directory",
          { path: promptsPath },
        );

        const mdFiles = entries.filter((e) => !e.is_directory && e.name.endsWith(".md"));
        const loaded: PromptTemplate[] = [];

        for (const file of mdFiles) {
          try {
            const content = await invoke<string>("read_file", { path: file.path });
            const { title, summary } = extractFrontmatter(content);
            const { promptBlock, variables } = extractPromptBlock(content);

            if (promptBlock) {
              loaded.push({
                name: file.name.replace(/\.md$/, ""),
                filename: file.name,
                path: file.path,
                content,
                promptBlock,
                title: title || file.name.replace(/\.md$/, "").replace(/-/g, " "),
                summary,
                variables,
              });
            }
          } catch { /* skip unreadable */ }
        }

        if (!cancelled) {
          setTemplates(loaded);
          if (loaded.length === 1) setSelectedTemplate(loaded[0].name);
        }
      } catch {
        if (!cancelled) setTemplates([]);
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    };

    loadTemplates();
    return () => { cancelled = true; };
  }, [skillsBase, selectedSkill]);

  // Current template + processed fields
  const template = templates.find((t) => t.name === selectedTemplate) ?? null;

  const processedFields = useMemo(() => {
    if (!template) return [];
    return processVariables(template.promptBlock, template.variables);
  }, [template]);

  // When template changes, reset values and pre-fill defaults from detected presets
  useEffect(() => {
    if (!template || processedFields.length === 0) return;

    const newValues: Record<string, string> = {};
    const newSelections: Record<string, string> = {};

    for (const field of processedFields) {
      if (field.kind === "date-range") {
        const preset = field.guessedPreset;
        if (preset && RANGE_PRESETS[preset]) {
          newSelections[field.id] = preset;
          newValues[field.startVar.key] = RANGE_PRESETS[preset].resolveStart();
          newValues[field.endVar.key] = RANGE_PRESETS[preset].resolveEnd();
        } else {
          newSelections[field.id] = "custom";
          newValues[field.startVar.key] = "";
          newValues[field.endVar.key] = "";
        }
      } else if (field.kind === "date-single") {
        const preset = field.guessedPreset;
        if (preset && SINGLE_DATE_PRESETS[preset]) {
          newSelections[field.variable.key] = preset;
          newValues[field.variable.key] = SINGLE_DATE_PRESETS[preset].resolve();
        } else {
          newSelections[field.variable.key] = "custom";
          newValues[field.variable.key] = "";
        }
      } else {
        // Keep existing value if any
        newValues[field.variable.key] = values[field.variable.key] ?? "";
      }
    }

    setValues(newValues);
    setDateSelections(newSelections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.name, processedFields.length]);

  // When domain changes, auto-fill path
  const selectedDomain = values["domain"] ?? "";
  const domainInfo = domainsQuery.data?.find((d) => d.domain === selectedDomain);

  useEffect(() => {
    if (domainInfo && template?.variables.some((v) => v.type === "path")) {
      setValues((prev) => ({
        ...prev,
        domain_reports_path: `${domainInfo.global_path}/reports`,
      }));
    }
  }, [domainInfo, template]);

  // Resolve the prompt
  const resolvedPrompt = useMemo(() => {
    if (!template) return "";

    let result = template.promptBlock;
    for (const v of template.variables) {
      const val = values[v.key] ?? "";
      result = result.split(v.raw).join(val);
    }
    return result;
  }, [template, values]);

  // Handlers
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(resolvedPrompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [resolvedPrompt]);

  const handleSave = useCallback(async () => {
    if (!selectedSkill || !selectedTemplate || !selectedDomain || !domainInfo) {
      toast.error("Select a domain first");
      return;
    }

    setSaving(true);
    try {
      const configDir = `${domainInfo.global_path}/reports/prompt-configs`;
      try {
        await invoke("list_directory", { path: configDir });
      } catch {
        await invoke("create_directory", { path: configDir });
      }

      const config: SavedConfig = {
        skill: selectedSkill,
        template: selectedTemplate,
        domain: selectedDomain,
        values,
        dateSelections,
        saved_at: new Date().toISOString(),
      };

      const configPath = `${configDir}/${selectedSkill}--${selectedTemplate}.json`;
      await invoke("write_file", {
        path: configPath,
        content: JSON.stringify(config, null, 2),
      });

      toast.success(`Config saved to ${selectedDomain}`);
    } catch (e) {
      toast.error(`Failed to save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  }, [selectedSkill, selectedTemplate, selectedDomain, domainInfo, values, dateSelections]);

  // Load saved config
  useEffect(() => {
    if (!selectedSkill || !selectedTemplate || !domainInfo || processedFields.length === 0) return;

    const configPath = `${domainInfo.global_path}/reports/prompt-configs/${selectedSkill}--${selectedTemplate}.json`;
    invoke<string>("read_file", { path: configPath })
      .then((content) => {
        const config: SavedConfig = JSON.parse(content);
        const newValues: Record<string, string> = {};
        const newSelections: Record<string, string> = {};

        for (const field of processedFields) {
          if (field.kind === "date-range") {
            const savedPreset = config.dateSelections?.[field.id];
            if (savedPreset && savedPreset !== "custom" && RANGE_PRESETS[savedPreset]) {
              newSelections[field.id] = savedPreset;
              newValues[field.startVar.key] = RANGE_PRESETS[savedPreset].resolveStart();
              newValues[field.endVar.key] = RANGE_PRESETS[savedPreset].resolveEnd();
            } else {
              newSelections[field.id] = "custom";
              newValues[field.startVar.key] = config.values[field.startVar.key] ?? "";
              newValues[field.endVar.key] = config.values[field.endVar.key] ?? "";
            }
          } else if (field.kind === "date-single") {
            const savedPreset = config.dateSelections?.[field.variable.key];
            if (savedPreset && savedPreset !== "custom" && SINGLE_DATE_PRESETS[savedPreset]) {
              newSelections[field.variable.key] = savedPreset;
              newValues[field.variable.key] = SINGLE_DATE_PRESETS[savedPreset].resolve();
            } else {
              newSelections[field.variable.key] = "custom";
              newValues[field.variable.key] = config.values[field.variable.key] ?? "";
            }
          } else {
            newValues[field.variable.key] = config.values[field.variable.key] ?? "";
          }
        }

        setValues(newValues);
        setDateSelections(newSelections);
        toast.info("Loaded saved config");
      })
      .catch(() => { /* no saved config */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkill, selectedTemplate, domainInfo?.domain, processedFields.length]);

  // ─── Callbacks for field changes ──────────────────────────────────────────

  const handleValueChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleRangePresetChange = useCallback((rangeId: string, startKey: string, endKey: string, preset: string) => {
    setDateSelections((prev) => ({ ...prev, [rangeId]: preset }));
    if (preset !== "custom" && RANGE_PRESETS[preset]) {
      setValues((prev) => ({
        ...prev,
        [startKey]: RANGE_PRESETS[preset].resolveStart(),
        [endKey]: RANGE_PRESETS[preset].resolveEnd(),
      }));
    }
  }, []);

  const handleSinglePresetChange = useCallback((varKey: string, preset: string) => {
    setDateSelections((prev) => ({ ...prev, [varKey]: preset }));
    if (preset !== "custom" && SINGLE_DATE_PRESETS[preset]) {
      setValues((prev) => ({ ...prev, [varKey]: SINGLE_DATE_PRESETS[preset].resolve() }));
    }
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex">
      {/* Left: Configuration panel */}
      <div className="w-80 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Saved configs — quick load */}
          {(savedConfigs.length > 0 || scanningConfigs) && (
            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                Saved Configs
              </label>
              {scanningConfigs ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                  <Loader2 size={12} className="animate-spin" /> Scanning domains...
                </div>
              ) : (
                <div className="space-y-1">
                  {savedConfigs.map((cfg) => {
                    const isActive = selectedSkill === cfg.skill && selectedTemplate === cfg.template && selectedDomain === cfg.domain;
                    return (
                      <button
                        key={cfg.path}
                        onClick={() => handleLoadConfig(cfg)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                          isActive
                            ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/30"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <History size={12} className="text-zinc-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                              {cfg.domain} / {cfg.template}
                            </p>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {registry.skills[cfg.skill]?.name ?? cfg.skill}
                              {cfg.saved_at && ` · ${new Date(cfg.saved_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Skill selector */}
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">
              Skill
            </label>
            {scanningSkills ? (
              <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                <Loader2 size={12} className="animate-spin" /> Scanning skills...
              </div>
            ) : (
              <select
                value={selectedSkill ?? ""}
                onChange={(e) => {
                  setSelectedSkill(e.target.value || null);
                  setSelectedTemplate(null);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select a skill...</option>
                {skillsWithPrompts.map((slug) => (
                  <option key={slug} value={slug}>
                    {registry.skills[slug]?.name ?? slug}
                  </option>
                ))}
              </select>
            )}
            {skillsWithPrompts.length === 0 && !scanningSkills && (
              <p className="text-[10px] text-zinc-400 mt-1">No skills with prompts/ folder found</p>
            )}
          </div>

          {/* Template selector */}
          {selectedSkill && (
            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                Template
              </label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                  <Loader2 size={12} className="animate-spin" /> Loading templates...
                </div>
              ) : templates.length === 0 ? (
                <p className="text-xs text-zinc-400">No prompt templates found</p>
              ) : (
                <div className="space-y-1">
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setSelectedTemplate(t.name)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                        selectedTemplate === t.name
                          ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/30"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-teal-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{t.title}</p>
                          {t.summary && (
                            <p className="text-[10px] text-zinc-400 truncate">{t.summary}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Variables form */}
          {template && processedFields.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                Variables
              </label>
              <div className="space-y-3">
                {processedFields.map((field) => {
                  if (field.kind === "simple") {
                    return (
                      <SimpleField
                        key={field.variable.key}
                        variable={field.variable}
                        value={values[field.variable.key] ?? ""}
                        domains={domainsQuery.data ?? []}
                        onChange={(val) => handleValueChange(field.variable.key, val)}
                      />
                    );
                  }
                  if (field.kind === "date-range") {
                    return (
                      <DateRangeField
                        key={field.id}
                        field={field}
                        startValue={values[field.startVar.key] ?? ""}
                        endValue={values[field.endVar.key] ?? ""}
                        selectedPreset={dateSelections[field.id] ?? "custom"}
                        onPresetChange={(preset) => handleRangePresetChange(field.id, field.startVar.key, field.endVar.key, preset)}
                        onStartChange={(val) => handleValueChange(field.startVar.key, val)}
                        onEndChange={(val) => handleValueChange(field.endVar.key, val)}
                      />
                    );
                  }
                  if (field.kind === "date-single") {
                    return (
                      <SingleDateField
                        key={field.variable.key}
                        field={field}
                        value={values[field.variable.key] ?? ""}
                        selectedPreset={dateSelections[field.variable.key] ?? "custom"}
                        onPresetChange={(preset) => handleSinglePresetChange(field.variable.key, preset)}
                        onChange={(val) => handleValueChange(field.variable.key, val)}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {template && (
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy Prompt"}
              </button>
              <button
                onClick={handleSave}
                disabled={!selectedDomain || saving}
                title={selectedDomain ? `Save config to ${selectedDomain}` : "Select a domain first"}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                  selectedDomain
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed",
                )}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Prompt preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {template ? (
          <>
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>{registry.skills[selectedSkill!]?.name}</span>
                <ChevronRight size={10} />
                <span className="text-zinc-700 dark:text-zinc-300">{template.title}</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 leading-relaxed">
                {resolvedPrompt || <span className="text-zinc-400 italic">Fill in variables to see the resolved prompt...</span>}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Zap size={32} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">Select a skill and template to build a prompt</p>
              <p className="text-xs text-zinc-400 mt-1">Variables will be auto-detected and filled</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Simple Field (domain, path, text) ──────────────────────────────────────

function SimpleField({
  variable,
  value,
  domains,
  onChange,
}: {
  variable: TemplateVariable;
  value: string;
  domains: Array<{ domain: string; global_path: string }>;
  onChange: (val: string) => void;
}) {
  if (variable.type === "domain") {
    return (
      <div>
        <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">{variable.label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">Select domain...</option>
          {domains.map((d) => (
            <option key={d.domain} value={d.domain}>{d.domain}</option>
          ))}
        </select>
      </div>
    );
  }

  if (variable.type === "path") {
    return (
      <div>
        <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1 block">
          <FolderOpen size={10} />
          {variable.label}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Auto-filled from domain"
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">{variable.label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
    </div>
  );
}

// ─── Date Range Field ───────────────────────────────────────────────────────

function DateRangeField({
  field,
  startValue,
  endValue,
  selectedPreset,
  onPresetChange,
  onStartChange,
  onEndChange,
}: {
  field: Extract<ProcessedField, { kind: "date-range" }>;
  startValue: string;
  endValue: string;
  selectedPreset: string;
  onPresetChange: (preset: string) => void;
  onStartChange: (val: string) => void;
  onEndChange: (val: string) => void;
}) {
  const isCustom = selectedPreset === "custom";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-2.5">
      <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1 block">
        <Calendar size={10} />
        {field.label}
      </label>

      {/* Preset dropdown */}
      <select
        value={selectedPreset}
        onChange={(e) => onPresetChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        {Object.entries(RANGE_PRESETS).map(([key, { label }]) => (
          <option key={key} value={key}>{label}</option>
        ))}
        <option value="custom">Custom range</option>
      </select>

      {/* Show resolved dates for presets, or date pickers for custom */}
      {isCustom ? (
        <div className="mt-2 space-y-1.5">
          <div>
            <label className="text-[9px] text-zinc-400 mb-0.5 block">Start</label>
            <input
              type="date"
              value={startValue}
              onChange={(e) => onStartChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-[9px] text-zinc-400 mb-0.5 block">End</label>
            <input
              type="date"
              value={endValue}
              onChange={(e) => onEndChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] font-mono text-teal-600 dark:text-teal-400">
          {startValue} &rarr; {endValue}
        </p>
      )}
    </div>
  );
}

// ─── Single Date Field ──────────────────────────────────────────────────────

function SingleDateField({
  field,
  value,
  selectedPreset,
  onPresetChange,
  onChange,
}: {
  field: Extract<ProcessedField, { kind: "date-single" }>;
  value: string;
  selectedPreset: string;
  onPresetChange: (preset: string) => void;
  onChange: (val: string) => void;
}) {
  const isCustom = selectedPreset === "custom";

  return (
    <div>
      <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1 block">
        <Calendar size={10} />
        {field.variable.label}
      </label>

      {/* Preset dropdown */}
      <select
        value={selectedPreset}
        onChange={(e) => onPresetChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        {Object.entries(SINGLE_DATE_PRESETS).map(([key, { label }]) => (
          <option key={key} value={key}>{label}</option>
        ))}
        <option value="custom">Pick a date</option>
      </select>

      {/* Custom: date picker. Preset: show resolved value */}
      {isCustom ? (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      ) : (
        <p className="mt-1 text-[10px] font-mono text-teal-600 dark:text-teal-400">{value}</p>
      )}
    </div>
  );
}
