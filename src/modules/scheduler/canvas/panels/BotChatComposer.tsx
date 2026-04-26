// Multi-line composer for bot-dedicated chats (always @bot-mel).
// Supports image paste, drag-drop, file picker, AND @user autocomplete so you
// can pull teammates into any thread. Images upload to Supabase storage and
// are included as markdown image links in the message body.

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Paperclip, X, Loader2, Image as ImageIcon, Bot, User } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import { useUsers } from "../../../../hooks/work";

interface Props {
  onSubmit: (body: string, attachmentUrls?: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface PendingAttachment {
  id: string;
  file: File;
  preview: string;
  url: string | null;
  uploading: boolean;
  error: string | null;
}

async function uploadToSupabase(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return data.publicUrl;
}

export function BotChatComposer({ onSubmit, placeholder, disabled }: Props) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // @mention autocomplete
  const { data: allUsers = [] } = useUsers();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return allUsers
      .filter((u) => u.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aBot = a.type === "bot" ? 0 : 1;
        const bBot = b.type === "bot" ? 0 : 1;
        if (aBot !== bBot) return aBot - bBot;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map((u) => ({ name: u.name, type: u.type as string }));
  }, [allUsers, mentionQuery]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [body]);

  function detectMention(value: string, cursorPos: number) {
    const before = value.slice(0, cursorPos);
    const m = before.match(/@([\w-]*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(name: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const before = body.slice(0, cursorPos);
    const after = body.slice(cursorPos);
    const triggerIdx = before.lastIndexOf("@");
    if (triggerIdx === -1) return;
    const newText = before.slice(0, triggerIdx) + `@${name} ` + after;
    setBody(newText);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = triggerIdx + name.length + 2; // @ + name + space
      ta.setSelectionRange(newPos, newPos);
    });
  }

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const newAttachments: PendingAttachment[] = list.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      url: null,
      uploading: true,
      error: null,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);

    // Upload each in parallel
    await Promise.all(
      newAttachments.map(async (att) => {
        try {
          const url = await uploadToSupabase(att.file);
          setAttachments((prev) =>
            prev.map((a) => (a.id === att.id ? { ...a, url, uploading: false } : a)),
          );
        } catch (e) {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === att.id
                ? { ...a, uploading: false, error: e instanceof Error ? e.message : "Upload failed" }
                : a,
            ),
          );
        }
      }),
    );
  }, []);

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const files = items.filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleSend() {
    const trimmed = body.trim();
    const uploadedUrls = attachments.filter((a) => a.url).map((a) => a.url!);
    if (!trimmed && uploadedUrls.length === 0) return;
    if (disabled) return;
    if (attachments.some((a) => a.uploading)) return; // Wait for uploads

    // Append attachments as markdown image links if any
    let finalBody = trimmed;
    if (uploadedUrls.length > 0) {
      const imageLinks = attachments
        .filter((a) => a.url)
        .map((a) => (a.file.type.startsWith("image/") ? `![${a.file.name}](${a.url})` : `[${a.file.name}](${a.url})`))
        .join("\n");
      finalBody = finalBody ? `${finalBody}\n\n${imageLinks}` : imageLinks;
    }

    onSubmit(finalBody, uploadedUrls);
    setBody("");
    // Clean up previews
    attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
    setAttachments([]);
  }

  const isUploading = attachments.some((a) => a.uploading);
  const canSend = !disabled && !isUploading && (body.trim().length > 0 || attachments.some((a) => a.url));

  return (
    <div
      className={`px-3 py-2 ${dragOver ? "bg-teal-50 dark:bg-teal-950/20" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative group w-14 h-14 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 overflow-hidden flex items-center justify-center"
            >
              {att.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.preview} alt={att.file.name} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={14} className="text-zinc-400" />
              )}
              {att.uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 size={14} className="animate-spin text-white" />
                </div>
              )}
              {att.error && (
                <div className="absolute inset-0 bg-red-500/70 flex items-center justify-center text-[8px] text-white text-center px-1">
                  Failed
                </div>
              )}
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-1.5 rounded-md text-zinc-400 hover:text-teal-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors shrink-0"
          title="Attach file"
        >
          <Paperclip size={14} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
            e.target.value = ""; // allow selecting same file again
          }}
          className="hidden"
        />
        <div className="flex-1 relative">
          {/* @mention dropdown */}
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden z-20 max-h-56 overflow-y-auto">
              {mentionMatches.map((m, i) => {
                const Icon = m.type === "bot" ? Bot : User;
                return (
                  <button
                    key={`${m.type}:${m.name}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(m.name);
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                      i === mentionIndex
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <Icon size={12} className={m.type === "bot" ? "text-purple-500" : "text-zinc-400"} />
                    <span className="text-zinc-700 dark:text-zinc-200">{m.name}</span>
                    <span className="ml-auto text-[10px] text-zinc-400">{m.type}</span>
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              detectMention(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && mentionMatches.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => Math.min(i + 1, mentionMatches.length - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(mentionMatches[mentionIndex].name);
                  return;
                }
                if (e.key === "Escape") {
                  setMentionQuery(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={handlePaste}
            placeholder={placeholder ?? "Message bot-mel..."}
            disabled={disabled}
            rows={1}
            className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 placeholder:text-zinc-400 disabled:opacity-50 resize-none leading-relaxed focus:outline-none focus:border-teal-500 dark:focus:border-teal-500"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="p-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 ml-0.5">
        Enter to send, Shift+Enter for newline, paste or drag images to attach
      </p>
    </div>
  );
}
