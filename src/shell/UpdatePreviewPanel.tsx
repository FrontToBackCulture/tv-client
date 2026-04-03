import { Download } from "lucide-react";

interface UpdatePreviewPanelProps {
  version: string;
  notes: string | null;
  onInstall: () => void;
  onClose: () => void;
}

export function UpdatePreviewPanel({ version, notes, onInstall, onClose }: UpdatePreviewPanelProps) {
  const lines = (notes ?? "")
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter(Boolean);

  return (
    <div className="absolute bottom-full left-0 mb-1 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden animate-modal-in">
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
          v{version} available
        </span>
      </div>

      <div className="max-h-48 overflow-y-auto px-3 py-2">
        {lines.length > 0 ? (
          <ul className="space-y-1">
            {lines.map((line, i) => (
              <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500 mt-1.5 flex-shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500">Bug fixes and improvements.</p>
        )}
      </div>

      <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Later
        </button>
        <button
          onClick={onInstall}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
        >
          <Download size={12} />
          Install & Restart
        </button>
      </div>
    </div>
  );
}
