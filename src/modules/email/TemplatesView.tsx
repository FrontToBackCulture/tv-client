// src/modules/email/TemplatesView.tsx
// Template gallery — shows email templates from tv-knowledge with live previews

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, Code } from "lucide-react";
import { useRepositoryStore } from "../../stores/repositoryStore";

interface Template {
  name: string;
  displayName: string;
  path: string;
  html?: string;
}

export function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const knowledgePath = useRepositoryStore((s) => {
    const repo = s.repositories.find((r) => r.id === s.activeRepositoryId);
    return repo?.path || "";
  });

  const templatesDir = knowledgePath ? `${knowledgePath}/6_Marketing/email-templates` : "";

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

  return (
    <div className="h-full flex">
      {/* Template list */}
      <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800/50 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Templates
          </h3>
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
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100 capitalize">
                {selected.displayName}
              </h3>
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
            <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-900">
              {selected.html ? (
                viewMode === "preview" ? (
                  <div className="flex justify-center p-6">
                    <div className="w-[620px] bg-white rounded-lg shadow-sm overflow-hidden">
                      <iframe
                        srcDoc={selected.html}
                        className="w-full bg-white border-0"
                        style={{ height: "800px" }}
                        sandbox=""
                        title={`Preview: ${selected.displayName}`}
                      />
                    </div>
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
