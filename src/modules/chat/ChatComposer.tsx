// Chat composer — message input with @user, [[entity autocomplete, and image paste

import { useState, useRef, useMemo, useCallback } from "react";
import { Send, X, CornerDownLeft, Building2, CheckSquare, FolderOpen, User, ImagePlus, Loader2, Bot, Users } from "lucide-react";
import { useUsers } from "../../hooks/work";
import { useEntityMentionSearch, type EntitySearchResult } from "../../hooks/chat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

type MentionMode = "user" | "entity" | null;

interface ChatComposerProps {
  replyingTo?: string | null;
  onCancelReply?: () => void;
  onSubmit: (body: string, entityMentions: EntitySearchResult[], attachments?: string[]) => void;
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

/** Upload a file to Supabase Storage and return the public URL */
async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file, { contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from("chat-attachments")
    .getPublicUrl(path);

  return data.publicUrl;
}

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

  // Image attachments
  const [pendingImages, setPendingImages] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: allUsers = [] } = useUsers();
  const mentionableUsers = useMemo(
    () => allUsers.map((u) => ({ name: u.name, type: u.type })),
    [allUsers]
  );

  // Fetch teams for @team mentions
  const { data: teams = [] } = useQuery({
    queryKey: ["teams-for-mentions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, slug")
        .order("name");
      return (data ?? []) as { id: string; name: string; slug: string }[];
    },
  });

  const filteredMentions = useMemo(() => {
    if (mentionMode !== "user") return [];
    const q = mentionQuery.toLowerCase();

    // Filter users
    const matchedUsers = mentionableUsers
      .filter((u) => u.name.toLowerCase().includes(q))
      .map((u) => ({ name: u.name, kind: u.type as string })); // "human" | "bot"

    // Filter teams
    const matchedTeams = teams
      .filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
      .map((t) => ({ name: t.slug, kind: "team" as string, displayName: t.name }));

    // Sort: bots → teams → humans
    const all = [...matchedUsers, ...matchedTeams];
    all.sort((a, b) => {
      const order = { bot: 0, team: 1, human: 2 };
      const oa = order[a.kind as keyof typeof order] ?? 2;
      const ob = order[b.kind as keyof typeof order] ?? 2;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
    return all.slice(0, 10);
  }, [mentionMode, mentionQuery, mentionableUsers, teams]);

  const { data: entityResults = [] } = useEntityMentionSearch(
    mentionMode === "entity" ? mentionQuery : ""
  );

  const dropdownItems = useMemo(() => {
    if (mentionMode === "user") {
      return filteredMentions.map((m) => ({
        key: `${m.kind}:${m.name}`,
        label: (m as { displayName?: string }).displayName || m.name,
        mentionName: m.name, // what gets inserted as @name
        sublabel: m.kind,
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
  }, [mentionMode, filteredMentions, entityResults]);

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
      const name = (item as { mentionName?: string }).mentionName || item.label;
      insertMention(`@${name}`, "@");
    } else if (mentionMode === "entity") {
      const entityItem = item as typeof item & { entityResult: EntitySearchResult };
      insertMention(`[[${entityItem.entityResult.type}:${entityItem.label}|${entityItem.entityResult.id}]]`, "[[");
      entityMentionsRef.current.push(entityItem.entityResult);
    }
  }

  // Handle paste events for images
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          addImageFile(file);
        }
        return;
      }
    }
  }

  // Handle drag and drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        addImageFile(file);
      }
    }
  }

  function addImageFile(file: File) {
    const preview = URL.createObjectURL(file);
    setPendingImages((prev) => [...prev, { file, preview }]);
  }

  function removeImage(index: number) {
    setPendingImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
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

  async function handleSubmit() {
    const trimmed = body.trim();
    const hasContent = trimmed || pendingImages.length > 0;
    if (!hasContent || disabled || uploading) return;

    // Upload images first
    let attachmentUrls: string[] = [];
    if (pendingImages.length > 0) {
      setUploading(true);
      try {
        attachmentUrls = await Promise.all(
          pendingImages.map((img) => uploadImage(img.file))
        );
      } catch (err) {
        console.error("[chat] Image upload failed:", err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // Clean up previews
    pendingImages.forEach((img) => URL.revokeObjectURL(img.preview));

    onSubmit(
      trimmed || (attachmentUrls.length > 0 ? "(image)" : ""),
      entityMentionsRef.current,
      attachmentUrls.length > 0 ? attachmentUrls : undefined
    );
    setBody("");
    setPendingImages([]);
    setMentionMode(null);
    entityMentionsRef.current = [];
    inputRef.current?.focus();
  }

  return (
    <div
      className="border-t border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3 relative flex-shrink-0"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Autocomplete dropdown */}
      {mentionMode && dropdownItems.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden z-10 max-h-48 overflow-y-auto animate-fade-slide-in">
          {mentionMode === "entity" && (
            <div className="px-2.5 py-1.5 border-b border-[var(--border-default)]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Entities</span>
            </div>
          )}
          {dropdownItems.map((item, i) => {
            const kind = item.sublabel; // "bot" | "team" | "human"
            const isUser = item.type === "user";
            const EntityIcon = isUser
              ? (kind === "bot" ? Bot : kind === "team" ? Users : User)
              : (entityIcons[item.type as keyof typeof entityIcons] || User);
            const accent = isUser
              ? (kind === "bot" ? "text-[var(--color-purple)]" : kind === "team" ? "text-[var(--color-info)]" : "text-[var(--color-accent)]")
              : (entityAccents[item.type as keyof typeof entityAccents] || "text-[var(--color-accent)]");

            // Show section headers when kind changes
            const prevKind = i > 0 ? dropdownItems[i - 1].sublabel : null;
            const showHeader = isUser && kind !== prevKind;

            const sectionLabels: Record<string, string> = { bot: "Bots", team: "Teams", human: "People" };

            return (
              <div key={item.key}>
                {showHeader && (
                  <div className="px-2.5 py-1.5 border-b border-[var(--border-default)]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {sectionLabels[kind] || "Other"}
                    </span>
                  </div>
                )}
                <button
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
                </button>
              </div>
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

      {/* Image previews */}
      {pendingImages.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative group/img">
              <img
                src={img.preview}
                alt="attachment"
                className="h-20 rounded-lg border border-[var(--border-default)] object-cover"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-error)] opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end min-w-0">
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={inputRef}
            value={body}
            onChange={handleInputChange}
            onPaste={handlePaste}
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
        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors duration-150"
          title="Attach image"
        >
          <ImagePlus size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files) {
              for (const file of files) {
                if (file.type.startsWith("image/")) addImageFile(file);
              }
            }
            e.target.value = "";
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={(!body.trim() && pendingImages.length === 0) || disabled || uploading}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
          title="Send (⌘+Enter)"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
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
        <span className="text-[10px] text-[var(--text-muted)]">
          paste or drop images
        </span>
      </div>
    </div>
  );
}
