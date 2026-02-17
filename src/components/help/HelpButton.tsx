// src/components/help/HelpButton.tsx

import { HelpCircle } from "lucide-react";
import { cn } from "../../lib/cn";
import { useHelpStore } from "../../stores/helpStore";

export function HelpButton() {
  const isOpen = useHelpStore((s) => s.isOpen);
  const toggle = useHelpStore((s) => s.toggle);

  return (
    <button
      data-help-button
      onClick={toggle}
      className={cn(
        "fixed bottom-4 right-4 z-40 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors",
        isOpen
          ? "bg-teal-600 text-white hover:bg-teal-700"
          : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700"
      )}
      title="Help (⌘/)"
    >
      <HelpCircle size={20} />
    </button>
  );
}
