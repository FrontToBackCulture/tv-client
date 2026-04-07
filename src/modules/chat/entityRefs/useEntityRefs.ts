// Batch-fetch entity data for all references in a chat message body.
// Returns a map keyed by `${type}:${id}` → entity data.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { extractEntityRefs, type EntityRef } from "./parseEntityRefs";

export interface ResolvedTask {
  id: string;
  title: string;
  task_number: number | null;
  status_id: string;
  priority: number | null;
  due_date: string | null;
  completed_at: string | null;
  project_id: string | null;
  status?: { id: string; name: string; type: string; color: string | null };
  project?: { id: string; name: string; folder_path: string | null; identifier_prefix: string | null };
}

export interface ResolvedProject {
  id: string;
  name: string;
  status: string | null;
  project_type: string | null;
  identifier_prefix: string | null;
  description: string | null;
  summary: string | null;
  lead: string | null;
  priority: number | null;
  health: string | null;
  color: string | null;
  target_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  folder_path: string | null;
  company_id: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  deal_currency: string | null;
  deal_expected_close: string | null;
  deal_actual_close: string | null;
  deal_notes: string | null;
  deal_solution: string | null;
  deal_tags: string[] | null;
  deal_contact_ids: string[] | null;
  deal_proposal_path: string | null;
  deal_order_form_path: string | null;
  company?: { id: string; name: string; display_name: string | null } | null;
}

export interface ResolvedCompany {
  id: string;
  name: string;
  display_name: string | null;
  stage: string | null;
}

export interface ResolvedEntities {
  tasks: Map<string, ResolvedTask>;
  projects: Map<string, ResolvedProject>;
  companies: Map<string, ResolvedCompany>;
}

export function useEntityRefs(body: string) {
  const refs = extractEntityRefs(body);
  const taskIds = refs.filter((r) => r.type === "task").map((r) => r.id);
  const projectIds = refs.filter((r) => r.type === "project" || r.type === "deal").map((r) => r.id);
  const companyIds = refs.filter((r) => r.type === "company").map((r) => r.id);

  return useQuery({
    queryKey: ["entity-refs", taskIds.sort().join(","), projectIds.sort().join(","), companyIds.sort().join(",")],
    enabled: refs.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ResolvedEntities> => {
      const result: ResolvedEntities = {
        tasks: new Map(),
        projects: new Map(),
        companies: new Map(),
      };

      const promises: Promise<void>[] = [];

      if (taskIds.length > 0) {
        promises.push(
          (async () => {
            const { data } = await supabase
              .from("tasks")
              .select("id, title, task_number, status_id, priority, due_date, completed_at, project_id, status:task_statuses(id, name, type, color), project:projects!tasks_project_id_fkey(id, name, folder_path, identifier_prefix)")
              .in("id", taskIds);
            for (const t of (data ?? []) as any[]) {
              result.tasks.set(t.id, t);
            }
          })(),
        );
      }

      if (projectIds.length > 0) {
        promises.push(
          (async () => {
            const { data } = await supabase
              .from("projects")
              .select(`
                id, name, status, project_type, identifier_prefix, description, summary, lead, priority, health, color,
                target_date, created_at, updated_at, folder_path, company_id,
                deal_stage, deal_value, deal_currency, deal_expected_close, deal_actual_close, deal_notes,
                deal_solution, deal_tags, deal_contact_ids, deal_proposal_path, deal_order_form_path,
                company:crm_companies(id, name, display_name)
              `)
              .in("id", projectIds);
            for (const p of (data ?? []) as any[]) {
              // Supabase returns joined relations as arrays — normalize to single object
              const company = Array.isArray(p.company) ? p.company[0] ?? null : p.company ?? null;
              result.projects.set(p.id, { ...p, company } as ResolvedProject);
            }
          })(),
        );
      }

      if (companyIds.length > 0) {
        promises.push(
          (async () => {
            const { data } = await supabase
              .from("crm_companies")
              .select("id, name, display_name, stage")
              .in("id", companyIds);
            for (const c of (data ?? []) as ResolvedCompany[]) {
              result.companies.set(c.id, c);
            }
          })(),
        );
      }

      await Promise.all(promises);
      return result;
    },
  });
}

export function getEntityKey(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`;
}
