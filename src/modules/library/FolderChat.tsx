// src/modules/library/FolderChat.tsx
// AI chat interface for folder-scoped conversations

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFolderChat, ChatMessage } from "../../hooks/useFolderChat";
import { cn } from "../../lib/cn";

interface FolderChatProps {
  folderPath: string;
  folderName: string;
  onFileClick: (path: string) => void;
}

// Suggested questions chips
const SUGGESTED_QUESTIONS = [
  "What documents are here?",
  "Show me recent updates",
  "Summarize this folder",
];

// Message bubble component
function MessageBubble({
  message,
  onSourceClick,
}: {
  message: ChatMessage;
  onSourceClick: (path: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-teal-600 text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="prose dark:prose-invert prose-sm max-w-none
        prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:mb-3
        prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100 prose-headings:font-semibold
        prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
        prose-strong:text-zinc-800 dark:prose-strong:text-zinc-200
        prose-ul:my-2 prose-ol:my-2
        prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-li:my-0.5
        prose-code:text-sm prose-code:bg-slate-200 dark:prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-teal-600 dark:prose-code:text-teal-300
        prose-pre:bg-slate-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-zinc-800
        prose-a:text-teal-600 dark:prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content || "..."}
        </ReactMarkdown>
      </div>
      {message.sources && message.sources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
            Sources
          </p>
          <div className="flex flex-wrap gap-2">
            {message.sources.map((source, i) => (
              <button
                key={i}
                onClick={() => onSourceClick(source.path)}
                className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700 hover:text-teal-600 dark:hover:text-teal-400 hover:border-teal-500/50 transition-colors"
              >
                {source.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FolderChat({ folderPath, folderName, onFileClick }: FolderChatProps) {
  const { messages, isLoading, sendMessage } = useFolderChat(folderPath);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const inChatMode = messages.length > 0;

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset input when folder changes
  useEffect(() => {
    setInput("");
  }, [folderPath]);

  const handleSubmit = async (e?: React.FormEvent, questionOverride?: string) => {
    if (e) e.preventDefault();
    const question = questionOverride || input.trim();
    if (!question || isLoading) return;

    setInput("");
    await sendMessage(question);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Suggested questions - show when no messages */}
        {!inChatMode && (
          <div className="mb-6">
            <p className="text-sm text-zinc-500 mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(undefined, q)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onSourceClick={onFileClick}
          />
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-500 mb-4">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 dark:border-zinc-800 p-4 bg-slate-50 dark:bg-zinc-950">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${folderName}...`}
            rows={2}
            disabled={isLoading}
            className={cn(
              "w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 pr-12",
              "text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 resize-none",
              "focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "absolute right-3 bottom-3 p-2 rounded-lg transition-colors",
              "bg-teal-600 text-white hover:bg-teal-500",
              "disabled:bg-slate-200 dark:disabled:bg-zinc-700 disabled:text-zinc-400 dark:disabled:text-zinc-500 disabled:cursor-not-allowed"
            )}
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-600 mt-2">
          AI responses are based on documents in this folder
        </p>
      </div>
    </div>
  );
}
