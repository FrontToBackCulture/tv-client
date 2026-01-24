// src/hooks/useFolderChat.ts
// Hook for folder-scoped AI chat

import { useState, useCallback, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ path: string; title: string }>;
}

interface UseFolderChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  progress: string;
  sendMessage: (question: string) => Promise<void>;
  clearMessages: () => void;
}

// tv-tools HTTP API base URL
const API_BASE = "http://localhost:5001";

export function useFolderChat(folderPath: string): UseFolderChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState("");

  // Reset chat when folder changes
  useEffect(() => {
    setMessages([]);
    setProgress("");
    setIsLoading(false);
  }, [folderPath]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setProgress("");
  }, []);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    setProgress("Starting...");

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Build conversation history
    const conversationHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch(`${API_BASE}/api/local/folder-ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          folderPath,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get response");
      }

      const contentType = response.headers.get("Content-Type") || "";

      if (contentType.includes("application/json")) {
        // Non-streaming JSON response
        const data = await response.json();
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.answer || "No answer available.",
          sources: data.sources?.map((s: { path: string; title: string }) => ({
            path: s.path,
            title: s.title,
          })),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let isStreaming = false;
        let streamedContent = "";
        const assistantMessageId = (Date.now() + 1).toString();

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Check for progress updates (before streaming starts)
          if (!isStreaming) {
            const progressMatches = buffer.match(/<!-- PROGRESS: (.+?) -->/g);
            if (progressMatches) {
              const lastMatch = progressMatches[progressMatches.length - 1];
              const progressText = lastMatch.match(/<!-- PROGRESS: (.+?) -->/)?.[1];
              if (progressText) {
                setProgress(progressText);
              }
            }
          }

          // Check for stream start
          if (!isStreaming && buffer.includes("<!-- STREAM_START -->")) {
            isStreaming = true;
            setProgress("");
            // Add placeholder message
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMessageId,
                role: "assistant",
                content: "",
              },
            ]);
            buffer = buffer.split("<!-- STREAM_START -->")[1] || "";
          }

          // If streaming, update the message content
          if (isStreaming) {
            const streamEndMatch = buffer.match(/<!-- STREAM_END: ({.*}) -->/);
            if (streamEndMatch) {
              const finalContent = buffer.split("<!-- STREAM_END:")[0].trim();
              streamedContent = finalContent;
              const result = JSON.parse(streamEndMatch[1]);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: streamedContent, sources: result.sources }
                    : msg
                )
              );
              break;
            } else {
              const cleanContent = buffer.replace(/<!-- STREAM_END.*$/, "").trim();
              if (cleanContent !== streamedContent) {
                streamedContent = cleanContent;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: streamedContent }
                      : msg
                  )
                );
              }
            }
          }

          // Check for error
          const errorMatch = buffer.match(/<!-- ERROR: (.+?) -->/);
          if (errorMatch) {
            throw new Error(errorMatch[1]);
          }
        }
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Make sure tv-tools is running on port 3001.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setProgress("");
    }
  }, [folderPath, messages, isLoading]);

  return { messages, isLoading, progress, sendMessage, clearMessages };
}
