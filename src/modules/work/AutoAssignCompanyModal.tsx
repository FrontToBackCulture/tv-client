// Auto-assign company to blank-company tasks using Claude Haiku
// Given tasks in the current project with no company, sends title + description
// to Haiku and proposes matches. User reviews before applying.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { X, Sparkles, Check, Loader2, AlertCircle, Building2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { workKeys } from "../../hooks/work/keys";
import { toast } from "../../stores/toastStore";
import type { TaskWithRelations } from "../../lib/work/types";

interface Suggestion {
  task_id: string;
  company_id: string | null;
  confidence: number; // 0..1
  reason: string;
}

interface Row {
  task: TaskWithRelations;
  suggestion?: Suggestion;
  selected: boolean;
  overrideCompanyId?: string | null; // user can reassign before applying
}

export function AutoAssignCompanyModal({
  taskIds,
  open,
  onClose,
  onApplied,
}: {
  taskIds: string[];
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const hasRunRef = useRef(false);
  const [companies, setCompanies] = useState<Array<{
    id: string;
    name: string;
    display_name: string | null;
    notes: string | null;
    industry: string | null;
    tags: string[] | null;
    email_domains: string[] | null;
  }>>([]);
  const [applying, setApplying] = useState(false);

  const runAutoAssign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (taskIds.length === 0) throw new Error("No tasks selected");
      const apiKey = await invoke<string | null>("settings_get_anthropic_key");
      if (!apiKey) throw new Error("No Anthropic API key configured. Add it in Settings.");

      // 1. Fetch the selected tasks that have no company
      const { data: tasks, error: tErr } = await supabase
        .from("tasks")
        .select("id, title, description, project_id, company_id")
        .in("id", taskIds)
        .is("company_id", null);
      if (tErr) throw tErr;
      if (!tasks || tasks.length === 0) throw new Error("None of the selected tasks have a blank company");

      // 2. Fetch CRM companies
      const { data: companyList, error: cErr } = await supabase
        .from("crm_companies")
        .select("id, name, display_name, notes, industry, tags, email_domains")
        .order("name");
      if (cErr) throw cErr;
      if (!companyList || companyList.length === 0) throw new Error("No companies to match against");
      setCompanies(companyList);

      // 3. Build a batched Haiku prompt using short aliases to cut output tokens
      // Companies are stable across runs → cache the block with cache_control.
      const companyAliasToId = new Map<string, string>();
      const companyLines = companyList
        .map((c, i) => {
          const alias = `C${i}`;
          companyAliasToId.set(alias, c.id);
          const label = c.display_name || c.name;
          const parts: string[] = [];
          if (c.industry) parts.push(c.industry);
          if (c.tags?.length) parts.push(c.tags.join(", "));
          if (c.email_domains?.length) parts.push(c.email_domains.join(", "));
          if (c.notes) parts.push(c.notes.slice(0, 200));
          const extras = parts.join(" | ");
          return `${alias}: ${label}${extras ? ` — ${extras}` : ""}`;
        })
        .join("\n");

      const taskAliasToId = new Map<string, string>();
      const taskLines = tasks
        .map((t: any, i: number) => {
          const alias = `T${i}`;
          taskAliasToId.set(alias, t.id);
          const desc = (t.description || "").toString().replace(/\s+/g, " ").slice(0, 280);
          return `${alias}: ${t.title || ""}${desc ? ` | ${desc}` : ""}`;
        })
        .join("\n");

      const instructions = `You match work tasks to CRM companies. Use ONLY the short IDs below.

Rules:
- Return one object per task using the SHORT alias ids (e.g. "T0", "C3").
- If no company clearly matches, set company to null.
- confidence 0.0-1.0. Use >=0.7 only when strongly implied.
- reason: ONE short sentence.
- Respond with a JSON array ONLY. No prose, no code fences.

Output format (JSON array):
[{"task":"T0","company":"C3"|null,"confidence":0.0,"reason":"..."}]`;

      const companiesBlock = `Companies (${companyList.length}):\n${companyLines}`;
      const tasksBlock = `Tasks (${tasks.length}):\n${taskLines}`;

      // 4. Call Haiku with prompt caching on the stable company block.
      // max_tokens budget: ~80 tokens per task output is more than enough.
      const maxTokens = Math.min(2048, 256 + tasks.length * 80);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          system: instructions,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: companiesBlock, cache_control: { type: "ephemeral" } },
              { type: "text", text: tasksBlock },
            ],
          }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${errText}`);
      }

      const data = await response.json();
      const text: string | undefined = data.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Haiku");

      // 5. Parse JSON out of the response (tolerate code fences or stray prose)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Haiku did not return a JSON array");
      let parsed: Array<{ task?: string; task_id?: string; company?: string | null; company_id?: string | null; confidence?: number; reason?: string }>;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e: any) {
        throw new Error(`Failed to parse Haiku JSON: ${e.message}`);
      }

      const suggestionMap = new Map<string, Suggestion>();
      for (const s of parsed) {
        if (!s) continue;
        const taskAlias = (s.task || s.task_id || "").toString();
        const realTaskId = taskAliasToId.get(taskAlias) || (taskAliasToId.has(taskAlias) ? taskAlias : null);
        if (!realTaskId) continue;
        const companyAlias = (s.company ?? s.company_id) as string | null | undefined;
        const realCompanyId = companyAlias ? (companyAliasToId.get(companyAlias) || null) : null;
        suggestionMap.set(realTaskId, {
          task_id: realTaskId,
          company_id: realCompanyId,
          confidence: typeof s.confidence === "number" ? s.confidence : 0,
          reason: typeof s.reason === "string" ? s.reason : "",
        });
      }

      // 6. Build rows — preselect matches with confidence >= 0.7
      const rs: Row[] = tasks.map((t: any) => {
        const sug = suggestionMap.get(t.id);
        return {
          task: t as TaskWithRelations,
          suggestion: sug,
          selected: !!(sug && sug.company_id && sug.confidence >= 0.7),
          overrideCompanyId: sug?.company_id ?? null,
        };
      });
      setRows(rs);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [taskIds]);

  useEffect(() => {
    if (open && !hasRunRef.current) {
      hasRunRef.current = true;
      runAutoAssign();
    }
  }, [open, runAutoAssign]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setError(null);
      setLoading(false);
      hasRunRef.current = false;
    }
  }, [open]);

  const toggleRow = (taskId: string) => {
    setRows(rs => rs.map(r => r.task.id === taskId ? { ...r, selected: !r.selected } : r));
  };

  const changeOverride = (taskId: string, companyId: string | null) => {
    setRows(rs => rs.map(r => r.task.id === taskId ? { ...r, overrideCompanyId: companyId, selected: !!companyId } : r));
  };

  const selectedCount = useMemo(() => rows.filter(r => r.selected && r.overrideCompanyId).length, [rows]);

  const applyAll = useCallback(async () => {
    const toApply = rows.filter(r => r.selected && r.overrideCompanyId);
    if (toApply.length === 0) return;
    setApplying(true);
    try {
      // Group by company_id to do fewer round trips
      const byCompany = new Map<string, string[]>();
      for (const r of toApply) {
        const cid = r.overrideCompanyId!;
        if (!byCompany.has(cid)) byCompany.set(cid, []);
        byCompany.get(cid)!.push(r.task.id);
      }

      for (const [cid, ids] of byCompany) {
        const CHUNK = 200;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { error: uErr } = await supabase.from("tasks").update({ company_id: cid }).in("id", chunk);
          if (uErr) throw uErr;
        }
      }

      queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
      toast.success(`Assigned ${toApply.length} task${toApply.length > 1 ? "s" : ""} to companies`);
      onApplied?.();
      onClose();
    } catch (err: any) {
      toast.error(`Apply failed: ${err?.message || err}`);
    } finally {
      setApplying(false);
    }
  }, [rows, queryClient, onApplied, onClose]);

  if (!open) return null;

  const companyById = new Map(companies.map(c => [c.id, c]));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 w-[min(900px,95vw)] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-teal-500" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Auto-assign company</h2>
            <span className="text-xs text-zinc-400">• Haiku 4.5</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
              <Loader2 size={16} className="animate-spin text-teal-500" />
              Asking Haiku to match tasks to companies...
            </div>
          )}
          {error && !loading && (
            <div className="flex items-start gap-2 m-4 px-4 py-3 rounded border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">Failed</div>
                <div className="text-xs mt-0.5">{error}</div>
              </div>
              <button onClick={runAutoAssign} className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50">
                Retry
              </button>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="text-center py-12 text-sm text-zinc-400">None of the selected tasks have a blank company</div>
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map(r => {
                const sug = r.suggestion;
                const matchedCompany = r.overrideCompanyId ? companyById.get(r.overrideCompanyId) : null;
                const conf = sug?.confidence ?? 0;
                const confColor =
                  conf >= 0.85 ? "text-emerald-500" :
                  conf >= 0.7 ? "text-teal-500" :
                  conf >= 0.5 ? "text-amber-500" :
                  "text-zinc-400";
                return (
                  <div key={r.task.id} className="flex items-start gap-3 px-5 py-3">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      disabled={!r.overrideCompanyId}
                      onChange={() => toggleRow(r.task.id)}
                      className="mt-1 w-3.5 h-3.5 accent-teal-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{r.task.title}</div>
                      {sug?.reason && (
                        <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{sug.reason}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Building2 size={11} className="text-zinc-400" />
                        <select
                          value={r.overrideCompanyId || ""}
                          onChange={(e) => changeOverride(r.task.id, e.target.value || null)}
                          className="text-xs px-1.5 py-0.5 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="">— none —</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                          ))}
                        </select>
                        {matchedCompany && sug && (
                          <span className={`text-[10px] font-medium ${confColor}`}>
                            {Math.round(conf * 100)}% confidence
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="text-xs text-zinc-500">
            {rows.length > 0 && !loading && !error && (
              <>
                {selectedCount} of {rows.length} selected
                {rows.length > 0 && (
                  <>
                    <span className="mx-2">•</span>
                    <button
                      onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: !!r.overrideCompanyId })))}
                      className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
                    >
                      Select all
                    </button>
                    <span className="mx-1">·</span>
                    <button
                      onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: false })))}
                      className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      None
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={applying}
              className="text-xs px-3 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={applyAll}
              disabled={applying || selectedCount === 0}
              className="text-xs px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-1.5"
            >
              {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Apply {selectedCount > 0 ? `(${selectedCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
