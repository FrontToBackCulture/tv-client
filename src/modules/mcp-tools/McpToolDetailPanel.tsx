// Read-only detail view for an mcp_tool. Edits happen inline in the grid;
// this panel is for understanding what a tool does — formatted description,
// human-readable parameter list, and any saved purpose/notes/examples.

import { X, Loader2, BookOpen } from "lucide-react";
import { useMcpTool } from "../../hooks/mcp-tools/useMcpTools";

interface Props {
  slug: string;
  onClose: () => void;
}

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: { type?: string };
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export function McpToolDetailPanel({ slug, onClose }: Props) {
  const { data: tool, isLoading } = useMcpTool(slug);

  if (isLoading || !tool) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800">
        <Loader2 className="animate-spin text-zinc-400" size={20} />
      </div>
    );
  }

  const schema = (tool.params_schema ?? {}) as JsonSchema;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const propertyEntries = Object.entries(properties);

  const examples = Array.isArray(tool.examples) ? (tool.examples as unknown[]) : [];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{tool.name}</h2>
          <p className="text-xs font-mono text-zinc-500 truncate">{tool.slug}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {tool.category && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {tool.category}
              </span>
            )}
            {tool.subcategory && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {tool.subcategory}
              </span>
            )}
            {(tool.platforms ?? []).map((p) => (
              <span
                key={p}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              >
                {p}
              </span>
            ))}
            {(tool.entities ?? []).map((e) => (
              <span
                key={e}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              >
                {e}
              </span>
            ))}
            {(tool.parent_entities ?? []).length > 0 && (
              <>
                <span className="text-[10px] text-zinc-400">attaches to</span>
                {(tool.parent_entities ?? []).map((p) => (
                  <span
                    key={p}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                  >
                    {p}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 flex-shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
        {/* What it does */}
        <Section title="What it does">
          {tool.description ? (
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {tool.description}
            </p>
          ) : (
            <p className="text-sm text-zinc-400 italic">No description provided.</p>
          )}
        </Section>

        {/* Operator notes */}
        {tool.purpose && (
          <Section title="Notes">
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {tool.purpose}
            </p>
          </Section>
        )}

        {/* Inputs — friendly param list */}
        <Section title={`Inputs (${propertyEntries.length})`}>
          {propertyEntries.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">This tool takes no parameters.</p>
          ) : (
            <ul className="space-y-2.5">
              {propertyEntries.map(([key, prop]) => {
                const isRequired = required.has(key);
                const typeLabel = formatType(prop);
                return (
                  <li
                    key={key}
                    className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {key}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {typeLabel}
                      </span>
                      {isRequired ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 uppercase tracking-wide">
                          required
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 uppercase tracking-wide">
                          optional
                        </span>
                      )}
                    </div>
                    {prop.description && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {prop.description}
                      </p>
                    )}
                    {Array.isArray(prop.enum) && prop.enum.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-zinc-500">one of:</span>
                        {prop.enum.map((v) => (
                          <span
                            key={String(v)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                          >
                            {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Examples */}
        {examples.length > 0 && (
          <Section title={`Examples (${examples.length})`}>
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <pre
                  key={i}
                  className="text-[11px] font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all"
                >
                  {typeof ex === "string" ? ex : JSON.stringify(ex, null, 2)}
                </pre>
              ))}
            </div>
          </Section>
        )}

        {/* Operator notes */}
        {tool.notes && (
          <Section title="Internal notes">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {tool.notes}
            </p>
          </Section>
        )}

        {/* Provenance */}
        <Section title="Source">
          <div className="space-y-1.5 text-xs">
            <ProvenanceRow label="Source file" value={tool.source_file ?? "—"} mono />
            <ProvenanceRow label="Status" value={tool.status} />
            <ProvenanceRow
              label="Last synced"
              value={tool.last_synced_at ? new Date(tool.last_synced_at).toLocaleString() : "—"}
            />
            <ProvenanceRow
              label="First seen"
              value={tool.first_seen_at ? new Date(tool.first_seen_at).toLocaleString() : "—"}
            />
            {tool.owner && <ProvenanceRow label="Owner" value={tool.owner} />}
            {(tool.tags ?? []).length > 0 && (
              <ProvenanceRow label="Tags" value={(tool.tags ?? []).join(", ")} />
            )}
          </div>
        </Section>
      </div>

      <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-[11px] text-zinc-500">
        <BookOpen size={12} />
        <span>Edit metadata directly in the grid (single-click a cell).</span>
      </div>
    </div>
  );
}

function formatType(prop: JsonSchemaProperty): string {
  if (!prop.type) return "any";
  if (prop.type === "array" && prop.items?.type) {
    return `${prop.items.type}[]`;
  }
  return prop.type;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function ProvenanceRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-zinc-500 w-24 flex-shrink-0">{label}</span>
      <span className={mono ? "font-mono text-zinc-700 dark:text-zinc-300 break-all" : "text-zinc-700 dark:text-zinc-300"}>
        {value}
      </span>
    </div>
  );
}
