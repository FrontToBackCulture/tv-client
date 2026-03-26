// LinkedIn post composer with preview and publish

import { useState } from "react";
import { Send, Eye, Edit3, Globe, Users, CheckCircle } from "lucide-react";
import { formatError } from "@/lib/formatError";
import { Button } from "../../components/ui";
import { cn } from "../../lib/cn";
import { useCreateLinkedInPost } from "../../hooks/useLinkedIn";

type Visibility = "PUBLIC" | "CONNECTIONS";

export function ComposeView() {
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [showPreview, setShowPreview] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const createPost = useCreateLinkedInPost();

  const charCount = text.length;
  const maxChars = 3000; // LinkedIn post limit
  const isOverLimit = charCount > maxChars;

  const handlePublish = async () => {
    if (!text.trim() || isOverLimit) return;

    try {
      await createPost.mutateAsync({ text: text.trim(), visibility });
      setJustPublished(true);
      setText("");
      setTimeout(() => setJustPublished(false), 3000);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            New Post
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
            >
              {showPreview ? <Edit3 size={12} /> : <Eye size={12} />}
              {showPreview ? "Edit" : "Preview"}
            </button>
          </div>
        </div>

        {/* Composer */}
        {showPreview ? (
          <div className="min-h-[200px] p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg">
            <div className="whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-100">
              {text || <span className="text-zinc-400 italic">Nothing to preview</span>}
            </div>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to talk about?"
            rows={8}
            className="w-full p-4 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg resize-none focus:outline-none focus:border-teal-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Visibility toggle */}
            <button
              onClick={() =>
                setVisibility(visibility === "PUBLIC" ? "CONNECTIONS" : "PUBLIC")
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {visibility === "PUBLIC" ? (
                <>
                  <Globe size={12} /> Public
                </>
              ) : (
                <>
                  <Users size={12} /> Connections
                </>
              )}
            </button>

            {/* Char count */}
            <span
              className={cn(
                "text-xs",
                isOverLimit ? "text-red-500" : charCount > maxChars * 0.9 ? "text-amber-500" : "text-zinc-400",
              )}
            >
              {charCount.toLocaleString()} / {maxChars.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {justPublished && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle size={12} /> Published!
              </span>
            )}

            {createPost.error && (
              <span className="text-xs text-red-500">
                {formatError(createPost.error)}
              </span>
            )}

            <Button
              size="sm"
              onClick={handlePublish}
              disabled={!text.trim() || isOverLimit}
              loading={createPost.isPending}
              className="rounded-lg"
            >
              <Send size={14} className="mr-1" />
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
