// src/modules/system/ApiExplorer.tsx
// REST API documentation and playground

import { useState, useMemo } from "react";
import { Copy, Check, ChevronDown, Play, Loader2, Key, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { ResponseViewer } from "./components/ResponseViewer";
import { cn } from "../../lib/cn";
import { useOpenApi, ApiEndpoint } from "./hooks/useOpenApi";

const API_KEY_STORAGE_KEY = "tv-client-api-key";
const API_BASE_URL_KEY = "tv-client-api-base-url";

interface ApiExplorerProps {
  selectedEndpoint: ApiEndpoint | null;
  onSelectEndpoint: (endpoint: ApiEndpoint | null) => void;
}

export function ApiExplorer({ selectedEndpoint, onSelectEndpoint }: ApiExplorerProps) {
  const { data: endpoints, isLoading, error, refetch } = useOpenApi();

  return (
    <div className="h-full flex flex-col">
      {/* Info */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          {!isLoading && !error && endpoints && (
            <p className="text-[10px] text-zinc-400">
              {endpoints.length} endpoints
            </p>
          )}
          <button
            onClick={() => refetch()}
            className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Endpoints list */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-zinc-400" />
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  Failed to load API spec
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  Make sure tv-api is running on port 3000.
                </p>
              </div>
            </div>
          </div>
        )}

        {endpoints?.map((endpoint) => (
          <button
            key={`${endpoint.method}-${endpoint.path}`}
            onClick={() => onSelectEndpoint(selectedEndpoint?.path === endpoint.path ? null : endpoint)}
            className={cn(
              "w-full text-left px-4 py-2 border-b border-slate-200 dark:border-zinc-800 transition-colors",
              selectedEndpoint?.path === endpoint.path
                ? "bg-blue-50 dark:bg-blue-900/20"
                : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"
            )}
          >
            <div className="flex items-center gap-2">
              <MethodBadge method={endpoint.method} />
              <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300 truncate">
                {endpoint.path}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 truncate">{endpoint.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// Endpoint detail view
export function ApiEndpointDetail({ endpoint, onBack }: { endpoint: ApiEndpoint; onBack: () => void }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) || "");
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(API_BASE_URL_KEY) || "http://localhost:3000");
  const [showSettings, setShowSettings] = useState(false);
  const [bodyValues, setBodyValues] = useState<Record<string, unknown>>(endpoint.exampleBody || {});
  const [response, setResponse] = useState<{ data: unknown; isError?: boolean; status?: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<"curl" | "ts" | null>(null);

  // Save settings to localStorage
  const saveSettings = () => {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    localStorage.setItem(API_BASE_URL_KEY, baseUrl);
    setShowSettings(false);
  };

  // Execute API call
  const handleExecute = async () => {
    setIsLoading(true);
    setResponse(null);

    try {
      const url = `${baseUrl}${endpoint.path}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (endpoint.requiresAuth && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const options: RequestInit = {
        method: endpoint.method,
        headers,
      };

      if (endpoint.method !== "GET" && Object.keys(bodyValues).length > 0) {
        options.body = JSON.stringify(bodyValues);
      }

      const res = await fetch(url, options);
      const data = await res.json();

      setResponse({
        data,
        isError: !res.ok,
        status: res.status,
      });
    } catch (error) {
      setResponse({
        data: { error: error instanceof Error ? error.message : "Request failed" },
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate code snippets
  const curlSnippet = useMemo(() => {
    let cmd = `curl -X ${endpoint.method} "${baseUrl}${endpoint.path}"`;

    if (endpoint.requiresAuth) {
      cmd += ` \\\n  -H "Authorization: Bearer <API_KEY>"`;
    }

    if (endpoint.method !== "GET" && Object.keys(bodyValues).length > 0) {
      cmd += ` \\\n  -H "Content-Type: application/json"`;
      cmd += ` \\\n  -d '${JSON.stringify(bodyValues, null, 2)}'`;
    }

    return cmd;
  }, [endpoint, baseUrl, bodyValues]);

  const tsSnippet = useMemo(() => {
    const hasBody = endpoint.method !== "GET" && Object.keys(bodyValues).length > 0;

    return `const response = await fetch("${baseUrl}${endpoint.path}", {
  method: "${endpoint.method}",
  headers: {
    "Content-Type": "application/json",${endpoint.requiresAuth ? '\n    "Authorization": `Bearer ${apiKey}`,' : ""}
  },${hasBody ? `\n  body: JSON.stringify(${JSON.stringify(bodyValues, null, 4).replace(/^/gm, "  ").trim()}),` : ""}
});

const data = await response.json();`;
  }, [endpoint, baseUrl, bodyValues]);

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
        >
          <ChevronDown size={18} className="rotate-90" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MethodBadge method={endpoint.method} />
          <span className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {endpoint.path}
          </span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            showSettings ? "bg-slate-200 dark:bg-zinc-700" : "hover:bg-slate-100 dark:hover:bg-zinc-800",
            apiKey ? "text-green-500" : "text-zinc-400"
          )}
          title="API Settings"
        >
          <Key size={16} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono"
              placeholder="http://localhost:3000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              API Key {endpoint.requiresAuth && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono"
              placeholder="Enter API key..."
            />
          </div>
          <button
            onClick={saveSettings}
            className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-wide">
            Description
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {endpoint.description}
          </p>
          {endpoint.requiresAuth && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
              <Key size={12} />
              Requires authentication
            </div>
          )}
        </section>

        {/* Parameters */}
        {endpoint.parameters && endpoint.parameters.length > 0 && (
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
                  {endpoint.parameters.map((param) => (
                    <tr key={param.name} className="bg-white dark:bg-zinc-950">
                      <td className="px-3 py-2 font-mono text-purple-600 dark:text-purple-400">
                        {param.name}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {param.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {param.required ? (
                          <span className="text-red-500 font-medium">Yes</span>
                        ) : (
                          <span className="text-zinc-400">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {param.description}
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
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Play size={16} className="text-blue-500" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Try It</span>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-zinc-950 space-y-4">
            {/* Body editor for POST/PUT */}
            {endpoint.method !== "GET" && endpoint.parameters && (
              <div className="space-y-3">
                {endpoint.parameters.filter((p) => p.location === "body").map((param) => (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      {param.name}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {param.type === "string" ? (
                      <input
                        type="text"
                        value={(bodyValues[param.name] as string) || ""}
                        onChange={(e) => setBodyValues((prev) => ({ ...prev, [param.name]: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        placeholder={param.description}
                      />
                    ) : (
                      <input
                        type="number"
                        value={(bodyValues[param.name] as number) || ""}
                        onChange={(e) => setBodyValues((prev) => ({ ...prev, [param.name]: Number(e.target.value) }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        placeholder={param.description}
                      />
                    )}
                    <p className="text-xs text-zinc-500 mt-1">{param.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Execute button */}
            <button
              onClick={handleExecute}
              disabled={isLoading || (endpoint.requiresAuth && !apiKey)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                "bg-blue-600 hover:bg-blue-500 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Send Request
                </>
              )}
            </button>

            {endpoint.requiresAuth && !apiKey && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle size={12} />
                Set your API key above to make authenticated requests
              </p>
            )}

            {/* Response */}
            {response && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  {response.isError ? (
                    <AlertCircle size={14} className="text-red-500" />
                  ) : (
                    <CheckCircle2 size={14} className="text-green-500" />
                  )}
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {response.status ? `Status: ${response.status}` : "Response"}
                  </span>
                </div>
                <ResponseViewer response={response.data} isError={response.isError} />
              </div>
            )}
          </div>
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
            <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
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
            <pre className="p-3 bg-slate-900 dark:bg-zinc-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
              {tsSnippet}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

// Method badge component
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    POST: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    PUT: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    DELETE: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  };

  return (
    <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded", colors[method] || "bg-slate-100 dark:bg-zinc-800 text-zinc-600")}>
      {method}
    </span>
  );
}

// Re-export ApiEndpoint type from hook
export type { ApiEndpoint } from "./hooks/useOpenApi";
