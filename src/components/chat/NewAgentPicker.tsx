// New Agent picker — popover invoked from the ActiveAgentsRail's "+ New Agent"
// button. Lets the user pick a scope (entity or module) and override the
// auto-routed bot before starting a fresh chat.
//
// On confirm:
//   1. If picked bot != routing default, store override keyed on the
//      entity_id the modal will use (`entity-chat:{type}:{id}`).
//   2. setSelected({type, id}) — modal rescopes; existing thread (if any)
//      shows up. Per Option 3, one thread per entity is the rule, so picking
//      an entity that already has a thread just opens that thread.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Search, X, Briefcase, Building2, User, ListChecks, Hash, BookOpen, Wrench, Globe, Mail, Megaphone, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useSelectedEntityStore, type EntityType } from "../../stores/selectedEntityStore";
import { matchRoutingRule, ALL_BOTS, type BotName } from "../../lib/botRouting";
import { useBotSettingsStore } from "../../stores/botSettingsStore";
import { setBotOverride, clearBotOverride } from "../../lib/botOverrides";
import { cn } from "../../lib/cn";

const BOT_PALETTE: Record<string, { gradient: string; text: string }> = {
  "bot-mel": { gradient: "from-purple-500 to-purple-700", text: "text-purple-500" },
  "bot-delivery": { gradient: "from-emerald-500 to-emerald-700", text: "text-emerald-500" },
  "bot-sales": { gradient: "from-amber-500 to-amber-700", text: "text-amber-600" },
  "bot-domain": { gradient: "from-cyan-500 to-cyan-700", text: "text-cyan-500" },
  "bot-builder": { gradient: "from-blue-500 to-blue-700", text: "text-blue-500" },
};
function botPalette(name: string) {
  return BOT_PALETTE[name] ?? BOT_PALETTE["bot-mel"];
}

interface ModuleOption {
  id: string;
  label: string;
  icon: typeof Briefcase;
}
// Mirrors botRouting module rules + a few extras worth picking from the menu.
const MODULES: ModuleOption[] = [
  { id: "work", label: "Work (all tasks)", icon: ListChecks },
  { id: "projects", label: "Projects", icon: Briefcase },
  { id: "crm", label: "CRM", icon: Building2 },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "contacts", label: "Contacts", icon: User },
  { id: "email", label: "Email", icon: Mail },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "skills", label: "Skills", icon: BookOpen },
  { id: "mcp-tools", label: "MCP Tools", icon: Wrench },
  { id: "blog", label: "Blog", icon: Megaphone },
];

interface PickerOption {
  kind: "entity" | "module";
  type: EntityType;
  id: string;
  name: string;
  /** Subtype for tasks/projects so routing picks deal-vs-work correctly. */
  subtype?: string;
  Icon: typeof Briefcase;
}

function entityIcon(type: EntityType): typeof Briefcase {
  switch (type) {
    case "task": return ListChecks;
    case "project": return Briefcase;
    case "deal": return Hash;
    case "company": return Building2;
    case "contact": return User;
    case "initiative": return Megaphone;
    case "blog_article": return BookOpen;
    case "skill": return BookOpen;
    case "mcp_tool": return Wrench;
    case "domain": return Globe;
    default: return Briefcase;
  }
}

// Search across the main entity tables in parallel. When `q` is empty,
// returns the most recently-updated entities so users always have rows to
// pick from (and don't think the picker only does modules).
async function searchEntities(q: string): Promise<PickerOption[]> {
  const term = q.trim();
  const isEmpty = term === "";
  const like = `%${term}%`;

  // Detect identifier-style queries like "WORK-42" / "DEAL-7" — search by
  // task_number against the parent project's identifier_prefix.
  const idMatch = term.match(/^([A-Za-z][A-Za-z0-9_-]*)-(\d+)$/);
  const idPrefix = idMatch?.[1]?.toUpperCase();
  const idNumber = idMatch ? Number(idMatch[2]) : null;

  const tasksQ = supabase
    .from("tasks")
    .select(
      "id, title, task_number, project:projects!tasks_project_id_fkey(project_type, identifier_prefix)",
    )
    .order("updated_at", { ascending: false })
    .limit(8);
  const projectsQ = supabase
    .from("projects")
    .select("id, name, project_type, identifier_prefix")
    .order("updated_at", { ascending: false })
    .limit(8);
  const companiesQ = supabase
    .from("crm_companies")
    .select("id, name")
    .order("updated_at", { ascending: false })
    .limit(6);
  const contactsQ = supabase
    .from("crm_contacts")
    .select("id, name")
    .order("updated_at", { ascending: false })
    .limit(6);

  // Apply filters only when searching — empty query returns the recents.
  if (!isEmpty) {
    if (idMatch && idNumber !== null) {
      tasksQ.eq("task_number", idNumber);
      projectsQ.ilike("name", like);
    } else {
      tasksQ.ilike("title", like);
      projectsQ.or(`name.ilike.${like},identifier_prefix.ilike.${like}`);
    }
    companiesQ.ilike("name", like);
    contactsQ.ilike("name", like);
  }

  const [tasksR, projectsR, companiesR, contactsR] = await Promise.all([
    tasksQ,
    projectsQ,
    companiesQ,
    contactsQ,
  ]);

  const out: PickerOption[] = [];

  for (const row of (tasksR.data ?? []) as Array<{
    id: string;
    title: string;
    task_number?: number | null;
    project: { project_type?: string; identifier_prefix?: string | null } | null;
  }>) {
    // If the user typed an identifier like "WORK-42", drop tasks whose parent
    // prefix doesn't match — task_number alone is not unique across projects.
    if (idMatch && idPrefix) {
      const prefix = (row.project?.identifier_prefix ?? "").toUpperCase();
      if (prefix !== idPrefix) continue;
    }
    const subtype = row.project?.project_type === "deal" ? "deal" : "work";
    const ident =
      row.project?.identifier_prefix && row.task_number != null
        ? `${row.project.identifier_prefix}-${row.task_number} · `
        : "";
    out.push({
      kind: "entity",
      type: "task",
      id: row.id,
      name: `${ident}${row.title}`,
      subtype,
      Icon: entityIcon("task"),
    });
  }
  for (const row of (projectsR.data ?? []) as Array<{
    id: string;
    name: string;
    project_type?: string;
    identifier_prefix?: string | null;
  }>) {
    const isDeal = row.project_type === "deal";
    const ident = row.identifier_prefix ? `${row.identifier_prefix} · ` : "";
    out.push({
      kind: "entity",
      type: isDeal ? "deal" : "project",
      id: row.id,
      name: `${ident}${row.name}`,
      subtype: isDeal ? "deal" : undefined,
      Icon: entityIcon(isDeal ? "deal" : "project"),
    });
  }
  for (const row of (companiesR.data ?? []) as Array<{ id: string; name: string }>) {
    out.push({ kind: "entity", type: "company", id: row.id, name: row.name, Icon: entityIcon("company") });
  }
  for (const row of (contactsR.data ?? []) as Array<{ id: string; name: string }>) {
    out.push({ kind: "entity", type: "contact", id: row.id, name: row.name, Icon: entityIcon("contact") });
  }

  return out;
}

function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

interface NewAgentPickerProps {
  onClose: () => void;
}

export function NewAgentPicker({ onClose }: NewAgentPickerProps) {
  const setSelected = useSelectedEntityStore((s) => s.setSelected);
  const routingOverrides = useBotSettingsStore((s) => s.routingOverrides);

  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pickedBot, setPickedBot] = useState<BotName | null>(null);
  const [selected, setSelectedOpt] = useState<PickerOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounced(query, 200);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Always fires — empty query returns recents. Avoids the "looks broken"
  // moment where typing nothing shows only modules and you don't realize
  // entity search exists.
  const searchQ = useQuery({
    queryKey: ["new-agent-picker-search", debouncedQuery],
    queryFn: () => searchEntities(debouncedQuery),
    staleTime: 30_000,
  });

  const isSearching = query.trim().length > 0;

  // When the user is searching, only keep modules whose label clearly
  // matches — entity rows take priority. When the search is empty, show the
  // full module list as the secondary section.
  const moduleOptions: PickerOption[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MODULES
      .filter((m) => term === "" || m.label.toLowerCase().includes(term) || m.id.includes(term))
      .map((m): PickerOption => ({
        kind: "module",
        type: "module",
        id: m.id,
        name: m.label,
        Icon: m.icon,
      }));
  }, [query]);

  const entityOptions = searchQ.data ?? [];

  // When searching: entities first (more specific), then matching modules.
  // When idle: modules first (the "menu" feel), then recents below.
  const flatOptions = useMemo(
    () => (isSearching ? [...entityOptions, ...moduleOptions] : [...moduleOptions, ...entityOptions]),
    [isSearching, entityOptions, moduleOptions],
  );

  // Reset highlight when option list changes shape.
  useEffect(() => {
    setHighlight(0);
  }, [debouncedQuery, flatOptions.length]);

  // Keep selected option in sync with the highlight when no explicit selection.
  useEffect(() => {
    if (!selected) return;
    // If the previously-selected option is no longer in the list, drop it.
    const stillThere = flatOptions.find((o) => o.kind === selected.kind && o.type === selected.type && o.id === selected.id);
    if (!stillThere) setSelectedOpt(null);
  }, [flatOptions, selected]);

  const activeOption = selected ?? flatOptions[highlight] ?? null;

  // Routing default for the active option — drives the bot dropdown's
  // initial value and the "(default)" badge.
  const routingDefault: BotName | null = useMemo(() => {
    if (!activeOption) return null;
    const m = matchRoutingRule(
      { entityType: activeOption.type, id: activeOption.id, subtype: activeOption.subtype },
      routingOverrides,
    );
    return m.bot;
  }, [activeOption, routingOverrides]);

  // When the active option (or its routing default) shifts, reset pickedBot
  // so the dropdown re-anchors to the new default.
  useEffect(() => {
    setPickedBot(null);
  }, [activeOption?.kind, activeOption?.type, activeOption?.id]);

  function confirm(opt: PickerOption | null = activeOption) {
    if (!opt) return;
    const entityChatId = `entity-chat:${opt.type}:${opt.id}`;
    const finalBot = pickedBot ?? routingDefault;
    if (finalBot && routingDefault && finalBot !== routingDefault) {
      setBotOverride(entityChatId, finalBot);
    } else {
      // Picked the routing default → clear any stale override from a previous pick.
      clearBotOverride(entityChatId);
    }
    setSelected({ type: opt.type, id: opt.id });
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(flatOptions.length - 1, 0)));
      setSelectedOpt(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      setSelectedOpt(null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[15vh] bg-black/30 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={onKey}
    >
      <div
        className="w-[560px] max-w-[92vw] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / search */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
          <Search size={14} className="text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a project, task (or WORK-42), company, contact…"
            className="flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
          />
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
            <X size={14} />
          </button>
        </div>

        {/* Options list — sections render in the same order as flatOptions
            so keyboard highlight matches the visual order. */}
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {(() => {
            const entityFirst = isSearching;
            const entityOffset = entityFirst ? 0 : moduleOptions.length;
            const moduleOffset = entityFirst ? entityOptions.length : 0;
            const entitySectionTitle = isSearching ? "Results" : "Recent";

            const entitySection = entityOptions.length > 0 && (
              <PickerSection key="entities" title={entitySectionTitle}>
                {entityOptions.map((opt, i) => {
                  const flatIdx = entityOffset + i;
                  const isActive = activeOption?.kind === "entity" && activeOption.type === opt.type && activeOption.id === opt.id;
                  const m = matchRoutingRule(
                    { entityType: opt.type, id: opt.id, subtype: opt.subtype },
                    routingOverrides,
                  );
                  return (
                    <PickerRow
                      key={`ent-${opt.type}-${opt.id}`}
                      opt={opt}
                      bot={m.bot}
                      isFallback={m.isFallback}
                      isActive={isActive}
                      isHighlight={!selected && flatIdx === highlight}
                      onClick={() => { setSelectedOpt(opt); setHighlight(flatIdx); }}
                      onDoubleClick={() => confirm(opt)}
                    />
                  );
                })}
              </PickerSection>
            );

            const moduleSection = moduleOptions.length > 0 && (
              <PickerSection key="modules" title="Modules">
                {moduleOptions.map((opt, i) => {
                  const flatIdx = moduleOffset + i;
                  const isActive = activeOption?.kind === "module" && activeOption.id === opt.id;
                  const m = matchRoutingRule({ entityType: "module", id: opt.id }, routingOverrides);
                  return (
                    <PickerRow
                      key={`mod-${opt.id}`}
                      opt={opt}
                      bot={m.bot}
                      isFallback={m.isFallback}
                      isActive={isActive}
                      isHighlight={!selected && flatIdx === highlight}
                      onClick={() => { setSelectedOpt(opt); setHighlight(flatIdx); }}
                      onDoubleClick={() => confirm(opt)}
                    />
                  );
                })}
              </PickerSection>
            );

            return entityFirst
              ? [entitySection, moduleSection]
              : [moduleSection, entitySection];
          })()}

          {searchQ.isLoading && (
            <div className="px-4 py-2 text-[11px] text-zinc-400">Searching…</div>
          )}

          {!searchQ.isLoading && isSearching && entityOptions.length === 0 && moduleOptions.length === 0 && (
            <div className="px-4 py-3 text-xs text-zinc-400">No matches.</div>
          )}
        </div>

        {/* Footer — bot picker + start button */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {activeOption ? (
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span>Bot:</span>
                <BotDropdown
                  value={pickedBot ?? routingDefault ?? "bot-mel"}
                  defaultBot={routingDefault}
                  onChange={(b) => setPickedBot(b)}
                />
              </div>
            ) : (
              <div className="text-[11px] text-zinc-400">Pick a scope to continue</div>
            )}
          </div>
          <button
            disabled={!activeOption}
            onClick={() => confirm()}
            className={cn(
              "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              activeOption
                ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60 cursor-not-allowed",
            )}
          >
            Start chat
          </button>
        </div>
      </div>
    </div>
  );
}

function PickerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      <div className="px-1.5">{children}</div>
    </div>
  );
}

interface PickerRowProps {
  opt: PickerOption;
  bot: BotName;
  isFallback: boolean;
  isActive: boolean;
  isHighlight: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

function PickerRow({ opt, bot, isFallback, isActive, isHighlight, onClick, onDoubleClick }: PickerRowProps) {
  const palette = botPalette(bot);
  const Icon = opt.Icon;
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors",
        isActive
          ? "bg-zinc-200/80 dark:bg-zinc-800/80"
          : isHighlight
            ? "bg-zinc-100 dark:bg-zinc-800/50"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/40",
      )}
    >
      <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800/60 flex items-center justify-center text-zinc-500 shrink-0">
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-zinc-900 dark:text-zinc-100 truncate">{opt.name}</div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider truncate">
          {opt.kind === "module" ? "module" : opt.subtype ? `${opt.type} · ${opt.subtype}` : opt.type}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn("w-4 h-4 rounded-full bg-gradient-to-br flex items-center justify-center text-white", palette.gradient)}>
          <Brain size={9} />
        </div>
        <span className={cn("text-[10.5px] font-medium font-mono", palette.text)}>
          {bot}
          {isFallback && <span className="ml-1 text-zinc-400 normal-case font-normal">(fallback)</span>}
        </span>
      </div>
    </button>
  );
}

function BotDropdown({ value, defaultBot, onChange }: { value: BotName; defaultBot: BotName | null; onChange: (b: BotName) => void }) {
  const [open, setOpen] = useState(false);
  const palette = botPalette(value);
  const isOverride = defaultBot !== null && value !== defaultBot;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
      >
        <div className={cn("w-3.5 h-3.5 rounded-full bg-gradient-to-br flex items-center justify-center text-white", palette.gradient)}>
          <Brain size={8} />
        </div>
        <span className={cn("text-[11px] font-mono font-medium", palette.text)}>{value}</span>
        {isOverride && <span className="text-[9px] text-amber-600 font-medium uppercase tracking-wider">override</span>}
        <ChevronDown size={10} className="text-zinc-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[121]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-[122] w-[180px] rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden">
            {ALL_BOTS.map((b) => {
              const p = botPalette(b);
              return (
                <button
                  key={b}
                  onClick={() => { onChange(b); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-mono transition-colors",
                    b === value ? "bg-zinc-100 dark:bg-zinc-800/60" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/40",
                    p.text,
                  )}
                >
                  <div className={cn("w-3.5 h-3.5 rounded-full bg-gradient-to-br flex items-center justify-center text-white shrink-0", p.gradient)}>
                    <Brain size={8} />
                  </div>
                  <span className="flex-1">{b}</span>
                  {b === defaultBot && <span className="text-[9px] text-zinc-400 normal-case font-sans">default</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
