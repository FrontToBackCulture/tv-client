import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useRepoSettings } from "../../hooks/repos";
import { Button, IconButton } from "../../components/ui";

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
          <IconButton icon={X} label="Close" onClick={onClose} />
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
            <Button icon={Plus} onClick={handleAdd}>
              Add
            </Button>
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
              <IconButton
                icon={Trash2}
                size={14}
                variant="danger"
                label="Remove"
                onClick={() => removeRepo(r.owner, r.repo)}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
