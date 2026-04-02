// src/modules/email/TemplatesView.tsx
// Template gallery — shows email templates from tv-knowledge with live previews

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, Code, Copy, FileText } from "lucide-react";
import { useKnowledgePaths } from "../../hooks/useKnowledgePaths";

interface Template {
  name: string;
  displayName: string;
  path: string;
  html?: string;
}

/** Extract {{tokens}} from HTML */
function extractTokens(html: string): string[] {
  const matches = html.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, "")))];
}

export function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const paths = useKnowledgePaths();

  const templatesDir = paths ? `${paths.marketing}/email-templates` : "";

  // Load template list
  useEffect(() => {
    if (!templatesDir) return;
    invoke<{ name: string; path: string; is_directory: boolean }[]>("list_directory", { path: templatesDir })
      .then((entries) => {
        const htmlFiles = entries
          .filter((e) => !e.is_directory && e.name.endsWith(".html"))
          .map((e) => ({
            name: e.name,
            displayName: e.name.replace(".html", "").replace(/-/g, " "),
            path: e.path,
          }));
        setTemplates(htmlFiles);
      })
      .catch(() => setTemplates([]));
  }, [templatesDir]);

  // Load selected template HTML
  useEffect(() => {
    if (!selected || selected.html) return;
    invoke<string>("read_file", { path: selected.path })
      .then((html) => {
        setSelected((prev) => (prev ? { ...prev, html } : null));
      })
      .catch(() => {});
  }, [selected?.path]);

  const tokens = selected?.html ? extractTokens(selected.html) : [];
  const [copied, setCopied] = useState(false);

  const copyHtml = () => {
    if (!selected?.html) return;
    navigator.clipboard.writeText(selected.html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex">
      {/* Template list */}
      <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800/50 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Templates
          </h3>
          <span className="text-[10px] text-zinc-300 dark:text-zinc-600">{templates.length}</span>
        </div>
        <div className="flex-1 overflow-auto">
          {templates.length === 0 ? (
            <p className="px-3 py-4 text-[10px] text-zinc-400">
              No templates found in<br />6_Marketing/email-templates/
            </p>
          ) : (
            templates.map((t) => (
              <button
                key={t.path}
                onClick={() => setSelected({ ...t, html: undefined })}
                className={`w-full text-left px-3 py-2.5 text-xs border-b border-zinc-50 dark:border-zinc-800/30 transition-colors capitalize ${
                  selected?.path === t.path
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                {t.displayName}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Top bar: name + toggle + actions */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100 capitalize">
                {selected.displayName}
              </h3>
              <div className="flex items-center gap-2">
                {/* Copy HTML */}
                <button
                  onClick={copyHtml}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  title="Copy HTML to clipboard"
                >
                  <Copy size={10} /> {copied ? "Copied" : "Copy HTML"}
                </button>
                {/* Preview / Code toggle */}
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5">
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded ${
                      viewMode === "preview"
                        ? "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    <Eye size={10} /> Preview
                  </button>
                  <button
                    onClick={() => setViewMode("code")}
                    className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded ${
                      viewMode === "code"
                        ? "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    <Code size={10} /> Code
                  </button>
                </div>
              </div>
            </div>

            {/* Content: preview/code + metadata sidebar */}
            <div className="flex-1 overflow-hidden flex">
              {/* Main preview/code area — this scrolls */}
              <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-900">
                {selected.html ? (
                  viewMode === "preview" ? (
                    <div className="flex justify-center p-6">
                      <div
                        className="w-[620px] bg-white rounded-lg shadow-sm overflow-hidden email-preview-scope"
                        dangerouslySetInnerHTML={{ __html: selected.html }}
                      />
                    </div>
                  ) : (
                    <pre className="p-4 text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                      {selected.html}
                    </pre>
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-zinc-400">
                    Loading...
                  </div>
                )}
              </div>

              {/* Metadata sidebar */}
              {selected.html && (
                <div className="w-[200px] flex-shrink-0 border-l border-zinc-100 dark:border-zinc-800/50 overflow-auto">
                  {/* File info */}
                  <div className="px-3 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      File
                    </h4>
                    <div className="flex items-start gap-1.5">
                      <FileText size={11} className="text-zinc-400 mt-0.5 shrink-0" />
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-400 break-all leading-tight">
                        {selected.name}
                      </span>
                    </div>
                  </div>

                  {/* Tokens */}
                  {tokens.length > 0 && (
                    <div className="px-3 py-3">
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                        Tokens ({tokens.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {tokens.map((token) => (
                          <span
                            key={token}
                            className="inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded"
                          >
                            {token}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-400">
            Select a template to preview
          </div>
        )}
      </div>
    </div>
  );
}
