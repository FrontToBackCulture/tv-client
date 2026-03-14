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
  Pencil,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { useKnowledgePaths } from "../../hooks/useKnowledgePaths";
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
  const paths = useKnowledgePaths();
  const skillsBase = paths ? paths.skills : null;
  const domainsPath = paths ? `${paths.platform}/domains` : null;
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

  // Editable prompt state
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null); // null = not edited, use resolvedPrompt
  const [isEditing, setIsEditing] = useState(false);

  // AI validation state
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ score: number; feedback: string; suggestions: string[] } | null>(null);
  const [applyingFix, setApplyingFix] = useState<number | null>(null); // index of suggestion being applied

  // Saved configs discovered across all domains
  const [savedConfigs, setSavedConfigs] = useState<Array<{ domain: string; skill: string; template: string; path: string; saved_at: string; values?: Record<string, string> }>>([]);
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
                values: config.values,
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
  const [pendingConfig, setPendingConfig] = useState<{ skill: string; template: string; domain: string; path?: string } | null>(null);

  // Load a saved config: set skill, stash pending template + domain + path
  const handleLoadConfig = useCallback((config: typeof savedConfigs[0]) => {
    // If same skill is already selected, templates are already loaded — apply directly
    if (selectedSkill === config.skill && templates.some((t) => t.name === config.template)) {
      setSelectedTemplate(config.template);
      setValues((prev) => ({ ...prev, domain: config.domain }));
      setPendingConfig({ skill: config.skill, template: config.template, domain: config.domain, path: config.path });
    } else {
      // Different skill — need to wait for templates to load
      setPendingConfig({ skill: config.skill, template: config.template, domain: config.domain, path: config.path });
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
      // Don't clear pending yet — the auto-load effect will use pendingConfig.path
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
        // Path vars: compute from domain immediately rather than waiting for separate effect
        if (field.variable.type === "path" && domainInfo) {
          newValues[field.variable.key] = `${domainInfo.global_path}/reports`;
        } else if (field.variable.type !== "path") {
          // Keep existing value if any
          newValues[field.variable.key] = values[field.variable.key] ?? "";
        }
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

  // The actual prompt to display and copy — edited version takes priority
  const activePrompt = editedPrompt ?? resolvedPrompt;
  const hasEdits = editedPrompt !== null;

  // Reset edited prompt when template or variables change (user hasn't manually edited yet)
  useEffect(() => {
    setEditedPrompt(null);
    setIsEditing(false);
    setValidation(null);
  }, [template?.name, resolvedPrompt]);

  // Handlers
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(activePrompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [activePrompt]);

  const handleResetPrompt = useCallback(() => {
    setEditedPrompt(null);
    setIsEditing(false);
    setValidation(null);
    toast.success("Prompt reset to template");
  }, []);

  const handleValidate = useCallback(async () => {
    if (!template || !selectedSkill) return;

    setValidating(true);
    setValidation(null);
    try {
      // Load the skill definition for context
      const skillPath = `${skillsBase}/${selectedSkill}/SKILL.md`;
      let skillContent = "";
      try {
        skillContent = await invoke<string>("read_file", { path: skillPath });
        // Truncate to keep the request reasonable
        if (skillContent.length > 3000) {
          skillContent = skillContent.substring(0, 3000) + "\n... [truncated]";
        }
      } catch {
        // Skill file not found, continue without it
      }

      const prompt = activePrompt;
      const validationPrompt = `You are a prompt quality assessor. Rate this prompt on a scale of 1-10 and provide feedback.

SKILL CONTEXT (what this prompt template is designed for):
${skillContent || "(No skill definition available)"}

PROMPT TO VALIDATE:
${prompt}

Assess the prompt on:
1. **Clarity** — Is the intent clear? Will the AI know exactly what to do?
2. **Specificity** — Are dates, domains, filters specific enough?
3. **Completeness** — Is anything missing that the skill needs?
4. **Business relevance** — Does this prompt ask the right question for the business goal?
5. **Effectiveness** — Will this produce a useful, actionable output?

Respond in this exact JSON format (no markdown, no code blocks):
{"score": <1-10>, "feedback": "<2-3 sentence overall assessment>", "suggestions": ["<suggestion 1>", "<suggestion 2>"]}

If the prompt is good (8+), keep suggestions to 0-1 items. If poor (<5), give 2-3 concrete fixes.`;

      const result = await invoke<string>("help_chat_ask", {
        question: validationPrompt,
        history: [],
        systemPrompt: "You are a prompt quality assessor. Respond ONLY with valid JSON, no markdown or code blocks.",
        knowledgeBasePath: null,
      });

      // Parse the JSON response — strip markdown code blocks if present
      let jsonStr = result.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
      // Also handle case where response starts with { but has trailing text
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const parsed = JSON.parse(jsonStr);
      setValidation({
        score: parsed.score ?? 5,
        feedback: parsed.feedback ?? "Unable to assess.",
        suggestions: parsed.suggestions ?? [],
      });
    } catch (e) {
      console.error("[PromptBuilder] AI validation failed:", e);
      // Fallback: run deterministic checks if AI validation fails
      const issues: string[] = [];
      const prompt = activePrompt;

      // Check for unresolved placeholders
      const unresolved = prompt.match(/\{[^}]+\}/g);
      if (unresolved) {
        issues.push(`Unresolved variables: ${unresolved.join(", ")}`);
      }

      // Check for empty/short prompt
      if (prompt.trim().length < 50) {
        issues.push("Prompt is very short — may lack sufficient context for a useful output");
      }

      // Check for missing domain
      if (!values["domain"]) {
        issues.push("No domain selected — the prompt won't target a specific client");
      }

      if (issues.length === 0) {
        setValidation({
          score: 7,
          feedback: "Prompt looks structurally complete. AI validation unavailable — basic checks passed.",
          suggestions: [],
        });
      } else {
        setValidation({
          score: Math.max(1, 7 - issues.length * 2),
          feedback: `Found ${issues.length} issue${issues.length > 1 ? "s" : ""} with this prompt.`,
          suggestions: issues,
        });
      }
    } finally {
      setValidating(false);
    }
  }, [activePrompt, template, selectedSkill, skillsBase, values]);

  const handleApplyFix = useCallback(async (suggestionIndex: number) => {
    if (!validation || !validation.suggestions[suggestionIndex]) return;

    const suggestion = validation.suggestions[suggestionIndex];
    setApplyingFix(suggestionIndex);

    try {
      const fixPrompt = `You are a prompt editor. Apply this specific improvement to the prompt below and return ONLY the revised prompt text. Do not explain what you changed. Do not add any preamble or commentary. Return the full revised prompt.

IMPROVEMENT TO APPLY:
${suggestion}

CURRENT PROMPT:
${activePrompt}`;

      const result = await invoke<string>("help_chat_ask", {
        question: fixPrompt,
        history: [],
        systemPrompt: "You are a prompt editor. Return ONLY the revised prompt text, nothing else. No markdown code blocks, no explanation.",
        knowledgeBasePath: null,
      });

      // Strip any markdown code blocks the model might wrap it in
      let revised = result.trim();
      const codeBlockMatch = revised.match(/```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (codeBlockMatch) revised = codeBlockMatch[1].trim();

      setEditedPrompt(revised);
      setIsEditing(false);

      // Mark this suggestion as applied
      setValidation((prev) => {
        if (!prev) return prev;
        const updated = [...prev.suggestions];
        updated[suggestionIndex] = `✓ ${updated[suggestionIndex]}`;
        return { ...prev, suggestions: updated };
      });

      toast.success("Fix applied — review the updated prompt");
    } catch (e) {
      console.error("[PromptBuilder] Apply fix failed:", e);
      toast.error("Failed to apply fix — try editing manually");
    } finally {
      setApplyingFix(null);
    }
  }, [activePrompt, validation]);

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

      // Build filename with non-domain, non-date variable values to distinguish configs
      const extraParts = processedFields
        .filter((f): f is Extract<ProcessedField, { kind: "simple" }> => f.kind === "simple" && f.variable.key !== "domain")
        .map((f) => values[f.variable.key]?.trim())
        .filter(Boolean)
        .map((v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const suffix = extraParts.length > 0 ? `--${extraParts.join("--")}` : "";
      const configPath = `${configDir}/${selectedSkill}--${selectedTemplate}${suffix}.json`;
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
  }, [selectedSkill, selectedTemplate, selectedDomain, domainInfo, values, dateSelections, processedFields]);

  // Load saved config — find first matching config file for this skill/template/domain
  const applyConfig = useCallback((config: SavedConfig) => {
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
  }, [processedFields]);

  useEffect(() => {
    if (!selectedSkill || !selectedTemplate || !domainInfo || processedFields.length === 0) return;

    // If user clicked a specific config from the tree, load that exact file
    if (pendingConfig?.path && pendingConfig.skill === selectedSkill && pendingConfig.template === selectedTemplate) {
      const configPath = pendingConfig.path;
      setPendingConfig(null);
      invoke<string>("read_file", { path: configPath })
        .then((content) => {
          const config: SavedConfig = JSON.parse(content);
          applyConfig(config);
          toast.info("Loaded saved config");
        })
        .catch(() => { /* file not found */ });
      return;
    }

    // Otherwise, auto-discover: scan for matching config files
    const configDir = `${domainInfo.global_path}/reports/prompt-configs`;
    const prefix = `${selectedSkill}--${selectedTemplate}`;

    invoke<Array<{ name: string; path: string; is_directory: boolean }>>("list_directory", { path: configDir })
      .then(async (entries) => {
        const matches = entries.filter((e) => !e.is_directory && e.name.startsWith(prefix) && e.name.endsWith(".json"));
        if (matches.length === 0) return;
        // If exactly one match, auto-load it. If multiple, user picks from tree.
        if (matches.length === 1) {
          const content = await invoke<string>("read_file", { path: matches[0].path });
          const config: SavedConfig = JSON.parse(content);
          applyConfig(config);
          toast.info("Loaded saved config");
        }
      })
      .catch(() => { /* no config dir */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkill, selectedTemplate, domainInfo?.domain, processedFields.length, pendingConfig]);

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
          {/* Saved configs — tree: Template → domain chips */}
          {(savedConfigs.length > 0 || scanningConfigs) && (
            <SavedConfigsTree
              configs={savedConfigs}
              loading={scanningConfigs}
              registry={registry}
              activeSkill={selectedSkill}
              activeTemplate={selectedTemplate}
              activeDomain={selectedDomain}
              onLoad={handleLoadConfig}
            />
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

      {/* Right: Prompt preview / editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {template ? (
          <>
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>{registry.skills[selectedSkill!]?.name}</span>
                  <ChevronRight size={10} />
                  <span className="text-zinc-700 dark:text-zinc-300">{template.title}</span>
                  {hasEdits && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                      Edited
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {!isEditing ? (
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        if (editedPrompt === null) setEditedPrompt(resolvedPrompt);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Edit prompt directly"
                    >
                      <Pencil size={10} />
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400 transition-colors"
                    >
                      <Check size={10} />
                      Done
                    </button>
                  )}
                  {hasEdits && (
                    <button
                      onClick={handleResetPrompt}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Reset to template"
                    >
                      <RotateCcw size={10} />
                      Reset
                    </button>
                  )}
                  <button
                    onClick={handleValidate}
                    disabled={validating || !activePrompt}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors",
                      validating
                        ? "text-zinc-400 cursor-wait"
                        : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20",
                    )}
                    title="Validate prompt quality"
                  >
                    {validating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                    Validate
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              {/* Prompt area — textarea when editing, pre when viewing */}
              {isEditing ? (
                <textarea
                  value={editedPrompt ?? resolvedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  className="flex-1 min-h-[200px] text-sm font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 rounded-lg border-2 border-teal-300 dark:border-teal-700 p-4 leading-relaxed focus:outline-none focus:border-teal-500 resize-none"
                  spellCheck={false}
                />
              ) : (
                <pre
                  className={cn(
                    "text-sm font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900 rounded-lg border p-4 leading-relaxed cursor-text",
                    hasEdits
                      ? "border-amber-200 dark:border-amber-800"
                      : "border-zinc-200 dark:border-zinc-800",
                  )}
                  onClick={() => {
                    setIsEditing(true);
                    if (editedPrompt === null) setEditedPrompt(resolvedPrompt);
                  }}
                >
                  {activePrompt || <span className="text-zinc-400 italic">Fill in variables to see the resolved prompt...</span>}
                </pre>
              )}

              {/* AI Validation result */}
              {validation && (
                <div className={cn(
                  "rounded-lg border p-3 text-xs",
                  validation.score >= 8
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                    : validation.score >= 5
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles size={12} className={cn(
                        validation.score >= 8 ? "text-emerald-600" : validation.score >= 5 ? "text-amber-600" : "text-red-600",
                      )} />
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Prompt Quality</span>
                    </div>
                    <span className={cn(
                      "text-sm font-bold",
                      validation.score >= 8 ? "text-emerald-600" : validation.score >= 5 ? "text-amber-600" : "text-red-600",
                    )}>
                      {validation.score}/10
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 mb-1">{validation.feedback}</p>
                  {validation.suggestions.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {validation.suggestions.map((s, i) => {
                        const isApplied = s.startsWith("✓ ");
                        const isApplying = applyingFix === i;
                        return (
                          <li key={i} className={cn(
                            "flex items-start gap-2 rounded-md p-1.5 -mx-1.5 transition-colors",
                            isApplied
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-600 dark:text-zinc-400",
                          )}>
                            <span className={cn("mt-0.5 flex-shrink-0", isApplied ? "text-emerald-500" : "text-amber-500")}>
                              {isApplied ? "✓" : "•"}
                            </span>
                            <span className="flex-1 text-xs">{isApplied ? s.slice(2) : s}</span>
                            {!isApplied && (
                              <button
                                onClick={() => handleApplyFix(i)}
                                disabled={isApplying || applyingFix !== null}
                                className={cn(
                                  "flex-shrink-0 flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors",
                                  isApplying
                                    ? "text-zinc-400 cursor-wait"
                                    : "text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 cursor-pointer",
                                )}
                                title="Apply this fix to the prompt"
                              >
                                {isApplying ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <Zap size={10} />
                                )}
                                {isApplying ? "Applying..." : "Fix"}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
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

// ─── SavedConfigsTree ─────────────────────────────────────────────────────────
// Collapsible tree: Skill (if multiple) → Template → domain chips

interface SavedConfigsTreeProps {
  configs: Array<{ domain: string; skill: string; template: string; path: string; saved_at: string; values?: Record<string, string> }>;
  loading: boolean;
  registry: SkillRegistry;
  activeSkill: string | null;
  activeTemplate: string | null;
  activeDomain: string;
  onLoad: (config: SavedConfigsTreeProps["configs"][0]) => void;
}

function SavedConfigsTree({ configs, loading, registry, activeSkill, activeTemplate, activeDomain, onLoad }: SavedConfigsTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Group: skill → template → configs[]
  const tree = useMemo(() => {
    const map = new Map<string, Map<string, typeof configs>>();
    for (const c of configs) {
      if (!map.has(c.skill)) map.set(c.skill, new Map());
      const tMap = map.get(c.skill)!;
      if (!tMap.has(c.template)) tMap.set(c.template, []);
      tMap.get(c.template)!.push(c);
    }
    return map;
  }, [configs]);

  const multiSkill = tree.size > 1;

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
        <Loader2 size={12} className="animate-spin" /> Scanning saved configs...
      </div>
    );
  }

  if (configs.length === 0) return null;

  return (
    <div>
      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <History size={10} />
        Saved Configs
      </label>
      <div className="space-y-0.5">
        {Array.from(tree.entries()).map(([skill, templateMap]) => {
          const skillKey = `skill:${skill}`;
          const skillCollapsed = multiSkill && collapsed[skillKey];
          const skillName = registry.skills[skill]?.name ?? skill;

          return (
            <div key={skill}>
              {/* Skill header — only show if multiple skills */}
              {multiSkill && (
                <button
                  onClick={() => toggleCollapse(skillKey)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
                    activeSkill === skill
                      ? "text-teal-600 dark:text-teal-400"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
                  )}
                >
                  <ChevronRight
                    size={10}
                    className={cn("transition-transform flex-shrink-0", !skillCollapsed && "rotate-90")}
                  />
                  <Zap size={10} className="flex-shrink-0" />
                  <span className="truncate">{skillName}</span>
                </button>
              )}

              {/* Templates under this skill */}
              {!skillCollapsed && Array.from(templateMap.entries()).map(([template, items]) => {
                const templateKey = `tpl:${skill}:${template}`;
                const tplCollapsed = collapsed[templateKey];
                const isActiveTemplate = activeSkill === skill && activeTemplate === template;

                return (
                  <div key={template} className={multiSkill ? "ml-3" : ""}>
                    <button
                      onClick={() => toggleCollapse(templateKey)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-md transition-colors",
                        isActiveTemplate
                          ? "text-teal-600 dark:text-teal-400 font-medium"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
                      )}
                    >
                      <ChevronRight
                        size={10}
                        className={cn("transition-transform flex-shrink-0", !tplCollapsed && "rotate-90")}
                      />
                      <FileText size={10} className="flex-shrink-0" />
                      <span className="truncate">{template}</span>
                      <span className="ml-auto text-[9px] text-zinc-400 flex-shrink-0">{items.length}</span>
                    </button>

                    {/* Domain chips */}
                    {!tplCollapsed && (
                      <div className="flex flex-wrap gap-1 px-2 py-1 ml-4">
                        {items.map((c, idx) => {
                          const isActive = isActiveTemplate && activeDomain === c.domain;
                          // When multiple configs share the same domain, show differentiating variable values
                          const duplicateDomains = items.filter((i) => i.domain === c.domain).length > 1;
                          let chipLabel = c.domain;
                          if (duplicateDomains && c.values) {
                            // Find variable values that differ between configs with the same domain
                            const siblings = items.filter((i) => i.domain === c.domain);
                            const diffKeys = Object.keys(c.values).filter((k) => {
                              if (k === "domain") return false;
                              return siblings.some((s) => s.values?.[k] !== c.values?.[k]);
                            });
                            if (diffKeys.length > 0) {
                              const diffVals = diffKeys.map((k) => c.values![k]).filter(Boolean).join(", ");
                              if (diffVals) chipLabel = `${c.domain} · ${diffVals}`;
                            }
                          }
                          return (
                            <button
                              key={`${c.domain}-${idx}`}
                              onClick={() => onLoad(c)}
                              title={`Load ${c.domain} — saved ${c.saved_at}`}
                              className={cn(
                                "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                                isActive
                                  ? "bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 font-medium"
                                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-teal-300 dark:hover:border-teal-600 hover:text-teal-600 dark:hover:text-teal-400",
                              )}
                            >
                              {chipLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
