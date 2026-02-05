// src/modules/system/ToolDetail.tsx
// Tool detail view with parameters table and playground

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Copy, Check, ChevronDown, ChevronUp, Play, Loader2 } from "lucide-react";
import { McpTool, callMcpTool, PropertySchema } from "./hooks/useMcpTools";
import { ParameterForm } from "./components/ParameterForm";
import { ResponseViewer } from "./components/ResponseViewer";

interface ToolDetailProps {
  tool: McpTool;
  onBack: () => void;
}

export function ToolDetail({ tool, onBack }: ToolDetailProps) {
  const [playgroundOpen, setPlaygroundOpen] = useState(true);
  const [copied, setCopied] = useState<"curl" | "ts" | null>(null);
  const [response, setResponse] = useState<{ data: unknown; isError?: boolean } | null>(null);

  const properties = (tool.inputSchema.properties || {}) as Record<string, PropertySchema>;
  const required = tool.inputSchema.required || [];
  const propertyEntries = Object.entries(properties);

  // Tool execution mutation
  const executeMutation = useMutation({
    mutationFn: async (args: Record<string, unknown>) => {
      return callMcpTool(tool.name, args);
    },
    onSuccess: (data) => {
      setResponse({ data, isError: data.isError });
    },
    onError: (error) => {
      setResponse({ data: { error: error instanceof Error ? error.message : "Unknown error" }, isError: true });
    },
  });

  const handleExecute = (values: Record<string, unknown>) => {
    setResponse(null);
    executeMutation.mutate(values);
  };

  // Generate code snippets
  const curlSnippet = useMemo(() => {
    const body = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: tool.name,
        arguments: Object.fromEntries(propertyEntries.map(([k]) => [k, `<${k}>`])),
      },
      id: 1,
    };
    return `curl -X POST http://localhost:23816/mcp \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2).replace(/'/g, "\\'")}'`;
  }, [tool.name, propertyEntries]);

  const tsSnippet = useMemo(() => {
    const args = Object.fromEntries(propertyEntries.map(([k]) => [k, `<${k}>`]));
    return `// Using fetch
const response = await fetch("http://localhost:23816/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "${tool.name}",
      arguments: ${JSON.stringify(args, null, 6).replace(/^/gm, "      ").trim()},
    },
    id: 1,
  }),
});
const result = await response.json();`;
  }, [tool.name, propertyEntries]);

  const handleCopy = async (type: "curl" | "ts") => {
    try {
      await navigator.clipboard.writeText(type === "curl" ? curlSnippet : tsSnippet);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
          title="Back to list"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {tool.name}
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">
            Description
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {tool.description}
          </p>
        </section>

        {/* Parameters table */}
        {propertyEntries.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">
              Parameters
            </h3>
            <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-zinc-900 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
                    <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                    <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Required</th>
                    <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {propertyEntries.map(([name, schema]) => (
                    <tr key={name} className="bg-white dark:bg-zinc-950">
                      <td className="px-3 py-2 font-mono text-purple-600 dark:text-purple-400">
                        {name}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {schema.type}
                          {schema.enum && ` (enum)`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {required.includes(name) ? (
                          <span className="text-red-500 font-medium">Yes</span>
                        ) : (
                          <span className="text-zinc-400">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {schema.description || "-"}
                        {schema.enum && (
                          <div className="mt-1 text-xs text-zinc-500">
                            Options: {schema.enum.join(", ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Playground */}
        <section className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setPlaygroundOpen(!playgroundOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Play size={16} className="text-teal-500" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Try It</span>
            </div>
            {playgroundOpen ? (
              <ChevronUp size={16} className="text-zinc-400" />
            ) : (
              <ChevronDown size={16} className="text-zinc-400" />
            )}
          </button>

          {playgroundOpen && (
            <div className="p-4 bg-white dark:bg-zinc-950 space-y-4">
              <ParameterForm
                properties={properties}
                required={required}
                onSubmit={handleExecute}
                isLoading={executeMutation.isPending}
              />

              {executeMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 size={14} className="animate-spin" />
                  Executing...
                </div>
              )}

              {response && (
                <ResponseViewer response={response.data} isError={response.isError} />
              )}
            </div>
          )}
        </section>

        {/* Code Snippets */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">
            Code Examples
          </h3>

          {/* curl */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-500 uppercase">curl</span>
              <button
                onClick={() => handleCopy("curl")}
                className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                {copied === "curl" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                {copied === "curl" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
              {curlSnippet}
            </pre>
          </div>

          {/* TypeScript */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-500 uppercase">TypeScript</span>
              <button
                onClick={() => handleCopy("ts")}
                className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                {copied === "ts" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                {copied === "ts" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
              {tsSnippet}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
