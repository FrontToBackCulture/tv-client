// src/shell/CommandPalette.tsx

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { openModuleInNewWindow } from "../lib/windowManager";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeModule, setActiveModule, toggleTheme, theme } = useAppStore();

  const commands: Command[] = [
    {
      id: "new-window",
      label: "Open Current Module in New Window",
      shortcut: "⇧⌘N",
      action: () => openModuleInNewWindow(activeModule),
    },
    {
      id: "library",
      label: "Go to Library",
      shortcut: "⌘1",
      action: () => setActiveModule("library"),
    },
    {
      id: "work",
      label: "Go to Work",
      shortcut: "⌘2",
      action: () => setActiveModule("work"),
    },
    {
      id: "crm",
      label: "Go to CRM",
      shortcut: "⌘3",
      action: () => setActiveModule("crm"),
    },
    {
      id: "inbox",
      label: "Go to Inbox",
      shortcut: "⌘4",
      action: () => setActiveModule("inbox"),
    },
    {
      id: "theme",
      label: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
      action: () => toggleTheme(),
    },
    { id: "sync", label: "Sync Now", action: () => console.log("Sync") },
    {
      id: "settings",
      label: "Open Settings",
      action: () => setActiveModule("settings"),
    },
    {
      id: "toggle-side-panel",
      label: "Toggle Document Panel",
      shortcut: "⌘.",
      action: () => useSidePanelStore.getState().togglePanel(),
    },
    {
      id: "open-side-panel",
      label: "Open Document in Side Panel...",
      action: () => {
        const store = useSidePanelStore.getState();
        store.openPicker();
        if (!store.isOpen) {
          useSidePanelStore.setState({ isOpen: true, isPickerOpen: true });
        }
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  // ⌘K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const executeCommand = (command: Command) => {
    command.action();
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 shadow-2xl">
        {/* Search input */}
        <div className="flex items-center px-4 border-b border-slate-200 dark:border-zinc-700">
          <Search size={16} className="text-zinc-400 dark:text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => executeCommand(cmd)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm rounded text-zinc-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{cmd.shortcut}</span>
              )}
            </button>
          ))}
          {filteredCommands.length === 0 && (
            <div className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
