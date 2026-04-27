// Settings: Bots
//
// Three sections:
//   1. Folder paths — fleet folder + per-bot overrides
//   2. Routing rules — which bot handles which scope
//   3. Legacy paths — botsPath / sessionsPath used by the older Bot module
//
// All overrides persist via botSettingsStore. The Cmd+J chat consults the
// store directly through botRouting.ts; no rebuild needed.

import { useEffect, useState } from "react";
import { useBotSettingsStore, type RoutingOverrideRule } from "../../stores/botSettingsStore";
import {
  ALL_BOTS,
  type BotName,
  resolveBotPath,
  getDefaultSerializedRules,
  matchRoutingRule,
  type SerializedRule,
} from "../../lib/botRouting";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useCurrentUserId } from "../../hooks/work/useUsers";
import { useSelectedEntity } from "../../hooks/useSelectedEntity";
import { useAppStore } from "../../stores/appStore";
import { supabase } from "../../lib/supabase";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import {
  FolderOpen,
  Trash2,
  Bot,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Plus,
  ChevronDown,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { IconButton } from "../../components/ui";

const BOT_LABEL: Record<BotName, string> = {
  "bot-mel": "Personal (bot-mel)",
  "bot-delivery": "Delivery",
  "bot-sales": "Sales",
  "bot-domain": "Domain",
  "bot-builder": "Builder",
};

export function BotsPathView() {
  // ─── legacy fields ────────────────────────────────────────────
  const botsPath = useBotSettingsStore((s) => s.botsPath);
  const setBotsPath = useBotSettingsStore((s) => s.setBotsPath);
  const sessionsPath = useBotSettingsStore((s) => s.sessionsPath);
  const setSessionsPath = useBotSettingsStore((s) => s.setSessionsPath);

  // ─── new fields ───────────────────────────────────────────────
  const fleetFolderPath = useBotSettingsStore((s) => s.fleetFolderPath);
  const setFleetFolderPath = useBotSettingsStore((s) => s.setFleetFolderPath);
  const botPathOverrides = useBotSettingsStore((s) => s.botPathOverrides);
  const setBotPathOverride = useBotSettingsStore((s) => s.setBotPathOverride);
  const clearBotPathOverride = useBotSettingsStore((s) => s.clearBotPathOverride);
  const routingOverrides = useBotSettingsStore((s) => s.routingOverrides);
  const setRoutingOverrides = useBotSettingsStore((s) => s.setRoutingOverrides);

  // Resolve knowledgeRoot + teamFolder so we can show "detected default" paths.
  const knowledgeRoot = useRepositoryStore(
    (s) => s.repositories.find((r) => r.id === s.activeRepositoryId)?.path ?? "",
  );
  const userId = useCurrentUserId();
  const [teamFolder, setTeamFolder] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("team_folder")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setTeamFolder((data?.team_folder as string | null) ?? null));
  }, [userId]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Bots</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Where each bot's CLAUDE.md lives, and which bot handles which scope in
          the Cmd+J chat.
        </p>
      </div>

      {/* ─── Fleet folder ───────────────────────────────────────── */}
      <SectionCard
        icon={<Bot size={16} className="text-teal-500" />}
        title="Fleet folder"
        hint={
          <>
            Where the specialist bots (<code>bot-delivery</code>,{" "}
            <code>bot-sales</code>, <code>bot-domain</code>, <code>bot-builder</code>) live.
            Empty → uses convention{" "}
            <code className="text-[11px]">{`{knowledgeRoot}/../tv-bots`}</code>.
          </>
        }
      >
        <PathInput
          value={fleetFolderPath}
          onChange={setFleetFolderPath}
          placeholder={knowledgeRoot ? `${knowledgeRoot.replace(/\/[^/]+$/, "")}/tv-bots` : "/path/to/tv-bots"}
          onBrowse={async () => {
            const sel = await openDialog({
              directory: true,
              multiple: false,
              title: "Select tv-bots folder",
              defaultPath: fleetFolderPath || undefined,
            });
            if (sel && typeof sel === "string") setFleetFolderPath(sel);
          }}
        />
      </SectionCard>

      {/* ─── Per-bot paths ──────────────────────────────────────── */}
      <SectionCard
        icon={<Bot size={16} className="text-teal-500" />}
        title="Bot file paths"
        hint="One row per bot. Override the path if your repo layout doesn't follow convention. ✓ = file found, ⚠ = missing."
      >
        <div className="space-y-2.5">
          {ALL_BOTS.map((bot) => {
            const detected = resolveBotPath(bot, {
              knowledgeRoot,
              teamFolder,
              fleetFolderPath: fleetFolderPath || null,
              // Pass overrides minus this bot — so the "detected default"
              // shows what we'd use without an override.
              overrides: { ...botPathOverrides, [bot]: undefined },
            });
            const override = botPathOverrides[bot] ?? "";
            const effective = override || detected;
            return (
              <BotPathRow
                key={bot}
                bot={bot}
                detected={detected}
                override={override}
                effectivePath={effective}
                onSetOverride={(p) => setBotPathOverride(bot, p)}
                onClearOverride={() => clearBotPathOverride(bot)}
                onBrowse={async () => {
                  const sel = await openDialog({
                    multiple: false,
                    title: `Select CLAUDE.md for ${bot}`,
                    defaultPath: override || detected || undefined,
                    filters: [{ name: "Markdown", extensions: ["md"] }],
                  });
                  if (sel && typeof sel === "string") setBotPathOverride(bot, sel);
                }}
              />
            );
          })}
        </div>
      </SectionCard>

      {/* ─── Routing rules ──────────────────────────────────────── */}
      <SectionCard
        icon={<Bot size={16} className="text-teal-500" />}
        title="Routing rules"
        hint="Which bot handles which scope. Top-to-bottom, first match wins. Tasks resolve by their parent project type (deal vs work)."
      >
        <CurrentScopePreview rules={routingOverrides ?? getDefaultSerializedRules()} />
        <ScopeGlossary />
        <RoutingEditor
          rules={routingOverrides ?? getDefaultSerializedRules()}
          isCustom={!!routingOverrides}
          onChange={(next) => setRoutingOverrides(next)}
          onReset={() => setRoutingOverrides(null)}
        />
      </SectionCard>

      {/* ─── Legacy ─────────────────────────────────────────────── */}
      <SectionCard
        icon={<Clock size={16} className="text-zinc-400" />}
        title="Legacy paths (older Bot module)"
        hint="Used by the older Bot module — not by Cmd+J chat. Leave blank if you don't use that module."
      >
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Bots directory</div>
            <PathInput
              value={botsPath}
              onChange={setBotsPath}
              placeholder="/path/to/tv-knowledge/_team"
              onBrowse={async () => {
                const sel = await openDialog({
                  directory: true,
                  multiple: false,
                  title: "Select bots directory (_team folder)",
                  defaultPath: botsPath || undefined,
                });
                if (sel && typeof sel === "string") setBotsPath(sel);
              }}
            />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Sessions directory</div>
            <PathInput
              value={sessionsPath}
              onChange={setSessionsPath}
              placeholder="/path/to/tv-knowledge/_team/melvin/sessions"
              onBrowse={async () => {
                const sel = await openDialog({
                  directory: true,
                  multiple: false,
                  title: "Select sessions directory",
                  defaultPath: sessionsPath || undefined,
                });
                if (sel && typeof sel === "string") setSessionsPath(sel);
              }}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
      </div>
      {children}
      {hint && <p className="text-xs text-zinc-400 mt-3">{hint}</p>}
    </div>
  );
}

function PathInput({
  value,
  onChange,
  placeholder,
  onBrowse,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onBrowse: () => Promise<void> | void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-xs placeholder:text-zinc-400"
      />
      <IconButton
        icon={FolderOpen}
        label="Browse..."
        onClick={() => onBrowse()}
        className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 p-2"
      />
      {value && (
        <IconButton icon={Trash2} variant="danger" label="Clear" onClick={() => onChange("")} className="p-2" />
      )}
    </div>
  );
}

function BotPathRow({
  bot,
  detected,
  override,
  effectivePath,
  onSetOverride,
  onClearOverride,
  onBrowse,
}: {
  bot: BotName;
  detected: string | null;
  override: string;
  effectivePath: string | null;
  onSetOverride: (p: string) => void;
  onClearOverride: () => void;
  onBrowse: () => void | Promise<void>;
}) {
  // Existence check — async, refreshed on path change.
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!effectivePath) {
      setFileExists(null);
      return;
    }
    exists(effectivePath)
      .then((ok) => {
        if (!cancelled) setFileExists(ok);
      })
      .catch(() => {
        if (!cancelled) setFileExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePath]);

  return (
    <div className="border border-zinc-200/60 dark:border-zinc-800/60 rounded-md p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{bot}</span>
        <span className="text-[11px] text-zinc-400">{BOT_LABEL[bot]}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {fileExists === true && (
            <span title={effectivePath ?? ""} className="flex items-center gap-1 text-[11px] text-emerald-500">
              <CheckCircle2 size={12} />
              found
            </span>
          )}
          {fileExists === false && (
            <span title={effectivePath ?? ""} className="flex items-center gap-1 text-[11px] text-amber-500">
              <AlertCircle size={12} />
              missing
            </span>
          )}
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 mb-1">
        Detected: <code className="text-zinc-600 dark:text-zinc-400">{detected ?? "—"}</code>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={override}
          onChange={(e) => onSetOverride(e.target.value)}
          placeholder={detected ?? "Override path…"}
          className="flex-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-[11px] placeholder:text-zinc-400"
        />
        <IconButton
          icon={FolderOpen}
          label="Browse..."
          onClick={() => onBrowse()}
          className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 p-1.5"
        />
        {override && (
          <IconButton
            icon={RotateCcw}
            label="Reset to default"
            onClick={() => onClearOverride()}
            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 p-1.5"
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Live current-scope preview
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shows the routing key the engine would compute for whatever entity the user
 * has selected RIGHT NOW (across all of tv-client). Helps the user decode
 * "what value goes in the editor for this page".
 */
function CurrentScopePreview({ rules }: { rules: SerializedRule[] }) {
  const entity = useSelectedEntity();
  const activeModule = useAppStore((s) => s.activeModule);

  if (!entity) {
    return (
      <div className="mb-3 px-3 py-2 rounded-md border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/40 text-[11px] text-zinc-500">
        No entity selected — open another tab or click an entity, then reopen
        Settings to see its scope.
      </div>
    );
  }

  const isModule = entity.type === "module";
  const scope = {
    entityType: entity.type,
    id: entity.id,
    subtype: entity.subtype,
  };
  const match = matchRoutingRule(scope, rules);

  const scopeLabel = isModule
    ? `module: ${entity.id}`
    : entity.subtype
      ? `${entity.type} / ${entity.subtype}`
      : entity.type;

  return (
    <div className="mb-3 px-3 py-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 text-[11px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-500">Currently in</span>
        <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-zinc-700 dark:text-zinc-300">
          {activeModule}
        </code>
        <span className="text-zinc-500">scope</span>
        <code className="px-1.5 py-0.5 rounded bg-emerald-500/15 font-mono text-emerald-700 dark:text-emerald-400">
          {scopeLabel}
        </code>
        <span className="text-zinc-500">→</span>
        <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-zinc-700 dark:text-zinc-300">
          {match.bot}
        </code>
        {match.isFallback ? (
          <span className="text-zinc-400">(no rule matched, fallback)</span>
        ) : (
          <span className="text-zinc-400">(rule #{match.ruleIndex + 1})</span>
        )}
      </div>
      {entity.name && entity.name !== "…" && (
        <div className="mt-1 text-[10px] text-zinc-400 truncate">
          Entity: <span className="font-mono">{entity.name}</span>
          {entity.id && entity.id !== entity.name && (
            <> · id: <span className="font-mono">{entity.id}</span></>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Scope glossary — describes every value that can appear in the editor
// ────────────────────────────────────────────────────────────────────────────

interface GlossaryItem {
  scope: string;
  description: string;
  example: string;
}

const ENTITY_GLOSSARY: GlossaryItem[] = [
  {
    scope: "task / deal",
    description: "A task whose parent project is a deal (project_type=deal)",
    example: "Click a task inside a Deal in the Projects pipeline",
  },
  {
    scope: "task / work",
    description: "A task whose parent project is a work project",
    example: "Click a task inside a Work project, or any row in the Tasks tab",
  },
  {
    scope: "task (no subtype)",
    description: "Loading state before the parent project type resolves",
    example: "Briefly during initial fetch — usually you won't see this",
  },
  { scope: "deal", description: "A project where project_type=deal", example: "Click a deal card in the Sales pipeline" },
  { scope: "project", description: "A work project", example: "Click a work project card" },
  { scope: "initiative", description: "An initiative grouping projects", example: "Click an initiative in the Projects manage view" },
  { scope: "company", description: "A CRM company row", example: "Select a company in CRM or Metadata's Companies tab" },
  { scope: "contact", description: "A CRM contact row", example: "Select a contact in CRM or Metadata's Contacts tab" },
  { scope: "domain", description: "A VAL domain", example: "Open a domain in the Domains module" },
  { scope: "skill", description: "A skill (by slug)", example: "Open a skill in the Skills module" },
  { scope: "mcp_tool", description: "An MCP tool registered in tv-mcp", example: "Open a tool in the MCP Tools module" },
  { scope: "blog_article", description: "A blog article", example: "Open an article in the Blog module" },
];

const MODULE_GLOSSARY: GlossaryItem[] = [
  { scope: "module: projects", description: "On Projects landing, no entity selected", example: "Open Projects tab, no project clicked" },
  { scope: "module: work", description: "On Tasks page, no task selected", example: "Open Tasks tab, no task selected" },
  { scope: "module: crm", description: "On CRM module, no company selected", example: "Open CRM tab" },
  { scope: "module: companies", description: "Metadata's Companies sub-tab, no row selected", example: "Metadata → Companies tab without selection" },
  { scope: "module: contacts", description: "Metadata's Contacts sub-tab, no row selected", example: "Metadata → Contacts tab without selection" },
  { scope: "module: email", description: "Email module top-level", example: "Open Email tab" },
  { scope: "module: domains", description: "Domains module top-level", example: "Open Domains tab" },
  { scope: "module: skills", description: "Skills module top-level", example: "Open Skills tab, no skill selected" },
  { scope: "module: mcp-tools", description: "MCP Tools module top-level", example: "Open MCP Tools tab, no tool selected" },
  { scope: "module: blog", description: "Blog module top-level", example: "Open Blog tab, no article selected" },
];

function ScopeGlossary() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-3 border border-zinc-200/60 dark:border-zinc-800/60 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <HelpCircle size={11} className="text-zinc-400" />
        <span className="font-medium">Scope reference</span>
        <span className="text-zinc-400">— what each value means and where it comes from</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/20 space-y-3">
          <GlossarySection title="Entity scopes" items={ENTITY_GLOSSARY} />
          <GlossarySection title="Module scopes (no entity selected)" items={MODULE_GLOSSARY} />
          <p className="text-[10px] text-zinc-400 pt-1">
            Tip: the green "Currently in …" chip above shows the live scope as you
            navigate. Open another tab, then reopen Settings to see how it changes.
          </p>
        </div>
      )}
    </div>
  );
}

function GlossarySection({ title, items }: { title: string; items: GlossaryItem[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.scope} className="flex items-start gap-2 text-[11px]">
            <code className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-zinc-700 dark:text-zinc-300 min-w-[140px]">
              {item.scope}
            </code>
            <div className="flex-1 min-w-0">
              <div className="text-zinc-700 dark:text-zinc-300">{item.description}</div>
              <div className="text-zinc-400 text-[10px]">{item.example}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Routing editor
// ────────────────────────────────────────────────────────────────────────────

const ENTITY_TYPE_OPTIONS = [
  "project",
  "deal",
  "task",
  "company",
  "contact",
  "initiative",
  "blog_article",
  "skill",
  "mcp_tool",
  "domain",
] as const;

const SUBTYPE_OPTIONS = ["", "deal", "work"] as const;

function describeMatch(rule: RoutingOverrideRule): string {
  if (rule.match.kind === "module") return `module: ${rule.match.module}`;
  const sub = rule.match.subtype ? ` / ${rule.match.subtype}` : "";
  return `${rule.match.entityType}${sub}`;
}

function RoutingEditor({
  rules,
  isCustom,
  onChange,
  onReset,
}: {
  rules: SerializedRule[];
  isCustom: boolean;
  onChange: (rules: SerializedRule[]) => void;
  onReset: () => void;
}) {
  // Resolve which rule the current selection matches so we can highlight it.
  const entity = useSelectedEntity();
  const liveMatch = entity
    ? matchRoutingRule(
        { entityType: entity.type, id: entity.id, subtype: entity.subtype },
        rules,
      )
    : null;
  const updateRule = (i: number, patch: Partial<SerializedRule>) => {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const updateMatch = (i: number, match: SerializedRule["match"]) => {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, match } : r)));
  };
  const removeRule = (i: number) => onChange(rules.filter((_, idx) => idx !== i));
  const addEntityRule = () =>
    onChange([
      ...rules,
      { match: { kind: "entity", entityType: "task" }, bot: "bot-mel" },
    ]);
  const addModuleRule = () =>
    onChange([
      ...rules,
      { match: { kind: "module", module: "work" }, bot: "bot-mel" },
    ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-zinc-500">
          {isCustom ? "Custom rules" : "Default rules"} · {rules.length} total
        </span>
        {isCustom && (
          <button
            onClick={onReset}
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-0.5 rounded"
          >
            <RotateCcw size={11} />
            Reset to defaults
          </button>
        )}
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-md divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
        {rules.map((rule, i) => (
          <RoutingRow
            key={i}
            rule={rule}
            highlighted={liveMatch?.ruleIndex === i}
            onChangeBot={(bot) => updateRule(i, { bot })}
            onChangeMatch={(match) => updateMatch(i, match)}
            onRemove={() => removeRule(i)}
          />
        ))}
        {rules.length === 0 && (
          <div className="px-3 py-3 text-center text-[11px] text-zinc-400">
            No rules — every chat will fall back to <code>bot-mel</code>.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={addEntityRule}
          className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800"
        >
          <Plus size={11} />
          Entity rule
        </button>
        <button
          onClick={addModuleRule}
          className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800"
        >
          <Plus size={11} />
          Module rule
        </button>
      </div>
    </div>
  );
}

function RoutingRow({
  rule,
  highlighted,
  onChangeBot,
  onChangeMatch,
  onRemove,
}: {
  rule: SerializedRule;
  highlighted?: boolean;
  onChangeBot: (bot: BotName) => void;
  onChangeMatch: (match: SerializedRule["match"]) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={
        "flex items-center gap-2 px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 " +
        (highlighted
          ? "bg-emerald-500/10 dark:bg-emerald-500/15 border-l-2 border-emerald-500"
          : "bg-white dark:bg-zinc-900")
      }
    >
      {rule.match.kind === "entity" ? (
        <>
          <select
            value={rule.match.entityType}
            onChange={(e) =>
              onChangeMatch({
                kind: "entity",
                entityType: e.target.value,
                subtype: rule.match.kind === "entity" ? rule.match.subtype : undefined,
              })
            }
            className="text-[11px] font-mono px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
          >
            {ENTITY_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={rule.match.subtype ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChangeMatch({
                kind: "entity",
                entityType: (rule.match as { kind: "entity"; entityType: string }).entityType,
                subtype: v ? v : undefined,
              });
            }}
            className="text-[11px] font-mono px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
            title="Subtype (used for tasks: deal vs work parent)"
          >
            {SUBTYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t || "—"}</option>
            ))}
          </select>
        </>
      ) : (
        <>
          <span className="text-[11px] font-mono text-zinc-400 px-2 py-1">module</span>
          <input
            type="text"
            value={rule.match.module}
            onChange={(e) => onChangeMatch({ kind: "module", module: e.target.value })}
            className="text-[11px] font-mono px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-32"
          />
        </>
      )}
      <span className="text-zinc-400">→</span>
      <select
        value={rule.bot}
        onChange={(e) => onChangeBot(e.target.value as BotName)}
        className="text-[11px] font-mono px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
      >
        {ALL_BOTS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <span className="ml-auto text-[10px] text-zinc-400 truncate">{describeMatch(rule)}</span>
      <button onClick={onRemove} className="text-zinc-400 hover:text-red-500 p-1" title="Delete rule">
        <Trash2 size={11} />
      </button>
    </div>
  );
}
