// src/modules/library/RepositorySwitcher.tsx

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  FolderOpen,
  Plus,
  Check,
  Trash2,
  Database,
  Pencil,
} from "lucide-react";
import { useRepository, Repository } from "../../stores/repositoryStore";
import { cn } from "../../lib/cn";

interface RepositorySwitcherProps {
  onRepositoryChange?: () => void;
}

export function RepositorySwitcher({ onRepositoryChange }: RepositorySwitcherProps) {
  const {
    repositories,
    activeRepository,
    addRepository,
    removeRepository,
    renameRepository,
    setActiveRepository,
  } = useRepository();
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");

  const handleSelect = (repo: Repository) => {
    setActiveRepository(repo.id);
    setIsOpen(false);
    onRepositoryChange?.();
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Knowledge Base Folder",
      });
      if (selected && typeof selected === "string") {
        setNewPath(selected);
        // Auto-fill name from folder name
        const folderName = selected.split("/").pop() || "Repository";
        if (!newName) {
          setNewName(folderName);
        }
      }
    } catch (err) {
      console.error("Failed to open folder picker:", err);
    }
  };

  const handleAdd = () => {
    if (newName && newPath) {
      addRepository(newName, newPath);
      setNewName("");
      setNewPath("");
      setIsAdding(false);
      setIsOpen(false);
      onRepositoryChange?.();
    }
  };

  const handleRemove = (e: React.MouseEvent, repoId: string) => {
    e.stopPropagation();
    if (repositories.length > 1) {
      removeRepository(repoId);
    }
  };

  const handleStartRename = (e: React.MouseEvent, repo: Repository) => {
    e.stopPropagation();
    setEditingId(repo.id);
    setEditName(repo.name);
  };

  const handleConfirmRename = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editingId && editName.trim()) {
      renameRepository(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <Database size={16} className="text-teal-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate flex-1">
          {activeRepository?.name || "Select Repository"}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "text-zinc-500 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setIsAdding(false);
            }}
          />

          {/* Menu */}
          <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[320px]">
            {/* Repository list */}
            <div className="max-h-64 overflow-y-auto">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => handleSelect(repo)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
                    repo.id === activeRepository?.id
                      ? "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-300"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  )}
                >
                  <FolderOpen size={14} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === repo.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleConfirmRename(e);
                          if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-0.5 bg-white dark:bg-zinc-800 border border-teal-500 rounded text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <div className="text-sm font-medium truncate">
                        {repo.name}
                      </div>
                    )}
                    <div className="text-xs text-zinc-500 dark:text-zinc-500 truncate">
                      {repo.path}
                    </div>
                  </div>
                  {editingId === repo.id ? (
                    <button
                      onClick={handleConfirmRename}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded"
                      title="Confirm rename"
                    >
                      <Check size={12} className="text-teal-500" />
                    </button>
                  ) : repo.id === activeRepository?.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleStartRename(e, repo)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-opacity"
                        title="Rename repository"
                      >
                        <Pencil size={12} className="text-zinc-500 dark:text-zinc-400" />
                      </button>
                      <Check size={14} className="text-teal-500 dark:text-teal-400 flex-shrink-0" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleStartRename(e, repo)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-opacity"
                        title="Rename repository"
                      >
                        <Pencil size={12} className="text-zinc-500 dark:text-zinc-400" />
                      </button>
                      {repositories.length > 1 && (
                        <button
                          onClick={(e) => handleRemove(e, repo.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-opacity"
                          title="Remove repository"
                        >
                          <Trash2 size={12} className="text-zinc-500 dark:text-zinc-400" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 dark:border-zinc-800" />

            {/* Add new section */}
            {isAdding ? (
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My Knowledge Base"
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded text-sm text-zinc-800 dark:text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:border-teal-600"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-500 mb-1">Folder Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                      placeholder="/path/to/folder"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded text-sm text-zinc-800 dark:text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:border-teal-600"
                    />
                    <button
                      onClick={handleBrowse}
                      className="px-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap"
                    >
                      Browse...
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => {
                      setIsAdding(false);
                      setNewName("");
                      setNewPath("");
                    }}
                    className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!newName || !newPath}
                    className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Plus size={14} />
                Add Repository
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
