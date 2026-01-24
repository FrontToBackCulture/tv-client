// src/modules/library/MarkdownViewer.tsx
// Simple markdown renderer using react-markdown

import { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
  filename?: string;
}

interface ChildrenProps {
  children?: ReactNode;
}

interface AnchorProps extends ChildrenProps {
  href?: string;
}

interface CodeProps extends ChildrenProps {
  className?: string;
}

export function MarkdownViewer({ content, filename }: MarkdownViewerProps) {
  return (
    <div className="prose prose-invert prose-zinc max-w-none">
      {filename && (
        <div className="not-prose mb-6 pb-4 border-b border-zinc-800">
          <h1 className="text-2xl font-bold text-zinc-100">{filename}</h1>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }: ChildrenProps) => (
            <h1 className="text-2xl font-bold text-zinc-100 mt-8 mb-4">{children}</h1>
          ),
          h2: ({ children }: ChildrenProps) => (
            <h2 className="text-xl font-bold text-zinc-200 mt-6 mb-3">{children}</h2>
          ),
          h3: ({ children }: ChildrenProps) => (
            <h3 className="text-lg font-bold text-zinc-300 mt-5 mb-2">{children}</h3>
          ),
          h4: ({ children }: ChildrenProps) => (
            <h4 className="text-base font-bold text-zinc-300 mt-4 mb-2">{children}</h4>
          ),

          // Paragraphs
          p: ({ children }: ChildrenProps) => (
            <p className="text-zinc-300 leading-relaxed mb-4">{children}</p>
          ),

          // Links
          a: ({ href, children }: AnchorProps) => (
            <a
              href={href}
              className="text-teal-400 hover:text-teal-300 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          // Lists
          ul: ({ children }: ChildrenProps) => (
            <ul className="list-disc list-inside space-y-1 mb-4 text-zinc-300">{children}</ul>
          ),
          ol: ({ children }: ChildrenProps) => (
            <ol className="list-decimal list-inside space-y-1 mb-4 text-zinc-300">{children}</ol>
          ),
          li: ({ children }: ChildrenProps) => <li className="text-zinc-300">{children}</li>,

          // Code
          code: ({ className, children }: CodeProps) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-zinc-800 text-teal-300 px-1.5 py-0.5 rounded text-sm font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className="block bg-zinc-800 p-4 rounded-lg text-sm font-mono text-zinc-300 overflow-x-auto my-4">
                {children}
              </code>
            );
          },
          pre: ({ children }: ChildrenProps) => (
            <pre className="bg-zinc-800 p-4 rounded-lg overflow-x-auto my-4">{children}</pre>
          ),

          // Blockquote
          blockquote: ({ children }: ChildrenProps) => (
            <blockquote className="border-l-4 border-zinc-700 pl-4 italic text-zinc-400 my-4">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }: ChildrenProps) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-zinc-700">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }: ChildrenProps) => (
            <thead className="bg-zinc-800">{children}</thead>
          ),
          th: ({ children }: ChildrenProps) => (
            <th className="px-4 py-2 border border-zinc-700 text-left font-semibold text-zinc-200">
              {children}
            </th>
          ),
          td: ({ children }: ChildrenProps) => (
            <td className="px-4 py-2 border border-zinc-700 text-zinc-300">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => <hr className="border-zinc-700 my-6" />,

          // Strong and emphasis
          strong: ({ children }: ChildrenProps) => (
            <strong className="font-bold text-zinc-100">{children}</strong>
          ),
          em: ({ children }: ChildrenProps) => (
            <em className="italic text-zinc-300">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
