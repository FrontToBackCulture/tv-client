import { useState, useEffect, useCallback } from "react";
import { X, Sparkles } from "lucide-react";
import { getWhatsNew, dismissWhatsNew, fetchWhatsNewNotes, type WhatsNewData } from "../hooks/useAppUpdate";
import { IconButton } from "../components/ui/IconButton";
import { Button } from "../components/ui/Button";

/** Parse "- commit message" lines into categorized entries */
function categorizeNotes(notes: string): { label: string; color: string; items: string[] }[] {
  const lines = notes
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter(Boolean);

  const categories: { label: string; color: string; patterns: RegExp; items: string[] }[] = [
    { label: "New", color: "bg-emerald-500", patterns: /^(Add|Implement|Create|Introduce|New|Enable)\b/i, items: [] },
    { label: "Improved", color: "bg-blue-500", patterns: /^(Improve|Update|Enhance|Refactor|Optimize|Migrate|Overhaul)\b/i, items: [] },
    { label: "Fixed", color: "bg-amber-500", patterns: /^(Fix|Resolve|Patch|Correct|Handle)\b/i, items: [] },
  ];

  const other: string[] = [];

  for (const line of lines) {
    const matched = categories.find((c) => c.patterns.test(line));
    if (matched) {
      matched.items.push(line);
    } else {
      other.push(line);
    }
  }

  // Put uncategorized into "Changes"
  if (other.length) {
    categories.push({ label: "Changes", color: "bg-zinc-500", patterns: /.*/, items: other });
  }

  return categories.filter((c) => c.items.length > 0);
}

// Global trigger — allows opening from Command Palette or console: window.__showWhatsNew()
let globalTrigger: ((data: WhatsNewData) => void) | null = null;

/** Programmatically show the What's New modal with custom data */
export function triggerWhatsNew(data: WhatsNewData) {
  globalTrigger?.(data);
}

export function WhatsNewModal() {
  const [data, setData] = useState<WhatsNewData | null>(null);

  // Register global trigger
  useEffect(() => {
    globalTrigger = (d) => setData(d);

    // Expose on window for console/dev access
    (window as any).__showWhatsNew = (version?: string, notes?: string) => {
      setData({
        version: version ?? __APP_VERSION__,
        notes: notes ?? "",
      });
    };

    return () => {
      globalTrigger = null;
      delete (window as any).__showWhatsNew;
    };
  }, []);

  // Auto-show on launch if version changed
  useEffect(() => {
    const timer = setTimeout(async () => {
      const whatsNew = getWhatsNew();
      if (!whatsNew) return;

      // If notes are empty (manual install, etc.), try fetching from latest.json
      if (!whatsNew.notes) {
        const fetched = await fetchWhatsNewNotes();
        if (fetched) whatsNew.notes = fetched;
      }

      setData(whatsNew);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    dismissWhatsNew();
    setData(null);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data, handleDismiss]);

  if (!data) return null;

  const categories = data.notes ? categorizeNotes(data.notes) : [];
  const hasNotes = categories.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  What's New
                </h2>
                <p className="text-sm text-zinc-500">
                  TV Desktop v{data.version}
                </p>
              </div>
            </div>
            <IconButton icon={X} size={18} label="Close" onClick={handleDismiss} />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-2 overflow-y-auto max-h-[calc(80vh-160px)]">
          {hasNotes ? (
            <div className="space-y-5">
              {categories.map((cat) => (
                <div key={cat.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${cat.color}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {cat.label}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {cat.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-sm text-zinc-700 dark:text-zinc-300 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-zinc-300 dark:before:bg-zinc-600"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
              Updated to the latest version.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <Button variant="primary" size="md" onClick={handleDismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
