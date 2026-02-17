// src/hooks/useHelpChat.ts
// Hook for in-app help bot — invokes Rust command, parses highlight tags

import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useHelpStore } from "../stores/helpStore";
import { useAppStore } from "../stores/appStore";
import { useViewContextStore } from "../stores/viewContextStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { buildSystemPrompt, HELP_KNOWLEDGE_PATH } from "../lib/help/helpContent";

const HIGHLIGHT_RE = /<highlight\s+id="([^"]+)"\s*\/>/g;

function parseHighlights(text: string): { clean: string; target: string | null } {
  let target: string | null = null;
  const clean = text.replace(HIGHLIGHT_RE, (_match, id) => {
    target = id;
    return "";
  }).trim();
  return { clean, target };
}

export function useHelpChat() {
  const addMessage = useHelpStore((s) => s.addMessage);
  const setLoading = useHelpStore((s) => s.setLoading);
  const setError = useHelpStore((s) => s.setError);
  const setHighlightTarget = useHelpStore((s) => s.setHighlightTarget);
  const clearHighlight = useHelpStore((s) => s.clearHighlight);
  const messages = useHelpStore((s) => s.messages);
  const isLoading = useHelpStore((s) => s.isLoading);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || isLoading) return;

    // Add user message
    addMessage({
      id: Date.now().toString(),
      role: "user",
      content: userText,
    });

    setLoading(true);
    setError(null);

    // Build history for Rust (exclude current message, just prior ones)
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const activeModule = useAppStore.getState().activeModule;
    const viewContext = useViewContextStore.getState();
    const systemPrompt = buildSystemPrompt(activeModule, viewContext);

    // Resolve knowledge base path from active repository
    const activeRepo = useRepositoryStore.getState().getActiveRepository();
    const knowledgeBasePath = activeRepo
      ? `${activeRepo.path}/${HELP_KNOWLEDGE_PATH}`
      : null;

    try {
      const response = await invoke<string>("help_chat_ask", {
        question: userText,
        history,
        systemPrompt,
        knowledgeBasePath,
      });

      const { clean, target } = parseHighlights(response);

      addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: clean,
        highlightTarget: target,
      });

      // Auto-highlight and clear after 4s
      if (target) {
        setHighlightTarget(target);
        setTimeout(() => clearHighlight(), 4000);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setError(errMsg);
      addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${errMsg}`,
      });
    } finally {
      setLoading(false);
    }
  }, [messages, isLoading, addMessage, setLoading, setError, setHighlightTarget, clearHighlight]);

  return { sendMessage };
}
