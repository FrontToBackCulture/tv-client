// src/components/help/HelpMessage.tsx

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Crosshair } from "lucide-react";
import { cn } from "../../lib/cn";
import { HelpMessage as HelpMessageType } from "../../stores/helpStore";
import { useHelpStore } from "../../stores/helpStore";

interface HelpMessageProps {
  message: HelpMessageType;
}

export function HelpMessage({ message }: HelpMessageProps) {
  const setHighlightTarget = useHelpStore((s) => s.setHighlightTarget);
  const clearHighlight = useHelpStore((s) => s.clearHighlight);
  const isUser = message.role === "user";

  const handleShowMe = () => {
    if (message.highlightTarget) {
      setHighlightTarget(message.highlightTarget);
      setTimeout(() => clearHighlight(), 4000);
    }
  };

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm break-words",
          isUser
            ? "bg-teal-600 text-white"
            : "bg-slate-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none
            prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
            prose-headings:my-2 prose-headings:text-sm
            prose-code:text-xs prose-code:bg-slate-300 dark:prose-code:bg-zinc-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:text-xs prose-pre:bg-slate-300 dark:prose-pre:bg-zinc-700 prose-pre:p-2 prose-pre:rounded
            prose-table:text-xs
            prose-a:text-teal-600 dark:prose-a:text-teal-400
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && message.highlightTarget && (
          <button
            onClick={handleShowMe}
            className="mt-1.5 flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
          >
            <Crosshair size={12} />
            Show me
          </button>
        )}
      </div>
    </div>
  );
}
