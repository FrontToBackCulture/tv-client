import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useRepoSettings } from "../../hooks/repos";

interface RepoSettingsDialogProps {
  onClose: () => void;
}

export function RepoSettingsDialog({ onClose }: RepoSettingsDialogProps) {
  const { repos, addRepo, removeRepo } = useRepoSettings();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    setError("");
    const parts = input.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError("Use format: owner/repo");
      return;
    }
    const [owner, repo] = parts;
    if (repos.some((r) => r.owner === owner && r.repo === repo)) {
      setError("Already tracked");
      return;
    }
    addRepo(owner, repo);
    setInput("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Manage Tracked Repos</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
          >
            <X size={16} />
          </button>
        </div>

        {/* Add form */}
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="owner/repo"
              className="flex-1 px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button
              onClick={handleAdd}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-teal-600 text-white hover:bg-teal-700"
            >
              <Plus size={14} />
              Add
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>

        {/* Repo list */}
        <div className="max-h-64 overflow-auto">
          {repos.map((r) => (
            <div
              key={`${r.owner}/${r.repo}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <span className="text-sm">
                <span className="text-zinc-400">{r.owner}/</span>
                {r.repo}
              </span>
              <button
                onClick={() => removeRepo(r.owner, r.repo)}
                className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
