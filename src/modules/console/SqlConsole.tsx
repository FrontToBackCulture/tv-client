// src/modules/console/SqlConsole.tsx
// SQL Console for executing queries against VAL domains with AI-powered generation

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from "ag-grid-community";
import {
  Play,
  Loader2,
  AlertCircle,
  Database,
  Clock,
  ChevronDown,
  Sparkles,
  MessageSquare,
  X,
} from "lucide-react";
import {
  useValDomains,
  useValExecuteSql,
  useValGenerateSql,
  SqlExecuteResult,
  SqlGenerateResult,
} from "../../hooks/useValSync";
import { cn } from "../../lib/cn";

interface SqlConsoleProps {
  initialDomain?: string;
  initialSql?: string;
}

export function SqlConsole({ initialDomain, initialSql }: SqlConsoleProps) {
  const theme = useAppStore((s) => s.theme);
  const { data: domains } = useValDomains();
  const executeSql = useValExecuteSql();
  const generateSql = useValGenerateSql();

  const [selectedDomain, setSelectedDomain] = useState(initialDomain || "");
  const [sql, setSql] = useState(initialSql || "");
  const [result, setResult] = useState<SqlExecuteResult | null>(null);
  const [history, setHistory] = useState<{ domain: string; sql: string; timestamp: Date }[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // AI Generation state
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<SqlGenerateResult | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select first domain if none selected
  useEffect(() => {
    if (!selectedDomain && domains && domains.length > 0) {
      setSelectedDomain(domains[0].domain);
    }
  }, [domains, selectedDomain]);

  // Generate column definitions from result
  const columnDefs = useMemo<ColDef[]>(() => {
    if (!result || !result.columns.length) return [];
    return result.columns.map((col) => ({
      field: col,
      headerName: col,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
      flex: 1,
    }));
  }, [result]);

  // Execute SQL query
  const handleExecute = useCallback(async () => {
    if (!selectedDomain || !sql.trim()) return;

    try {
      const res = await executeSql.mutateAsync({
        domain: selectedDomain,
        sql: sql.trim(),
        limit: 1000,
      });
      setResult(res);

      // Add to history
      setHistory((prev) => [
        { domain: selectedDomain, sql: sql.trim(), timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);
    } catch (err) {
      setResult({
        domain: selectedDomain,
        sql: sql.trim(),
        row_count: 0,
        columns: [],
        data: [],
        truncated: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [selectedDomain, sql, executeSql]);

  // Generate SQL with AI
  const handleGenerate = useCallback(async () => {
    if (!selectedDomain || !aiPrompt.trim()) return;

    try {
      const res = await generateSql.mutateAsync({
        domain: selectedDomain,
        prompt: aiPrompt.trim(),
      });
      setAiResult(res);

      // Auto-insert generated SQL into editor
      if (res.sql && !res.error) {
        setSql(res.sql);
      }
    } catch (err) {
      setAiResult({
        domain: selectedDomain,
        prompt: aiPrompt.trim(),
        sql: "",
        explanation: "",
        tables_used: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [selectedDomain, aiPrompt, generateSql]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl + Enter to execute
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute]
  );

  // Handle AI input keyboard shortcuts
  const handleAiKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl + Enter to generate
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  // Load query from history
  const loadFromHistory = useCallback((item: { domain: string; sql: string }) => {
    setSelectedDomain(item.domain);
    setSql(item.sql);
    setShowHistory(false);
  }, []);

  return (
    <div className="h-full flex bg-white dark:bg-zinc-950">
      {/* AI Generation Panel (Left) */}
      {showAiPanel && (
        <div className="w-80 border-r border-slate-200 dark:border-zinc-800 flex flex-col bg-slate-50 dark:bg-zinc-900">
          {/* AI Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-500" />
              <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                AI Generate
              </span>
            </div>
            <button
              onClick={() => setShowAiPanel(false)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
            >
              <X size={14} />
            </button>
          </div>

          {/* AI Input */}
          <div className="p-4 flex-1 flex flex-col">
            <label className="text-xs font-medium text-zinc-500 mb-2">
              Describe what you want to query
            </label>
            <textarea
              ref={aiInputRef}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={handleAiKeyDown}
              placeholder="e.g., Show me all orders from last week with total amount greater than $100"
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />

            <button
              onClick={handleGenerate}
              disabled={!selectedDomain || !aiPrompt.trim() || generateSql.isPending}
              className={cn(
                "mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-violet-600 hover:bg-violet-700 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {generateSql.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Generate SQL
            </button>

            <p className="text-xs text-zinc-500 mt-2 text-center">⌘+Enter</p>

            {/* AI Result */}
            {aiResult && (
              <div className="mt-4 flex-1 overflow-y-auto">
                {aiResult.error ? (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
                      <AlertCircle size={14} />
                      <span className="text-xs font-medium">Error</span>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      {aiResult.error}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Explanation */}
                    {aiResult.explanation && (
                      <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                        <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
                          <MessageSquare size={14} />
                          <span className="text-xs font-medium">Explanation</span>
                        </div>
                        <p className="text-xs text-violet-700 dark:text-violet-300">
                          {aiResult.explanation}
                        </p>
                      </div>
                    )}

                    {/* Tables Used */}
                    {aiResult.tables_used.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-zinc-500">Tables:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {aiResult.tables_used.map((table) => (
                            <span
                              key={table}
                              className="px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                            >
                              {table}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main SQL Console */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
          {/* AI Panel Toggle */}
          {!showAiPanel && (
            <button
              onClick={() => setShowAiPanel(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Sparkles size={14} />
              AI
            </button>
          )}

          {/* Domain Selector */}
          <div className="flex items-center gap-2">
            <Database size={14} className="text-zinc-400" />
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Select domain...</option>
              {domains?.map((d) => (
                <option key={d.domain} value={d.domain}>
                  {d.domain}
                </option>
              ))}
            </select>
          </div>

          {/* Execute Button */}
          <button
            onClick={handleExecute}
            disabled={!selectedDomain || !sql.trim() || executeSql.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              "bg-teal-600 hover:bg-teal-700 text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {executeSql.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Run
          </button>

          <span className="text-xs text-zinc-500">⌘+Enter</span>

          {/* History Toggle */}
          <div className="ml-auto relative">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Clock size={14} />
              History
              <ChevronDown
                size={12}
                className={cn("transition-transform", showHistory && "rotate-180")}
              />
            </button>

            {/* History Dropdown */}
            {showHistory && history.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-96 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg z-10">
                {history.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadFromHistory(item)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 border-b border-slate-100 dark:border-zinc-800 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                      <span className="font-medium text-teal-600 dark:text-teal-400">
                        {item.domain}
                      </span>
                      <span>{item.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300 truncate font-mono">
                      {item.sql}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SQL Editor */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter SQL query (SELECT only)..."
            rows={8}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
          />
          {/* AI Explanation */}
          {aiResult?.explanation && !aiResult.error && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
              <p className="text-sm text-violet-700 dark:text-violet-300">
                {aiResult.explanation}
              </p>
            </div>
          )}
        </div>

        {/* Results Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Status Bar */}
          {result && (
            <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
              {result.error ? (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertCircle size={14} />
                  <span className="text-sm">Error</span>
                </div>
              ) : (
                <>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {result.row_count}
                    </span>{" "}
                    rows
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {result.columns.length}
                    </span>{" "}
                    columns
                  </span>
                  {result.truncated && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Truncated to {result.data.length} rows
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Error Display */}
          {result?.error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
              <pre className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap font-mono">
                {result.error}
              </pre>
            </div>
          )}

          {/* Data Grid */}
          <div className={`flex-1 ${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"}`}>
            {result && !result.error && result.data.length > 0 ? (
              <AgGridReact
                rowData={result.data}
                columnDefs={columnDefs}
                defaultColDef={{
                  sortable: true,
                  filter: true,
                  resizable: true,
                }}
                animateRows={false}
                rowSelection="multiple"
                enableCellTextSelection={true}
                ensureDomOrder={true}
              />
            ) : !result ? (
              <div className="h-full flex items-center justify-center text-zinc-500">
                <div className="text-center">
                  <Database
                    size={48}
                    className="mx-auto mb-4 text-zinc-300 dark:text-zinc-700"
                  />
                  <p className="text-sm">Enter a SQL query and click Run</p>
                  <p className="text-xs mt-1 text-zinc-400">
                    Or use AI Generate to create queries from natural language
                  </p>
                </div>
              </div>
            ) : !result.error && result.data.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500">
                <p className="text-sm">Query returned no rows</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
