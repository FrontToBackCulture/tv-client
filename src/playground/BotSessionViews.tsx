// BotPlayground: Session detail, sessions timeline, commands, and back button

import { useState } from "react";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Zap,
  MoreHorizontal,
  Eye,
  Pencil,
  Save,
} from "lucide-react";
import { useListDirectory, useReadFile, useWriteFile } from "../hooks/useFiles";
import { cn } from "../lib/cn";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";
import { relativeDate } from "./botPlaygroundTypes";

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mb-4"
    >
      <ArrowLeft size={14} />
      <span>{label}</span>
    </button>
  );
}

export function SessionDetail({
  sessionPath,
  date,
  title,
  onBack,
}: {
  sessionPath: string;
  date: string;
  title: string | null;
  onBack: () => void;
}) {
  const { data: content, isLoading } = useReadFile(sessionPath);
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const writeFile = useWriteFile();

  const handleEdit = () => {
    setEditContent(content || "");
    setIsDirty(false);
    setViewMode("edit");
  };

  const handleSave = () => {
    writeFile.mutate(
      { path: sessionPath, content: editContent },
      { onSuccess: () => { setIsDirty(false); setViewMode("preview"); } }
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <BackButton label="Back to overview" onClick={onBack} />

        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-blue-500" />
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {title || `Session Notes - ${date}`}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                {relativeDate(date)} &middot; {date}
                {isDirty && <span className="ml-2 text-amber-500">Unsaved</span>}
                {writeFile.isPending && <span className="ml-2">Saving...</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {viewMode === "edit" ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || writeFile.isPending}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    isDirty ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  <Save size={12} />
                  Save
                </button>
                <button
                  onClick={() => { setViewMode("preview"); setIsDirty(false); }}
                  className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setViewMode("preview")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === "preview"
                      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  )}
                  title="Preview"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={handleEdit}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : viewMode === "edit" ? (
          <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <textarea
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); setIsDirty(true); }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
              }}
              className="w-full min-h-[500px] px-5 py-4 text-sm text-zinc-700 dark:text-zinc-300 bg-transparent font-mono leading-relaxed resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden px-6 py-5">
            <MarkdownViewer content={content || "(empty)"} filename="notes.md" />
          </div>
        )}
      </div>
    </div>
  );
}

export function CommandListView({
  commandsDir,
  onBack,
}: {
  commandsDir: string;
  onBack: () => void;
}) {
  const { data: entries = [], isLoading } = useListDirectory(commandsDir);
  const commands = entries.filter((e) => !e.is_directory && e.name.endsWith(".md"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <BackButton label="Back to overview" onClick={onBack} />

        <div className="flex items-center gap-2 mb-1">
          <Zap size={16} className="text-teal-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Commands</h1>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          {commands.length} slash command{commands.length !== 1 ? "s" : ""} defined
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : commands.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
            <Zap size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs text-zinc-400">No commands defined</p>
          </div>
        ) : (
          <div className="space-y-2">
            {commands.map((cmd) => (
              <CommandRow key={cmd.path} path={cmd.path} name={cmd.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommandRow({ path, name }: { path: string; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: content, isLoading } = useReadFile(expanded ? path : undefined);
  const cmdName = name.replace(/\.md$/, "");

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <Zap size={13} className="text-teal-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1">/{cmdName}</span>
        <MoreHorizontal size={14} className="text-zinc-400" />
      </button>
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {isLoading ? (
            <div className="px-4 py-3 flex items-center gap-2 text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : (
            <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
              {content || "(empty)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionsTimeline({
  sessions,
  selectedPath,
  onSessionClick,
}: {
  sessions: { date: string; title: string | null; summary: string | null; path: string; owner?: string }[];
  selectedPath: string | null;
  onSessionClick: (s: { date: string; title: string | null; summary: string | null; path: string }) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="w-[280px] flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-center text-zinc-400">
        <div className="text-center">
          <Clock size={24} className="mx-auto mb-2 opacity-20" />
          <p className="text-xs">No sessions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-y-auto">
      <div className="p-2 space-y-0.5">
        {sessions.map((s) => (
          <button
            key={s.path}
            onClick={() => onSessionClick(s)}
            className={cn(
              "w-full text-left px-2.5 py-2 rounded-md transition-colors",
              selectedPath === s.path
                ? "bg-teal-50 dark:bg-teal-950/30"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            )}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{relativeDate(s.date)}</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{s.date}</span>
              {s.owner && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 capitalize">{s.owner}</span>
              )}
            </div>
            {s.title && (
              <p className={cn(
                "text-xs font-medium truncate",
                selectedPath === s.path
                  ? "text-teal-700 dark:text-teal-300"
                  : "text-zinc-700 dark:text-zinc-300"
              )} title={s.title}>{s.title}</p>
            )}
            {s.summary && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-1 mt-0.5">{s.summary}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
