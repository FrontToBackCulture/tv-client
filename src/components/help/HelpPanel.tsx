// src/components/help/HelpPanel.tsx

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, X, Loader2 } from "lucide-react";
import { useHelpStore } from "../../stores/helpStore";
import { useHelpChat } from "../../hooks/useHelpChat";
import { getSuggestedQuestions } from "../../lib/help/helpContent";
import { useAppStore } from "../../stores/appStore";
import { useViewContextStore } from "../../stores/viewContextStore";
import { HelpMessage } from "./HelpMessage";

const MODULE_LABELS: Record<string, string> = {
  library: "Library",
  crm: "CRM",
  work: "Work",
  product: "Product",
  bot: "Bots",
  inbox: "Inbox",
  system: "System",
  settings: "Settings",
};

const MIN_W = 320;
const MIN_H = 360;
const MAX_W = 640;
const DEFAULT_W = 380;
const DEFAULT_H = 520;

type Edge = "top" | "left" | "top-left";

export function HelpPanel() {
  const isOpen = useHelpStore((s) => s.isOpen);
  const close = useHelpStore((s) => s.close);
  const messages = useHelpStore((s) => s.messages);
  const isLoading = useHelpStore((s) => s.isLoading);
  const clearMessages = useHelpStore((s) => s.clearMessages);
  const { sendMessage } = useHelpChat();
  const activeModule = useAppStore((s) => s.activeModule);
  const viewLabel = useViewContextStore((s) => s.viewLabel);
  const viewDetail = useViewContextStore((s) => s.detail);
  const suggestedQuestions = getSuggestedQuestions(activeModule);

  const contextLabel = [
    MODULE_LABELS[activeModule] || activeModule,
    viewLabel,
    viewDetail,
  ].filter(Boolean).join(" → ");

  const [input, setInput] = useState("");
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dragging.current) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-help-button]")) return;
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  // Resize via edge drag — panel is anchored bottom-right, so dragging
  // left increases width, dragging up increases height
  const onEdgeDown = useCallback((edge: Edge, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };

    const onMove = (ev: MouseEvent) => {
      const dw = edge === "top" ? 0 : dragStart.current.x - ev.clientX;
      const dh = edge === "left" ? 0 : dragStart.current.y - ev.clientY;
      // bottom-14 (56px) + right-4 gap (16px) + top margin (8px)
      const maxH = window.innerHeight - 56 - 16 - 8;
      setSize({
        w: Math.min(MAX_W, Math.max(MIN_W, dragStart.current.w + dw)),
        h: Math.min(maxH, Math.max(MIN_H, dragStart.current.h + dh)),
      });
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [size]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (q: string) => {
    sendMessage(q);
  };

  return (
    <div
      ref={panelRef}
      style={{ width: size.w, height: size.h }}
      className="fixed bottom-14 right-4 z-[41] flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl"
    >
      {/* Resize edges — invisible but wide hit areas */}
      {/* Top edge */}
      <div
        onMouseDown={(e) => onEdgeDown("top", e)}
        className="absolute -top-1 left-3 right-3 h-2 cursor-n-resize z-10"
      />
      {/* Left edge */}
      <div
        onMouseDown={(e) => onEdgeDown("left", e)}
        className="absolute top-3 -left-1 w-2 bottom-3 cursor-w-resize z-10"
      />
      {/* Top-left corner */}
      <div
        onMouseDown={(e) => onEdgeDown("top-left", e)}
        className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-10"
      />

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-zinc-700 flex-shrink-0 rounded-t-lg">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Help</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                title="Clear conversation"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={close}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {/* Current page context */}
        <div className="px-3 pb-2">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate block">
            {contextLabel}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ask me anything about TV Desktop:</p>
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleSuggestion(q)}
                className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <HelpMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Loader2 size={12} className="animate-spin" />
                Thinking...
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-zinc-700 p-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-teal-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
