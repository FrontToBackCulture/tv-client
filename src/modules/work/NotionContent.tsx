// For Notion-linked tasks, render the stored description with ReactMarkdown.
// Description is synced from Notion via the pull command (Rust blocks-to-markdown converter).

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function NotionContent({ description }: { description: string | null }) {
  if (!description) return <p className="text-zinc-400">No content synced from Notion yet. Click "Sync from Notion" to pull content.</p>;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-table:my-2 prose-hr:my-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
    </div>
  );
}
