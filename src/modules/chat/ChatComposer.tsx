// Chat composer — message input with @user and [[entity autocomplete

import { useState, useRef, useMemo, useCallback } from "react";
import { Send, X, CornerDownLeft, Building2, CheckSquare, FolderOpen, User } from "lucide-react";
import { useUsers } from "../../hooks/work";
import { useEntityMentionSearch, type EntitySearchResult } from "../../hooks/chat";

type MentionMode = "user" | "entity" | null;

interface ChatComposerProps {
  replyingTo?: string | null;
  onCancelReply?: () => void;
  onSubmit: (body: string, entityMentions: EntitySearchResult[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

const entityIcons = {
  company: Building2,
  task: CheckSquare,
  project: FolderOpen,
};

const entityAccents = {
  company: "text-[var(--color-info)]",
  task: "text-[var(--color-warning)]",
  project: "text-[var(--color-purple)]",
};

export function ChatComposer({
  replyingTo,
  onCancelReply,
  onSubmit,
  placeholder,
  disabled,
}: ChatComposerProps) {
  const [body, setBody] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [mentionMode, setMentionMode] = useState<MentionMode>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const { data: allUsers = [] } = useUsers();
  const mentionableUsers = useMemo(
    () => allUsers.map((u) => ({ name: u.name, type: u.type })),
    [allUsers]
  );

  const filteredUsers = useMemo(() => {
    if (mentionMode !== "user") return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionMode, mentionQuery, mentionableUsers]);

  const { data: entityResults = [] } = useEntityMentionSearch(
    mentionMode === "entity" ? mentionQuery : ""
  );

  const dropdownItems = useMemo(() => {
    if (mentionMode === "user") {
      return filteredUsers.map((u) => ({
        key: `user:${u.name}`,
        label: u.name,
        sublabel: u.type,
        type: "user" as const,
      }));
    }
    if (mentionMode === "entity") {
      return entityResults.map((e) => ({
        key: `${e.type}:${e.id}`,
        label: e.label,
        sublabel: e.type,
        type: e.type,
        entityResult: e,
      }));
    }
    return [];
  }, [mentionMode, filteredUsers, entityResults]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setBody(value);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);

      const entityMatch = textBeforeCursor.match(/\[\[([\w\s]*)$/);
      if (entityMatch) {
        setMentionMode("entity");
        setMentionQuery(entityMatch[1]);
        setMentionIndex(0);
        return;
      }

      const atMatch = textBeforeCursor.match(/@([\w-]*)$/);
      if (atMatch) {
        setMentionMode("user");
        setMentionQuery(atMatch[1]);
        setMentionIndex(0);
        return;
      }

      setMentionMode(null);
    },
    []
  );

  const insertMention = useCallback(
    (text: string, trigger: string) => {
      const textarea = inputRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = body.slice(0, cursorPos);
      const textAfterCursor = body.slice(cursorPos);

      const triggerIdx = trigger === "[["
        ? textBeforeCursor.lastIndexOf("[[")
        : textBeforeCursor.lastIndexOf("@");

      const newText = textBeforeCursor.slice(0, triggerIdx) + text + " " + textAfterCursor;
      setBody(newText);
      setMentionMode(null);

      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = triggerIdx + text.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [body]
  );

  const entityMentionsRef = useRef<EntitySearchResult[]>([]);

  function handleSelectItem(index: number) {
    const item = dropdownItems[index];
    if (!item) return;

    if (mentionMode === "user") {
      insertMention(`@${item.label}`, "@");
    } else if (mentionMode === "entity") {
      const entityItem = item as typeof item & { entityResult: EntitySearchResult };
      insertMention(`[[${entityItem.entityResult.type}:${entityItem.label}|${entityItem.entityResult.id}]]`, "[[");
      entityMentionsRef.current.push(entityItem.entityResult);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMode && dropdownItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, dropdownItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectItem(mentionIndex);
        return;
      }
      if (e.key === "Escape") {
        setMentionMode(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed || disabled) return;

    onSubmit(trimmed, entityMentionsRef.current);
    setBody("");
    setMentionMode(null);
    entityMentionsRef.current = [];
    inputRef.current?.focus();
  }

  return (
    <div className="border-t border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3 relative flex-shrink-0">
      {/* Autocomplete dropdown */}
      {mentionMode && dropdownItems.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden z-10 max-h-48 overflow-y-auto animate-fade-slide-in">
          <div className="px-2.5 py-1.5 border-b border-[var(--border-default)]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {mentionMode === "user" ? "People" : "Entities"}
            </span>
          </div>
          {dropdownItems.map((item, i) => {
            const EntityIcon = item.type !== "user" ? entityIcons[item.type as keyof typeof entityIcons] : User;
            const accent = item.type !== "user" ? entityAccents[item.type as keyof typeof entityAccents] : "text-[var(--color-accent)]";
            return (
              <button
                key={item.key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectItem(i);
                }}
                className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2.5 transition-colors duration-100 ${
                  i === mentionIndex
                    ? "bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)]"
                    : "hover:bg-[var(--bg-muted)] dark:hover:bg-[var(--bg-muted)]"
                }`}
              >
                <EntityIcon size={13} className={accent} />
                <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-auto capitalize">{item.sublabel}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center gap-1.5 mb-2 px-0.5">
          <CornerDownLeft size={11} className="text-[var(--color-accent)]" />
          <span className="text-[11px] font-medium text-[var(--color-accent)]">
            Replying to thread
          </span>
          <button
            onClick={onCancelReply}
            className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      )}

      <div className="flex gap-2 items-end min-w-0">
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={inputRef}
            value={body}
            onChange={handleInputChange}
            placeholder={placeholder || (replyingTo ? "Write a reply..." : "Message — @ to mention, [[ to link")}
            rows={1}
            className="w-full text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl px-3.5 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-shadow duration-150 overflow-x-hidden overflow-y-auto"
            style={{ maxHeight: 120 }}
            onKeyDown={handleKeyDown}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || disabled}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
          title="Send (⌘+Enter)"
        >
          <Send size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-1.5 px-1">
        <span className="text-[10px] text-[var(--text-muted)]">
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-muted)] text-[9px] font-mono">⌘↵</kbd> send
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-muted)] text-[9px] font-mono">@</kbd> mention
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-muted)] text-[9px] font-mono">[[</kbd> link
        </span>
      </div>
    </div>
  );
}
