// src/shell/CommandPalette.tsx

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Search,
  X,
  Home,
  Library,
  CheckSquare,
  Mail,
  Building2,
  Globe,
  Boxes,
  Bot,
  Settings,
  PanelRight,
  Moon,
  Sun,
  ExternalLink,
  Puzzle,
  Clock,
  GitBranch,
  FolderOpen,
  GalleryHorizontalEnd,
  HelpCircle,
  MailPlus,
  Send,
  Trash2,
  Loader2,
  Sparkles,
  FileText,
  Linkedin,
  Target,
  SearchX,
  CornerDownLeft,
  ChevronRight,
  MessageCircle,
  Command as CommandIcon,
  ArrowUpDown,
  User,
  Handshake,
  Milestone,
  MailCheck,
  Database,
  Activity,
  MessageSquare,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, ModuleId } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { useHelpStore } from "../stores/helpStore";
import { useHelpChat } from "../hooks/useHelpChat";
import { getSuggestedQuestions } from "../lib/help/helpContent";
import { useViewContextStore } from "../stores/viewContextStore";
import { useCommandStore, Command } from "../stores/commandStore";
import { useNotificationNavStore } from "../stores/notificationNavStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { HelpMessage } from "../components/help/HelpMessage";
import { triggerWhatsNew } from "./WhatsNewModal";
import {
  useUnifiedSearch,
  SearchEntityType,
  SearchResult as UnifiedSearchResult,
} from "../hooks/useUnifiedSearch";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENTS_KEY = "tv-cmd-recents";
const MAX_RECENTS = 5;

const moduleIcons: Record<ModuleId, typeof Library> = {
  home: Home,
  library: Library,
  projects: FolderOpen,
  metadata: Library,
  crm: Building2,
  work: CheckSquare,
  domains: Globe,
  analytics: Activity,
  product: Boxes,
  gallery: GalleryHorizontalEnd,
  bot: Bot,
  skills: Puzzle,
  scheduler: Clock,
  repos: GitBranch,
  inbox: Mail,
  calendar: Clock,
  portal: Settings,
  email: MailPlus,
  blog: FileText,
  s3browser: Globe,
  chat: MessageSquare,
  linkedin: Linkedin,
  prospecting: Target,
  "public-data": Database,
};

const moduleLabels: Record<ModuleId, string> = {
  home: "Home",
  library: "Library",
  projects: "Projects",
  metadata: "Metadata",
  chat: "Chat",
  crm: "CRM",
  work: "Work",
  domains: "Domains",
  analytics: "Analytics",
  product: "Product",
  gallery: "Gallery",
  bot: "Bots",
  skills: "Skills",
  scheduler: "Scheduler",
  repos: "Repos",
  inbox: "Inbox",
  calendar: "Calendar",
  portal: "Portal",
  email: "EDM",
  blog: "Blog",
  s3browser: "S3 Browser",
  linkedin: "LinkedIn",
  prospecting: "Outbound",
  "public-data": "Public Data",
};

const MODULE_LABELS: Record<string, string> = {
  library: "Library",
  crm: "CRM",
  work: "Work",
  domains: "Domains",
  product: "Product",
  bot: "Bots",
  inbox: "Inbox",
  settings: "Settings",
};

// ---------------------------------------------------------------------------
// Fuzzy match helpers
// ---------------------------------------------------------------------------

interface MatchSpan {
  start: number;
  end: number;
}

/** Simple subsequence fuzzy match — returns spans of matched characters or null */
function fuzzyMatch(text: string, query: string): MatchSpan[] | null {
  if (!query) return [];
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const spans: MatchSpan[] = [];
  let qi = 0;

  for (let i = 0; i < lower.length && qi < qLower.length; i++) {
    if (lower[i] === qLower[qi]) {
      const start = i;
      // Greedily consume consecutive matches
      while (i < lower.length && qi < qLower.length && lower[i] === qLower[qi]) {
        i++;
        qi++;
      }
      spans.push({ start, end: i });
      i--; // outer loop will increment
    }
  }

  return qi === qLower.length ? spans : null;
}

/** Score a match — prefer earlier matches, contiguous spans, and word-boundary hits */
function matchScore(text: string, spans: MatchSpan[]): number {
  if (spans.length === 0) return 0;
  let score = 100;
  // Prefer fewer fragments (more contiguous)
  score -= (spans.length - 1) * 10;
  // Prefer earlier first match
  score -= spans[0].start * 2;
  // Bonus for word-boundary matches
  for (const s of spans) {
    if (s.start === 0 || text[s.start - 1] === " ") score += 15;
  }
  return score;
}

/** Render text with highlighted match spans */
function HighlightedText({
  text,
  spans,
  isSelected,
}: {
  text: string;
  spans: MatchSpan[];
  isSelected: boolean;
}) {
  if (spans.length === 0) return <>{text}</>;
  const parts: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (cursor < s.start) parts.push({ text: text.slice(cursor, s.start), matched: false });
    parts.push({ text: text.slice(s.start, s.end), matched: true });
    cursor = s.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });

  return (
    <>
      {parts.map((p, i) =>
        p.matched ? (
          <span
            key={i}
            className={cn(
              "font-semibold",
              isSelected ? "text-teal-100 dark:text-white" : "text-teal-700 dark:text-teal-300"
            )}
          >
            {p.text}
          </span>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Recents persistence (localStorage)
// ---------------------------------------------------------------------------

function getRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  const list = getRecents().filter((r) => r !== id);
  list.unshift(id);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
}

// ---------------------------------------------------------------------------
// Debounce hook for search input
// ---------------------------------------------------------------------------

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Entity search helpers
// ---------------------------------------------------------------------------

const ENTITY_ICONS: Record<SearchEntityType, typeof Building2> = {
  company: Building2,
  contact: User,
  deal: Handshake,
  project: FolderOpen,
  task: CheckSquare,
  initiative: Milestone,
  campaign: MailCheck,
};

const ENTITY_BADGE_COLORS: Record<SearchEntityType, string> = {
  company: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  contact: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  deal: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  project: "bg-teal-500/15 text-teal-400 border-teal-500/20",
  task: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  initiative: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  campaign: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
};

const ENTITY_MODULE_MAP: Record<SearchEntityType, ModuleId> = {
  company: "crm",
  contact: "crm",
  deal: "crm",
  task: "work",
  project: "projects",
  initiative: "projects",
  campaign: "email",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaletteMode = "commands" | "help";

interface ScoredItem {
  command: Command;
  section: string;
  labelSpans: MatchSpan[];
  descSpans: MatchSpan[];
  score: number;
}

// ---------------------------------------------------------------------------
// Kbd component — consistent keyboard shortcut badges
// ---------------------------------------------------------------------------

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium leading-none",
        "rounded-[4px] border",
        "text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
        "font-mono",
        className
      )}
    >
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("commands");
  const [query, setQuery] = useState("");
  const [helpInput, setHelpInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const theme = useAppStore((s) => s.theme);
  const contextualCommands = useCommandStore((s) => s.contextualCommands);

  // Unified search
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: searchGroups, isFetching: isSearching } = useUnifiedSearch(
    debouncedQuery,
    { enabled: isOpen && mode === "commands" }
  );
  const searchResultCount = searchGroups?.reduce((s, g) => s + g.results.length, 0) ?? 0;

  // Help state
  const messages = useHelpStore((s) => s.messages);
  const isLoading = useHelpStore((s) => s.isLoading);
  const clearMessages = useHelpStore((s) => s.clearMessages);
  const { sendMessage } = useHelpChat();
  const viewLabel = useViewContextStore((s) => s.viewLabel);
  const viewDetail = useViewContextStore((s) => s.detail);
  const suggestedQuestions = getSuggestedQuestions(activeModule);

  // Build breadcrumb parts for display
  const breadcrumbs = [
    MODULE_LABELS[activeModule] || moduleLabels[activeModule] || activeModule,
    viewLabel,
    viewDetail,
  ].filter(Boolean) as string[];

  // -------------------------------------------------------------------------
  // General commands (same as original)
  // -------------------------------------------------------------------------

  const generalCommands: Command[] = useMemo(() => {
    const ThemeIcon = theme === "dark" ? Sun : Moon;
    const cmds: Command[] = [];

    cmds.push({
      id: "help",
      label: "Ask Help...",
      description: "Ask a question about TV Desktop",
      icon: <HelpCircle size={15} />,
      shortcut: "\u2318/",
      section: "general",
      action: () => setMode("help"),
    });

    (Object.keys(moduleIcons) as ModuleId[]).forEach((id) => {
      const Icon = moduleIcons[id];
      const shortcutMap: Partial<Record<ModuleId, string>> = {
        library: "\u23181",
        crm: "\u23182",
        work: "\u23183",
        product: "\u23184",
        bot: "\u23185",
        skills: "\u23186",
        scheduler: "\u23187",
        repos: "\u23188",
      };
      cmds.push({
        id: `go-${id}`,
        label: `Go to ${moduleLabels[id]}`,
        icon: <Icon size={15} />,
        shortcut: shortcutMap[id],
        section: "general",
        action: () => setActiveModule(id),
      });
    });

    cmds.push(
      {
        id: "new-window",
        label: "Open Current Module in New Window",
        description: "Pop out the active module into a separate window",
        icon: <ExternalLink size={15} />,
        shortcut: "\u21E7\u2318N",
        section: "general",
        action: () => openModuleInNewWindow(activeModule),
      },
      {
        id: "theme",
        label: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
        description: "Toggle between light and dark appearance",
        icon: <ThemeIcon size={15} />,
        section: "general",
        action: () => toggleTheme(),
      },
      {
        id: "settings",
        label: "Open Settings",
        description: "API keys, sync paths, MCP endpoints, and more",
        icon: <Settings size={15} />,
        shortcut: "\u2318,",
        section: "general",
        action: () => useAppStore.getState().openSettings(),
      },
      {
        id: "toggle-side-panel",
        label: "Toggle Document Panel",
        description: "Show or hide the side document viewer",
        icon: <PanelRight size={15} />,
        shortcut: "\u2318.",
        section: "general",
        action: () => useSidePanelStore.getState().togglePanel(),
      },
      {
        id: "open-side-panel",
        label: "Open Document in Side Panel...",
        description: "Browse and open a file in the side panel",
        icon: <PanelRight size={15} />,
        section: "general",
        action: () => {
          const store = useSidePanelStore.getState();
          store.openPicker();
          if (!store.isOpen) {
            useSidePanelStore.setState({ isOpen: true, isPickerOpen: true });
          }
        },
      },
      {
        id: "whats-new",
        label: "What's New",
        description: "Show release notes for the current version",
        icon: <Sparkles size={15} />,
        section: "general",
        action: async () => {
          try {
            const res = await fetch(
              `https://api.github.com/repos/FrontToBackCulture/tv-client/releases/tags/v${__APP_VERSION__}`,
              { headers: { Accept: "application/vnd.github.v3+json" } }
            );
            if (res.ok) {
              const release = await res.json();
              const body: string = release.body ?? "";
              const whatsNewMatch = body.match(
                /## What's New\s*\n([\s\S]*?)(?=\n## |$)/
              );
              const notes = whatsNewMatch ? whatsNewMatch[1].trim() : body;
              triggerWhatsNew({ version: __APP_VERSION__, notes });
              return;
            }
          } catch {
            /* fall through */
          }
          triggerWhatsNew({ version: __APP_VERSION__, notes: "" });
        },
      }
    );

    return cmds;
  }, [activeModule, theme, setActiveModule, toggleTheme]);

  // -------------------------------------------------------------------------
  // All commands map (for recent lookup)
  // -------------------------------------------------------------------------

  const allCommandsMap = useMemo(() => {
    const map = new Map<string, Command>();
    for (const cmd of contextualCommands) map.set(cmd.id, cmd);
    for (const cmd of generalCommands) map.set(cmd.id, cmd);
    return map;
  }, [contextualCommands, generalCommands]);

  // -------------------------------------------------------------------------
  // Fuzzy filter + score + sort
  // -------------------------------------------------------------------------

  const { scoredItems, isFiltered } = useMemo(() => {
    const q = query.trim();
    const isFiltered = q.length > 0;

    const score = (cmd: Command, section: string): ScoredItem | null => {
      const labelMatch = fuzzyMatch(cmd.label, q);
      const descMatch = cmd.description ? fuzzyMatch(cmd.description, q) : null;

      if (isFiltered && !labelMatch && !descMatch) return null;

      const labelScore = labelMatch ? matchScore(cmd.label, labelMatch) : -100;
      const descScore = descMatch ? matchScore(cmd.description!, descMatch) * 0.6 : -100;

      return {
        command: cmd,
        section,
        labelSpans: labelMatch || [],
        descSpans: descMatch || [],
        score: Math.max(labelScore, descScore),
      };
    };

    const items: ScoredItem[] = [];
    for (const cmd of contextualCommands) {
      const s = score(cmd, "contextual");
      if (s) items.push(s);
    }
    for (const cmd of generalCommands) {
      const s = score(cmd, "general");
      if (s) items.push(s);
    }

    if (isFiltered) {
      items.sort((a, b) => b.score - a.score);
    }

    return { scoredItems: items, isFiltered };
  }, [query, contextualCommands, generalCommands]);

  // -------------------------------------------------------------------------
  // Recent commands (shown when query is empty)
  // -------------------------------------------------------------------------

  const recentItems = useMemo((): ScoredItem[] => {
    if (isFiltered) return [];
    const ids = getRecents();
    const items: ScoredItem[] = [];
    for (const id of ids) {
      const cmd = allCommandsMap.get(id);
      if (cmd) {
        items.push({
          command: cmd,
          section: "recent",
          labelSpans: [],
          descSpans: [],
          score: 0,
        });
      }
    }
    return items;
  }, [isFiltered, allCommandsMap]);

  // Build display groups
  const groups = useMemo(() => {
    if (isFiltered) {
      // When searching: single flat sorted list, no section headers
      return [{ label: null, items: scoredItems }];
    }

    // When browsing: recents, then contextual, then general
    const g: { label: string | null; items: ScoredItem[] }[] = [];
    if (recentItems.length > 0) g.push({ label: "Recent", items: recentItems });

    const ctxItems = scoredItems.filter((i) => i.section === "contextual");
    if (ctxItems.length > 0)
      g.push({ label: moduleLabels[activeModule] ?? "Current View", items: ctxItems });

    const genItems = scoredItems.filter((i) => i.section === "general");
    if (genItems.length > 0) g.push({ label: "General", items: genItems });

    return g;
  }, [isFiltered, scoredItems, recentItems, activeModule]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, flatItems.length, searchResultCount]);

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    if (mode === "help" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, mode]);

  useEffect(() => {
    if (mode === "help" && isOpen) {
      setTimeout(() => helpInputRef.current?.focus(), 50);
    }
  }, [mode, isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) {
            setMode("commands");
            return false;
          }
          return true;
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setIsOpen(true);
        setMode("help");
      }
      if (e.key === "Escape") {
        if (mode === "help") {
          setMode("commands");
        } else {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode]);

  useEffect(() => {
    if (isOpen && mode === "commands") {
      inputRef.current?.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen, mode]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const executeCommand = useCallback(
    (command: Command) => {
      pushRecent(command.id);
      command.action();
      if (command.id !== "help") {
        setIsOpen(false);
      }
    },
    []
  );

  const navigateToEntity = useCallback(
    (result: UnifiedSearchResult) => {
      const module = ENTITY_MODULE_MAP[result.entity_type];
      setActiveModule(module);
      useNotificationNavStore
        .getState()
        .setTarget(result.entity_type, result.entity_id, false);
      setIsOpen(false);
    },
    [setActiveModule]
  );

  // Flatten search results for keyboard nav (appended after command items)
  const flatSearchResults = useMemo(
    () => searchGroups?.flatMap((g) => g.results) ?? [],
    [searchGroups]
  );
  const totalItems = flatItems.length + flatSearchResults.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex < flatItems.length) {
          if (flatItems[selectedIndex]) {
            executeCommand(flatItems[selectedIndex].command);
          }
        } else {
          const searchIdx = selectedIndex - flatItems.length;
          if (flatSearchResults[searchIdx]) {
            navigateToEntity(flatSearchResults[searchIdx]);
          }
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        setMode("help");
      }
    },
    [flatItems, flatSearchResults, totalItems, selectedIndex, executeCommand, navigateToEntity]
  );

  const handleHelpSend = useCallback(() => {
    if (!helpInput.trim() || isLoading) return;
    sendMessage(helpInput.trim());
    setHelpInput("");
  }, [helpInput, isLoading, sendMessage]);

  const handleHelpKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleHelpSend();
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        setMode("commands");
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setMode("commands");
      }
    },
    [handleHelpSend]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Build a running index for flat selection tracking across groups
  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              setIsOpen(false);
              setMode("commands");
            }}
          />

          {/* Palette container */}
          <motion.div
            data-help-id="command-palette"
            className={cn(
              "relative w-full max-w-[640px] overflow-hidden",
              "bg-white dark:bg-slate-900",
              "rounded-xl border border-slate-200 dark:border-slate-700/80",
              "shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]"
            )}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            onKeyDown={mode === "commands" ? handleKeyDown : undefined}
          >
            {/* ============================================================= */}
            {/* COMMANDS MODE                                                  */}
            {/* ============================================================= */}
            <AnimatePresence mode="wait">
              {mode === "commands" ? (
                <motion.div
                  key="commands"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.12 }}
                >
                  {/* Search bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-150 dark:border-slate-700/80">
                    <Search
                      size={15}
                      strokeWidth={2.5}
                      className="flex-shrink-0 text-slate-400 dark:text-slate-500"
                    />
                    <input
                      ref={inputRef}
                      data-help-id="command-palette-search"
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search commands and data..."
                      className={cn(
                        "flex-1 bg-transparent text-[13px] outline-none",
                        "text-slate-900 dark:text-slate-100",
                        "placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      )}
                    />

                    {/* Breadcrumb context */}
                    {breadcrumbs.length > 0 && !query && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                        {breadcrumbs.map((crumb, i) => (
                          <Fragment key={i}>
                            {i > 0 && (
                              <ChevronRight
                                size={10}
                                className="text-slate-300 dark:text-slate-600"
                              />
                            )}
                            <span className="truncate max-w-[80px]">{crumb}</span>
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Results */}
                  <div
                    ref={listRef}
                    className="max-h-[min(60vh,400px)] overflow-y-auto scrollbar-auto-hide py-1"
                  >
                    {flatItems.length === 0 && debouncedQuery.length < 2 && (
                      <div className="flex flex-col items-center justify-center py-10 px-6 gap-2">
                        <SearchX
                          size={28}
                          strokeWidth={1.5}
                          className="text-slate-300 dark:text-slate-600"
                        />
                        <p className="text-[13px] text-slate-400 dark:text-slate-500">
                          No commands matching{" "}
                          <span className="font-medium text-slate-500 dark:text-slate-400">
                            "{query}"
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Try a shorter query or press{" "}
                          <Kbd>Tab</Kbd> to ask Help
                        </p>
                      </div>
                    )}

                    {groups.map((group, gi) => {
                      const groupStartIndex = flatIndex;
                      return (
                        <div key={gi}>
                          {group.label && (
                            <div className="px-4 pt-3 pb-1.5 first:pt-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                {group.label}
                              </span>
                            </div>
                          )}
                          {group.items.map((item, ii) => {
                            const idx = groupStartIndex + ii;
                            const isSelected = idx === selectedIndex;
                            // Track flatIndex for next group
                            if (gi === groups.length - 1 && ii === group.items.length - 1) {
                              flatIndex = idx + 1;
                            }

                            return (
                              <motion.button
                                key={item.command.id}
                                data-selected={isSelected}
                                onClick={() => executeCommand(item.command)}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                initial={isFiltered ? { opacity: 0, y: 4 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.12,
                                  delay: isFiltered ? Math.min(ii * 0.02, 0.1) : 0,
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-4 py-[7px] text-[13px] transition-all duration-100",
                                  "rounded-none",
                                  isSelected
                                    ? "bg-teal-600 dark:bg-teal-600 text-white"
                                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                )}
                              >
                                {/* Icon */}
                                {item.command.icon && (
                                  <span
                                    className={cn(
                                      "flex-shrink-0 transition-colors duration-100",
                                      isSelected
                                        ? "text-teal-200"
                                        : "text-slate-400 dark:text-slate-500"
                                    )}
                                  >
                                    {item.command.icon}
                                  </span>
                                )}

                                {/* Label + description */}
                                <div className="flex-1 min-w-0 text-left">
                                  <span className="block truncate leading-snug">
                                    <HighlightedText
                                      text={item.command.label}
                                      spans={item.labelSpans}
                                      isSelected={isSelected}
                                    />
                                  </span>
                                  {item.command.description && (
                                    <span
                                      className={cn(
                                        "block text-[11px] truncate mt-px leading-snug",
                                        isSelected
                                          ? "text-teal-200/80"
                                          : "text-slate-400 dark:text-slate-500"
                                      )}
                                    >
                                      <HighlightedText
                                        text={item.command.description}
                                        spans={item.descSpans}
                                        isSelected={isSelected}
                                      />
                                    </span>
                                  )}
                                </div>

                                {/* Shortcut */}
                                {item.command.shortcut && (
                                  <span
                                    className={cn(
                                      "flex-shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-[4px] border",
                                      isSelected
                                        ? "text-teal-200 bg-teal-500/30 border-teal-400/30"
                                        : "text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                    )}
                                  >
                                    {item.command.shortcut}
                                  </span>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {/* Update flatIndex after render */}
                    <span className="hidden">{(flatIndex = groups.reduce((s, g) => s + g.items.length, 0))}</span>

                    {/* ── Unified search results ── */}
                    {debouncedQuery.length >= 2 && (
                      <div>
                        {(searchGroups?.length ?? 0) > 0 && (
                          <div className="mx-4 my-1 border-t border-slate-150 dark:border-slate-700/60" />
                        )}

                        {isSearching && !searchGroups?.length && (
                          <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-slate-400 dark:text-slate-500">
                            <Loader2 size={12} className="animate-spin" />
                            Searching...
                          </div>
                        )}

                        {searchGroups?.map((group) => {
                          return (
                            <div key={group.type}>
                              <div className="px-4 pt-3 pb-1.5">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                  {group.label}
                                </span>
                              </div>
                              {group.results.map((result) => {
                                const globalIdx =
                                  flatItems.length +
                                  flatSearchResults.indexOf(result);
                                const isSelected = globalIdx === selectedIndex;
                                const Icon = ENTITY_ICONS[result.entity_type];
                                return (
                                  <motion.button
                                    key={`${result.entity_type}-${result.entity_id}`}
                                    data-selected={isSelected}
                                    onClick={() => navigateToEntity(result)}
                                    onMouseEnter={() =>
                                      setSelectedIndex(globalIdx)
                                    }
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.12 }}
                                    className={cn(
                                      "w-full flex items-center gap-3 px-4 py-[7px] text-[13px] transition-all duration-100",
                                      "rounded-none",
                                      isSelected
                                        ? "bg-teal-600 dark:bg-teal-600 text-white"
                                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "flex-shrink-0 transition-colors duration-100",
                                        isSelected
                                          ? "text-teal-200"
                                          : "text-slate-400 dark:text-slate-500"
                                      )}
                                    >
                                      <Icon size={15} />
                                    </span>
                                    <div className="flex-1 min-w-0 text-left">
                                      <span className="block truncate leading-snug">
                                        {result.title}
                                      </span>
                                      {result.subtitle && (
                                        <span
                                          className={cn(
                                            "block text-[11px] truncate mt-px leading-snug",
                                            isSelected
                                              ? "text-teal-200/80"
                                              : "text-slate-400 dark:text-slate-500"
                                          )}
                                        >
                                          {result.subtitle}
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={cn(
                                        "flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded border capitalize",
                                        isSelected
                                          ? "text-teal-200 bg-teal-500/30 border-teal-400/30"
                                          : ENTITY_BADGE_COLORS[result.entity_type]
                                      )}
                                    >
                                      {result.entity_type}
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          );
                        })}

                        {!isSearching &&
                          searchGroups?.length === 0 &&
                          flatItems.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 px-6 gap-2">
                              <SearchX
                                size={28}
                                strokeWidth={1.5}
                                className="text-slate-300 dark:text-slate-600"
                              />
                              <p className="text-[13px] text-slate-400 dark:text-slate-500">
                                No results for{" "}
                                <span className="font-medium text-slate-500 dark:text-slate-400">
                                  "{debouncedQuery}"
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Try a shorter query or press{" "}
                                <Kbd>Tab</Kbd> to ask Help
                              </p>
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-slate-150 dark:border-slate-700/80">
                    <div className="flex items-center gap-2.5 text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1">
                        <ArrowUpDown size={11} strokeWidth={2} />
                        navigate
                      </span>
                      <span className="flex items-center gap-1">
                        <CornerDownLeft size={11} strokeWidth={2} />
                        open
                      </span>
                      <span className="flex items-center gap-1">
                        <Kbd className="!text-[9px] !h-4 !min-w-[16px]">esc</Kbd>
                        close
                      </span>
                    </div>

                    {/* Mode switcher — we're in commands mode here */}
                    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
                      <button
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm"
                      >
                        <CommandIcon size={10} />
                        Commands
                      </button>
                      <button
                        onClick={() => setMode("help")}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600"
                      >
                        <MessageCircle size={10} />
                        Help
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* ============================================================= */
                /* HELP MODE                                                      */
                /* ============================================================= */
                <motion.div
                  key="help"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.12 }}
                >
                  {/* Help header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-150 dark:border-slate-700/80">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-teal-50 dark:bg-teal-900/30">
                        <HelpCircle
                          size={14}
                          strokeWidth={2}
                          className="text-teal-600 dark:text-teal-400"
                        />
                      </div>
                      <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                        Help
                      </span>
                      {breadcrumbs.length > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                          <span className="text-slate-300 dark:text-slate-600">|</span>
                          {breadcrumbs.map((crumb, i) => (
                            <Fragment key={i}>
                              {i > 0 && (
                                <ChevronRight
                                  size={10}
                                  className="text-slate-300 dark:text-slate-600"
                                />
                              )}
                              <span className="truncate max-w-[80px]">{crumb}</span>
                            </Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {messages.length > 0 && (
                        <button
                          onClick={clearMessages}
                          className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Clear conversation"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          setMode("commands");
                        }}
                        className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Chat messages */}
                  <div
                    ref={scrollRef}
                    className="h-[min(50vh,360px)] overflow-y-auto scrollbar-auto-hide p-4 space-y-3"
                  >
                    {messages.length === 0 ? (
                      <motion.div
                        className="space-y-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.05, duration: 0.15 }}
                      >
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                          Suggested questions
                        </p>
                        <div className="grid gap-1.5">
                          {suggestedQuestions.map((q, i) => (
                            <motion.button
                              key={q}
                              onClick={() => sendMessage(q)}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.03 * i, duration: 0.15 }}
                              className={cn(
                                "flex items-start gap-2.5 w-full text-left text-[13px] px-3 py-2.5",
                                "rounded-lg border border-slate-200 dark:border-slate-700/80",
                                "text-slate-600 dark:text-slate-300",
                                "hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-teal-300 dark:hover:border-teal-700",
                                "transition-all duration-100"
                              )}
                            >
                              <MessageCircle
                                size={13}
                                className="flex-shrink-0 mt-0.5 text-slate-400 dark:text-slate-500"
                              />
                              <span className="leading-snug">{q}</span>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    ) : (
                      <>
                        {messages.map((msg) => (
                          <HelpMessage key={msg.id} message={msg} />
                        ))}
                        {isLoading && (
                          <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-slate-500">
                            <Loader2 size={12} className="animate-spin text-teal-500" />
                            <span>Thinking...</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Chat input */}
                  <div className="border-t border-slate-150 dark:border-slate-700/80 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        ref={helpInputRef}
                        type="text"
                        value={helpInput}
                        onChange={(e) => setHelpInput(e.target.value)}
                        onKeyDown={handleHelpKeyDown}
                        placeholder="Ask a question..."
                        disabled={isLoading}
                        className={cn(
                          "flex-1 text-[13px] bg-slate-50 dark:bg-slate-800",
                          "border border-slate-200 dark:border-slate-700",
                          "rounded-lg px-3 py-1.5 outline-none",
                          "focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20",
                          "text-slate-900 dark:text-slate-100",
                          "placeholder:text-slate-400 dark:placeholder:text-slate-500",
                          "disabled:opacity-50 transition-all"
                        )}
                      />
                      <button
                        onClick={handleHelpSend}
                        disabled={isLoading || !helpInput.trim()}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          helpInput.trim() && !isLoading
                            ? "bg-teal-600 text-white hover:bg-teal-700 shadow-sm"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                        )}
                      >
                        <Send size={13} />
                      </button>
                    </div>

                    {/* Footer with mode switcher */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <CornerDownLeft size={11} strokeWidth={2} />
                          send
                        </span>
                        <span className="flex items-center gap-1">
                          <Kbd className="!text-[9px] !h-4 !min-w-[16px]">esc</Kbd>
                          back
                        </span>
                      </div>

                      {/* Mode switcher — we're in help mode here */}
                      <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
                        <button
                          onClick={() => setMode("commands")}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600"
                        >
                          <CommandIcon size={10} />
                          Commands
                        </button>
                        <button
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm"
                        >
                          <MessageCircle size={10} />
                          Help
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
