// src/shell/CommandPalette.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  ArrowLeft,
  Send,
  Trash2,
  Loader2,
  Sparkles,
  FileText,
  Linkedin,
  Target,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, ModuleId } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { useHelpStore } from "../stores/helpStore";
import { useHelpChat } from "../hooks/useHelpChat";
import { getSuggestedQuestions } from "../lib/help/helpContent";
import { useViewContextStore } from "../stores/viewContextStore";
import { useCommandStore, Command } from "../stores/commandStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { HelpMessage } from "../components/help/HelpMessage";
import { triggerWhatsNew } from "./WhatsNewModal";

const moduleIcons: Record<ModuleId, typeof Library> = {
  home: Home,
  library: Library,
  projects: FolderOpen,
  metadata: Library,
  crm: Building2,
  work: CheckSquare,
  domains: Globe,
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
  linkedin: Linkedin,
  prospecting: Target,
};

const moduleLabels: Record<ModuleId, string> = {
  home: "Home",
  library: "Library",
  projects: "Projects",
  metadata: "Metadata",
  crm: "CRM",
  work: "Work",

  domains: "Domains",
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

type PaletteMode = "commands" | "help";

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

  // Help state
  const messages = useHelpStore((s) => s.messages);
  const isLoading = useHelpStore((s) => s.isLoading);
  const clearMessages = useHelpStore((s) => s.clearMessages);
  const { sendMessage } = useHelpChat();
  const viewLabel = useViewContextStore((s) => s.viewLabel);
  const viewDetail = useViewContextStore((s) => s.detail);
  const suggestedQuestions = getSuggestedQuestions(activeModule);

  const contextLabel = [
    MODULE_LABELS[activeModule] || activeModule,
    viewLabel,
    viewDetail,
  ].filter(Boolean).join(" \u2192 ");

  // Build general commands
  const generalCommands: Command[] = useMemo(() => {
    const ThemeIcon = theme === "dark" ? Sun : Moon;
    const cmds: Command[] = [];

    // Help — first item so it's immediately visible
    cmds.push({
      id: "help",
      label: "Ask Help...",
      description: "Ask a question about TV Desktop",
      icon: <HelpCircle size={15} />,
      shortcut: "\u2318/",
      section: "general",
      action: () => setMode("help"),
    });

    // Navigation
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

    // Utilities
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
          // Try to fetch notes from GitHub release for current version
          try {
            const res = await fetch(
              `https://api.github.com/repos/FrontToBackCulture/tv-client/releases/tags/v${__APP_VERSION__}`,
              { headers: { Accept: "application/vnd.github.v3+json" } }
            );
            if (res.ok) {
              const release = await res.json();
              // Extract the "What's New" section (changelog lines)
              const body: string = release.body ?? "";
              const whatsNewMatch = body.match(/## What's New\s*\n([\s\S]*?)(?=\n## |$)/);
              const notes = whatsNewMatch ? whatsNewMatch[1].trim() : body;
              triggerWhatsNew({ version: __APP_VERSION__, notes });
              return;
            }
          } catch { /* fall through */ }
          triggerWhatsNew({ version: __APP_VERSION__, notes: "" });
        },
      }
    );

    return cmds;
  }, [activeModule, theme, setActiveModule, toggleTheme]);

  // Filter and group (searches label + description)
  const { contextual, general } = useMemo(() => {
    const q = query.toLowerCase();
    const filterFn = (cmd: Command) =>
      cmd.label.toLowerCase().includes(q) ||
      (cmd.description?.toLowerCase().includes(q) ?? false);

    return {
      contextual: contextualCommands.filter(filterFn),
      general: generalCommands.filter(filterFn),
    };
  }, [query, contextualCommands, generalCommands]);

  // Flat list for keyboard navigation (contextual first, then general)
  const flatItems = useMemo(() => {
    const items: { command: Command; section: string }[] = [];
    contextual.forEach((cmd) => items.push({ command: cmd, section: "contextual" }));
    general.forEach((cmd) => items.push({ command: cmd, section: "general" }));
    return items;
  }, [contextual, general]);

  // Reset selection when query or items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, flatItems.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (mode === "help" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, mode]);

  // Focus help input when entering help mode
  useEffect(() => {
    if (mode === "help" && isOpen) {
      setTimeout(() => helpInputRef.current?.focus(), 50);
    }
  }, [mode, isOpen]);

  // \u2318K to open, \u2318/ to open help mode directly
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

  // Focus input when opened
  useEffect(() => {
    if (isOpen && mode === "commands") {
      inputRef.current?.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen, mode]);

  const executeCommand = useCallback(
    (command: Command) => {
      command.action();
      // Don't close if the action switches to help mode
      if (command.id !== "help") {
        setIsOpen(false);
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          executeCommand(flatItems[selectedIndex].command);
        }
      }
    },
    [flatItems, selectedIndex, executeCommand]
  );

  const handleHelpSend = useCallback(() => {
    if (!helpInput.trim() || isLoading) return;
    sendMessage(helpInput.trim());
    setHelpInput("");
  }, [helpInput, isLoading, sendMessage]);

  const handleHelpKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleHelpSend();
    }
    // Don't let Escape bubble to the palette's global handler when in help mode
    if (e.key === "Escape") {
      e.stopPropagation();
      setMode("commands");
    }
  }, [handleHelpSend]);

  if (!isOpen) return null;

  // Determine where section headers go in the flat list
  let contextualHeaderShown = false;
  let generalHeaderShown = false;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={() => { setIsOpen(false); setMode("commands"); }}
      />

      {/* Palette */}
      <div
        data-help-id="command-palette"
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-2xl animate-modal-in"
        onKeyDown={mode === "commands" ? handleKeyDown : undefined}
      >
        {mode === "commands" ? (
          <>
            {/* Search input */}
            <div className="flex items-center px-4 border-b border-zinc-200 dark:border-zinc-700">
              <Search size={16} className="text-zinc-400 dark:text-zinc-500" />
              <input
                ref={inputRef}
                data-help-id="command-palette-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command..."
                className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100"
              />
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 mr-2">
                ESC
              </kbd>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
              {flatItems.length === 0 && (
                <div className="px-4 py-6 text-sm text-zinc-400 dark:text-zinc-500 text-center">
                  No commands found
                </div>
              )}

              {flatItems.map((item, index) => {
                let header: string | null = null;

                if (item.section === "contextual" && !contextualHeaderShown) {
                  contextualHeaderShown = true;
                  header = moduleLabels[activeModule] ?? "Current View";
                } else if (item.section === "general" && !generalHeaderShown) {
                  generalHeaderShown = true;
                  header = "General";
                }

                return (
                  <div key={item.command.id}>
                    {header && (
                      <div className="px-4 pt-2 pb-1 first:pt-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {header}
                        </span>
                      </div>
                    )}
                    <button
                      data-selected={index === selectedIndex}
                      onClick={() => executeCommand(item.command)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        index === selectedIndex
                          ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                          : "text-zinc-700 dark:text-zinc-200"
                      )}
                    >
                      {item.command.icon && (
                        <span className={cn(
                          "flex-shrink-0 mt-0.5",
                          index === selectedIndex
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-zinc-400 dark:text-zinc-500"
                        )}>
                          {item.command.icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0 text-left">
                        <span className="block truncate">{item.command.label}</span>
                        {item.command.description && (
                          <span className={cn(
                            "block text-xs truncate mt-0.5",
                            index === selectedIndex
                              ? "text-teal-600/70 dark:text-teal-400/60"
                              : "text-zinc-400 dark:text-zinc-500"
                          )}>
                            {item.command.description}
                          </span>
                        )}
                      </div>
                      {item.command.shortcut && (
                        <kbd className="flex-shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                          {item.command.shortcut}
                        </kbd>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 font-medium">{"\u2191\u2193"}</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 font-medium">{"\u21B5"}</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 font-medium">esc</kbd>
                close
              </span>
            </div>
          </>
        ) : (
          /* Help chat mode */
          <>
            {/* Help header */}
            <div className="flex items-center px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setMode("commands")}
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 mr-2"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <HelpCircle size={16} className="text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Help</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {contextLabel}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearMessages}
                    className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
                    title="Clear conversation"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  onClick={() => { setIsOpen(false); setMode("commands"); }}
                  className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Chat messages */}
            <div ref={scrollRef} className="h-[50vh] overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Ask me anything about TV Desktop:</p>
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <HelpMessage key={msg.id} message={msg} />
                  ))}
                  {isLoading && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Loader2 size={12} className="animate-spin" />
                      Thinking...
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Chat input */}
            <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  ref={helpInputRef}
                  type="text"
                  value={helpInput}
                  onChange={(e) => setHelpInput(e.target.value)}
                  onKeyDown={handleHelpKeyDown}
                  placeholder="Ask a question..."
                  disabled={isLoading}
                  className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:border-teal-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 disabled:opacity-50"
                />
                <button
                  onClick={handleHelpSend}
                  disabled={isLoading || !helpInput.trim()}
                  className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
