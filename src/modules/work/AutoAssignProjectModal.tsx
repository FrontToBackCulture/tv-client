// Auto-assign project to selected tasks using Claude Haiku.
// Sends task title + description + current project to Haiku along with the
// active project catalog. User reviews suggestions before applying.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { X, Sparkles, Check, Loader2, AlertCircle, Folder } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { workKeys } from "../../hooks/work/keys";
import { toast } from "../../stores/toastStore";
import type { TaskWithRelations } from "../../lib/work/types";

interface Suggestion {
  task_id: string;
  project_id: string | null;
  confidence: number; // 0..1
  reason: string;
}

interface Row {
  task: TaskWithRelations & { current_project_name?: string };
  suggestion?: Suggestion;
  selected: boolean;
  overrideProjectId?: string | null;
}

export function AutoAssignProjectModal({
  taskIds,
  currentProjectId,
  open,
  onClose,
  onApplied,
}: {
  taskIds: string[];
  currentProjectId: string;
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Array<{
    id: string;
    name: string;
    identifier_prefix: string | null;
    description: string | null;
    summary: string | null;
    project_type: string;
    company_name: string | null;
    initiative_name: string | null;
  }>>([]);
  const [applying, setApplying] = useState(false);
  const hasRunRef = useRef(false);

  const runAutoAssign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (taskIds.length === 0) throw new Error("No tasks selected");
      const apiKey = await invoke<string | null>("settings_get_anthropic_key");
      if (!apiKey) throw new Error("No Anthropic API key configured. Add it in Settings.");

      // 1. Fetch selected tasks (include current project name for context)
      const { data: tasks, error: tErr } = await supabase
        .from("tasks")
        .select("id, title, description, project_id, project:projects(id,name), company:crm_companies(name, display_name)")
        .in("id", taskIds);
      if (tErr) throw tErr;
      if (!tasks || tasks.length === 0) throw new Error("No tasks found");

      // 2. Fetch active projects with company names + initiative links
      const [projectsRes, linksRes, initiativesRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, identifier_prefix, description, summary, project_type, company:crm_companies(name, display_name)")
          .eq("status", "active")
          .order("name"),
        supabase
          .from("initiative_projects")
          .select("project_id, initiative_id"),
        supabase
          .from("initiatives")
          .select("id, name"),
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (!projectsRes.data?.length) throw new Error("No active projects to match against");

      // Build initiative lookup
      const initiativeById = new Map((initiativesRes.data || []).map((i: any) => [i.id, i.name as string]));
      const projectInitiative = new Map<string, string>();
      for (const link of (linksRes.data || []) as any[]) {
        const name = initiativeById.get(link.initiative_id);
        if (name) projectInitiative.set(link.project_id, name);
      }

      // Only include projects under these target initiatives
      const TARGET_INITIATIVES = new Set(["Client Operations", "VAL Pipeline"]);
      const targetInitiativeIds = new Set(
        (initiativesRes.data || []).filter((i: any) => TARGET_INITIATIVES.has(i.name)).map((i: any) => i.id as string)
      );
      const targetProjectIds = new Set(
        ((linksRes.data || []) as any[]).filter((l: any) => targetInitiativeIds.has(l.initiative_id)).map((l: any) => l.project_id as string)
      );
      const flatProjects = (projectsRes.data as any[])
        .filter((p: any) => targetProjectIds.has(p.id) && p.id !== currentProjectId)
        .map((p: any) => ({
          id: p.id as string,
          name: p.name as string,
          identifier_prefix: (p.identifier_prefix || null) as string | null,
          description: (p.description || null) as string | null,
          summary: (p.summary || null) as string | null,
          project_type: (p.project_type || "work") as string,
          company_name: (p.company?.display_name || p.company?.name || null) as string | null,
          initiative_name: projectInitiative.get(p.id) || null,
        }));
      if (flatProjects.length === 0) throw new Error("No initiative-linked projects to match against");
      setProjects(flatProjects);

      // 3. Build a batched Haiku prompt using short aliases
      const projectAliasToId = new Map<string, string>();
      const projectLines = flatProjects
        .map((p, i) => {
          const alias = `P${i}`;
          projectAliasToId.set(alias, p.id);
          const parts: string[] = [];
          if (p.initiative_name) parts.push(`[${p.initiative_name}]`);
          if (p.identifier_prefix) parts.push(p.identifier_prefix);
          if (p.project_type && p.project_type !== "work") parts.push(p.project_type);
          if (p.company_name) parts.push(`co: ${p.company_name}`);
          const ctx = p.summary || p.description;
          if (ctx) parts.push(ctx.replace(/\s+/g, " ").slice(0, 200));
          const extras = parts.join(" | ");
          return `${alias}: ${p.name}${extras ? ` — ${extras}` : ""}`;
        })
        .join("\n");

      const taskAliasToId = new Map<string, string>();
      const taskLines = tasks
        .map((t: any, i: number) => {
          const alias = `T${i}`;
          taskAliasToId.set(alias, t.id);
          const desc = (t.description || "").toString().replace(/\s+/g, " ").slice(0, 280);
          const curProjName = (t.project as any)?.name;
          const curProjAlias = flatProjects.findIndex(p => p.id === t.project_id);
          const curLabel = curProjAlias >= 0 ? `P${curProjAlias}` : (curProjName || "none");
          const taskCompany = (t.company as any)?.display_name || (t.company as any)?.name || "";
          return `${alias} (now: ${curLabel}): ${t.title || ""}${taskCompany ? ` [co: ${taskCompany}]` : ""}${desc ? ` | ${desc}` : ""}`;
        })
        .join("\n");

      const instructions = `You match work tasks to the best project from a catalog.

Rules:
- Return one object per task using SHORT alias ids (e.g. "T0", "P3").
- Each task already has a current project shown as "now: P#". Suggest a DIFFERENT project only when the task content clearly belongs elsewhere.
- If the current project is already the best match, set project to the current alias and confidence to 1.0.
- If no project clearly matches better, keep the current project.
- Tasks with [co: CompanyName] should strongly prefer projects linked to the same company.
- confidence 0.0-1.0. Use >=0.7 only when strongly implied.
- reason: ONE short sentence.
- Respond with a JSON array ONLY. No prose, no code fences.

Output format (JSON array):
[{"task":"T0","project":"P3","confidence":0.0,"reason":"..."}]`;

      const projectsBlock = `Projects (${flatProjects.length}):\n${projectLines}`;
      const tasksBlock = `Tasks (${tasks.length}):\n${taskLines}`;

      // 4. Call Haiku with prompt caching on the stable project block
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
              { type: "text", text: projectsBlock, cache_control: { type: "ephemeral" } },
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

      // 5. Parse JSON out of the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Haiku did not return a JSON array");
      let parsed: Array<{ task?: string; task_id?: string; project?: string | null; project_id?: string | null; confidence?: number; reason?: string }>;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e: any) {
        throw new Error(`Failed to parse Haiku JSON: ${e.message}`);
      }

      const suggestionMap = new Map<string, Suggestion>();
      for (const s of parsed) {
        if (!s) continue;
        const taskAlias = (s.task || s.task_id || "").toString();
        const realTaskId = taskAliasToId.get(taskAlias) || null;
        if (!realTaskId) continue;
        const projectAlias = (s.project ?? s.project_id) as string | null | undefined;
        const realProjectId = projectAlias ? (projectAliasToId.get(projectAlias) || null) : null;
        suggestionMap.set(realTaskId, {
          task_id: realTaskId,
          project_id: realProjectId,
          confidence: typeof s.confidence === "number" ? s.confidence : 0,
          reason: typeof s.reason === "string" ? s.reason : "",
        });
      }

      // 6. Build rows — preselect ONLY when Haiku suggests a DIFFERENT project with high confidence
      const rs: Row[] = tasks.map((t: any) => {
        const sug = suggestionMap.get(t.id);
        const differs = !!(sug && sug.project_id && sug.project_id !== t.project_id);
        return {
          task: { ...(t as TaskWithRelations), current_project_name: (t.project as any)?.name },
          suggestion: sug,
          selected: !!(differs && sug!.confidence >= 0.7),
          overrideProjectId: sug?.project_id ?? t.project_id,
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

  const changeOverride = (taskId: string, projectId: string | null) => {
    setRows(rs => rs.map(r => {
      if (r.task.id !== taskId) return r;
      const differsFromCurrent = !!(projectId && projectId !== r.task.project_id);
      return { ...r, overrideProjectId: projectId, selected: differsFromCurrent };
    }));
  };

  const selectedCount = useMemo(
    () => rows.filter(r => r.selected && r.overrideProjectId && r.overrideProjectId !== r.task.project_id).length,
    [rows]
  );

  const applyAll = useCallback(async () => {
    const toApply = rows.filter(r => r.selected && r.overrideProjectId && r.overrideProjectId !== r.task.project_id);
    if (toApply.length === 0) return;
    setApplying(true);
    try {
      // Group by target project_id for fewer round trips
      const byProject = new Map<string, string[]>();
      for (const r of toApply) {
        const pid = r.overrideProjectId!;
        if (!byProject.has(pid)) byProject.set(pid, []);
        byProject.get(pid)!.push(r.task.id);
      }

      for (const [pid, ids] of byProject) {
        const CHUNK = 200;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { error: uErr } = await supabase.from("tasks").update({ project_id: pid }).in("id", chunk);
          if (uErr) throw uErr;
        }
      }

      queryClient.invalidateQueries({ queryKey: workKeys.tasks() });
      toast.success(`Moved ${toApply.length} task${toApply.length > 1 ? "s" : ""} to suggested projects`);
      onApplied?.();
      onClose();
    } catch (err: any) {
      toast.error(`Apply failed: ${err?.message || err}`);
    } finally {
      setApplying(false);
    }
  }, [rows, queryClient, onApplied, onClose]);

  if (!open) return null;

  const projectById = new Map(projects.map(p => [p.id, p]));

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
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Auto-assign project</h2>
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
              Asking Haiku to match tasks to projects...
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
            <div className="text-center py-12 text-sm text-zinc-400">No tasks to match</div>
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map(r => {
                const sug = r.suggestion;
                const suggested = r.overrideProjectId ? projectById.get(r.overrideProjectId) : null;
                const differs = !!(r.overrideProjectId && r.overrideProjectId !== r.task.project_id);
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
                      disabled={!differs}
                      onChange={() => toggleRow(r.task.id)}
                      className="mt-1 w-3.5 h-3.5 accent-teal-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{r.task.title}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-3">
                        <span>now: {r.task.current_project_name || "—"}</span>
                        {(r.task.company as any)?.display_name || (r.task.company as any)?.name ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            {(r.task.company as any)?.display_name || (r.task.company as any)?.name}
                          </span>
                        ) : null}
                      </div>
                      {sug?.reason && (
                        <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{sug.reason}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Folder size={11} className="text-zinc-400" />
                        <select
                          value={r.overrideProjectId || ""}
                          onChange={(e) => changeOverride(r.task.id, e.target.value || null)}
                          className="text-xs px-1.5 py-0.5 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="">— none —</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.id === r.task.project_id ? " (current)" : ""}
                            </option>
                          ))}
                        </select>
                        {suggested && sug && (
                          <span className={`text-[10px] font-medium ${confColor}`}>
                            {Math.round(conf * 100)}% confidence
                          </span>
                        )}
                        {!differs && (
                          <span className="text-[10px] text-zinc-400">no change</span>
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
                {selectedCount} of {rows.length} will move
                <span className="mx-2">•</span>
                <button
                  onClick={() => setRows(rs => rs.map(r => ({
                    ...r,
                    selected: !!(r.overrideProjectId && r.overrideProjectId !== r.task.project_id),
                  })))}
                  className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
                >
                  Select all changes
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
