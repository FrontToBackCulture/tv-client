// CRM Deals CRUD + Deal Tasks hooks
// Now queries from unified projects table (project_type='deal')

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  DealFilters,
  DealTask,
  DealWithTaskInfo,
} from "../../lib/crm/types";
import { crmKeys } from "./keys";

// Deal projected from unified projects table
export interface DealFromProject {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  project_type: string;
  company_id: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  deal_currency: string | null;
  deal_solution: string | null;
  deal_expected_close: string | null;
  deal_actual_close: string | null;
  deal_proposal_path: string | null;
  deal_order_form_path: string | null;
  deal_lost_reason: string | null;
  deal_won_notes: string | null;
  deal_stage_changed_at: string | null;
  deal_stale_snoozed_until: string | null;
  deal_contact_ids: string[] | null;
  deal_tags: string[] | null;
  deal_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
  // Joined
  company?: { name: string; referred_by?: string | null } | null;
}

// Map DealFromProject to legacy Deal shape for backward compatibility
function mapProjectToDeal(p: DealFromProject): DealWithTaskInfo {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    company_id: p.company_id ?? "",
    stage: p.deal_stage,
    solution: p.deal_solution,
    value: p.deal_value,
    currency: p.deal_currency,
    expected_close_date: p.deal_expected_close,
    actual_close_date: p.deal_actual_close,
    lost_reason: p.deal_lost_reason,
    won_notes: p.deal_won_notes,
    proposal_path: p.deal_proposal_path,
    order_form_path: p.deal_order_form_path,
    contact_ids: p.deal_contact_ids,
    notes: p.deal_notes,
    tags: p.deal_tags,
    stage_changed_at: p.deal_stage_changed_at,
    stale_snoozed_until: p.deal_stale_snoozed_until,
    created_at: p.created_at,
    updated_at: p.updated_at,
    company: p.company ? { name: p.company.name, referred_by: p.company.referred_by } : undefined,
  } as DealWithTaskInfo;
}

export function useDeals(filters?: DealFilters) {
  return useQuery({
    queryKey: filters?.companyId
      ? crmKeys.dealsByCompany(filters.companyId)
      : [...crmKeys.deals(), filters],
    queryFn: async () => {
      let query = supabase
        .from("projects")
        .select("*, company:crm_companies(name, referred_by)")
        .eq("project_type", "deal")
        .is("archived_at", null);

      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }

      if (filters?.stage) {
        const stages = Array.isArray(filters.stage)
          ? filters.stage
          : [filters.stage];
        query = query.in("deal_stage", stages);
      }

      if (filters?.minValue !== undefined) {
        query = query.gte("deal_value", filters.minValue);
      }

      if (filters?.maxValue !== undefined) {
        query = query.lte("deal_value", filters.maxValue);
      }

      if (filters?.expectedCloseBefore) {
        query = query.lte("deal_expected_close", filters.expectedCloseBefore);
      }

      if (filters?.expectedCloseAfter) {
        query = query.gte("deal_expected_close", filters.expectedCloseAfter);
      }

      const { data, error } = await query.order("deal_expected_close", {
        ascending: true,
      });

      if (error) throw new Error(`Failed to fetch deals: ${error.message}`);
      return (data ?? []).map((d: any) => mapProjectToDeal(d));
    },
  });
}

export function useDeal(id: string | null) {
  return useQuery({
    queryKey: crmKeys.deal(id || ""),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch deal: ${error.message}`);
      return data ? mapProjectToDeal(data as any) : null;
    },
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: {
      company_id: string;
      name: string;
      description?: string | null;
      stage?: string | null;
      solution?: string | null;
      value?: number | null;
      currency?: string | null;
      expected_close_date?: string | null;
      notes?: string | null;
    }) => {
      const slug = deal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `deal-${Date.now()}`;
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: deal.name,
          slug,
          description: deal.description,
          project_type: "deal",
          company_id: deal.company_id,
          deal_stage: deal.stage ?? "prospect",
          deal_solution: deal.solution,
          deal_value: deal.value,
          deal_currency: deal.currency ?? "SGD",
          deal_expected_close: deal.expected_close_date,
          deal_notes: deal.notes,
          deal_stage_changed_at: new Date().toISOString(),
          status: "active",
          identifier_prefix: "DEAL",
        } as any)
        .select()
        .single();

      if (error) throw new Error(`Failed to create deal: ${error.message}`);

      // Create default task statuses for the deal project
      await supabase.from("task_statuses").insert([
        { project_id: data.id, name: "To-do", type: "todo", color: "#9CA3AF", icon: "circle", sort_order: 0 },
        { project_id: data.id, name: "In Progress", type: "in_progress", color: "#F59E0B", icon: "play", sort_order: 1 },
        { project_id: data.id, name: "Complete", type: "complete", color: "#10B981", icon: "check", sort_order: 2 },
      ]);

      // Update company stage if prospect
      const { data: company } = await supabase
        .from("crm_companies")
        .select("stage")
        .eq("id", deal.company_id)
        .single();

      if (company?.stage === "prospect") {
        await supabase
          .from("crm_companies")
          .update({ stage: "opportunity" })
          .eq("id", deal.company_id);
      }

      return mapProjectToDeal(data as any);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.deals() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.dealsByCompany(data.company_id),
      });
      queryClient.invalidateQueries({ queryKey: crmKeys.pipeline() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.company(data.company_id),
      });
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        name?: string;
        description?: string | null;
        stage?: string | null;
        solution?: string | null;
        value?: number | null;
        currency?: string | null;
        expected_close_date?: string | null;
        actual_close_date?: string | null;
        lost_reason?: string | null;
        won_notes?: string | null;
        proposal_path?: string | null;
        order_form_path?: string | null;
        notes?: string | null;
        contact_ids?: string[] | null;
        tags?: string[] | null;
        stale_snoozed_until?: string | null;
        stage_changed_at?: string | null;
      };
    }) => {
      // Get old deal for stage change tracking
      const { data: oldProject } = await supabase
        .from("projects")
        .select("deal_stage, company_id")
        .eq("id", id)
        .single();

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.stage !== undefined) updateData.deal_stage = updates.stage;
      if (updates.solution !== undefined) updateData.deal_solution = updates.solution;
      if (updates.value !== undefined) updateData.deal_value = updates.value;
      if (updates.expected_close_date !== undefined) updateData.deal_expected_close = updates.expected_close_date;
      if (updates.actual_close_date !== undefined) updateData.deal_actual_close = updates.actual_close_date;
      if (updates.lost_reason !== undefined) updateData.deal_lost_reason = updates.lost_reason;
      if (updates.won_notes !== undefined) updateData.deal_won_notes = updates.won_notes;
      if (updates.proposal_path !== undefined) updateData.deal_proposal_path = updates.proposal_path;
      if (updates.order_form_path !== undefined) updateData.deal_order_form_path = updates.order_form_path;
      if (updates.notes !== undefined) updateData.deal_notes = updates.notes;
      if (updates.currency !== undefined) updateData.deal_currency = updates.currency;
      if (updates.contact_ids !== undefined) updateData.deal_contact_ids = updates.contact_ids;
      if (updates.tags !== undefined) updateData.deal_tags = updates.tags;
      if (updates.stale_snoozed_until !== undefined) updateData.deal_stale_snoozed_until = updates.stale_snoozed_until;
      if (updates.stage_changed_at !== undefined) updateData.deal_stage_changed_at = updates.stage_changed_at;

      // Reset deal_stage_changed_at if stage is changing
      if (oldProject && updates.stage && oldProject.deal_stage !== updates.stage) {
        updateData.deal_stage_changed_at = new Date().toISOString();
        updateData.deal_stale_snoozed_until = null;
      }

      const { data, error } = await supabase
        .from("projects")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update deal: ${error.message}`);

      // Update company stage on won
      if (oldProject && updates.stage === "won") {
        await supabase
          .from("crm_companies")
          .update({ stage: "client" })
          .eq("id", oldProject.company_id);
      }

      return mapProjectToDeal(data as any);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.deals() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.dealsByCompany(data.company_id),
      });
      queryClient.invalidateQueries({ queryKey: crmKeys.deal(data.id) });
      queryClient.invalidateQueries({ queryKey: crmKeys.pipeline() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.company(data.company_id),
      });
    },
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // Soft delete via archived_at
      const { error } = await supabase
        .from("projects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw new Error(`Failed to delete deal: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.deals() });
      queryClient.invalidateQueries({ queryKey: crmKeys.pipeline() });
    },
  });
}

export function useDealsWithTasks(filters?: DealFilters) {
  const dealsQuery = useDeals(filters);

  // Extract deal IDs for batch fetching
  const dealIds = (dealsQuery.data ?? []).map((d) => d.id);
  const dealIdsKey = dealIds.join(",");

  // Fetch tasks linked to these deals (deals are projects, tasks link via project_id)
  const tasksQuery = useQuery({
    queryKey: [...crmKeys.deals(), "tasks", dealIdsKey],
    queryFn: async (): Promise<Map<string, DealTask[]>> => {
      if (!dealIds.length) return new Map();

      // Tasks link to deal-projects via project_id
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, priority, due_date, project_id, status_id, assignees:task_assignees(user:users(id, name))")
        .in("project_id", dealIds);

      if (!tasks?.length) return new Map();

      // Fetch statuses
      const statusIds = [...new Set(tasks.map(t => t.status_id).filter(Boolean))];
      let statusMap = new Map<string, string>();
      if (statusIds.length > 0) {
        const { data: statuses } = await supabase
          .from("task_statuses")
          .select("id, type")
          .in("id", statusIds);
        statusMap = new Map((statuses ?? []).map(s => [s.id, s.type]));
      }

      // Build deal-to-tasks mapping
      const tasksByDeal = new Map<string, DealTask[]>();
      tasks.forEach((task: any) => {
        const dealTask: DealTask = {
          id: task.id,
          title: task.title,
          status_type: statusMap.get(task.status_id) || "todo",
          priority: task.priority,
          due_date: task.due_date,
          assignee_name: task.assignees?.[0]?.user?.name || null,
        };
        const dealId = task.project_id;
        const dealTasks = tasksByDeal.get(dealId) || [];
        dealTasks.push(dealTask);
        tasksByDeal.set(dealId, dealTasks);
      });

      return tasksByDeal;
    },
    enabled: dealIds.length > 0,
  });

  // Combine deals with their tasks
  const enrichedDeals: DealWithTaskInfo[] = (dealsQuery.data ?? []).map((deal) => {
    const tasks = tasksQuery.data?.get(deal.id) || [];
    const openTasks = tasks.filter(
      (t) => t.status_type !== "complete"
    );

    const sortedOpenTasks = [...openTasks].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

    return {
      ...deal,
      tasks,
      openTaskCount: openTasks.length,
      nextTask: sortedOpenTasks[0]
        ? { title: sortedOpenTasks[0].title, due_date: sortedOpenTasks[0].due_date }
        : null,
    };
  });

  return {
    data: enrichedDeals,
    isLoading: dealsQuery.isLoading || tasksQuery.isLoading,
    refetch: () => {
      dealsQuery.refetch();
      tasksQuery.refetch();
    },
    error: dealsQuery.error || tasksQuery.error,
  };
}

export interface DealTaskFull {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  due_date: string | null;
  status_id: string;
  identifier: number;
  status_type: string;
  project_prefix: string;
}

export function useDealTasks(dealId: string | null) {
  return useQuery({
    queryKey: ["deal-tasks", dealId],
    queryFn: async (): Promise<DealTaskFull[]> => {
      if (!dealId) return [];

      // Deal is a project — fetch tasks directly by project_id (single query)
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, priority, due_date, status_id, task_number, project_id, task_statuses(type), projects(identifier_prefix)")
        .eq("project_id", dealId)
        .order("due_date", { ascending: true });

      if (error) {
        console.error("[useDealTasks] Tasks error:", error);
        return [];
      }

      const hasEmbeddedStatuses = (data ?? []).some(
        (t) => t.task_statuses && (Array.isArray(t.task_statuses) ? t.task_statuses.length > 0 : true)
      );

      let statusMap = new Map<string, string>();
      let projectMap = new Map<string, string>();

      if (!hasEmbeddedStatuses && data && data.length > 0) {
        const statusIds = [...new Set(data.map(t => t.status_id).filter(Boolean))];
        const { data: statuses } = await supabase
          .from("task_statuses")
          .select("id, type")
          .in("id", statusIds);

        statusMap = new Map((statuses ?? []).map(s => [s.id, s.type]));

        const projectIds = [...new Set(data.map(t => t.project_id).filter(Boolean))];
        const { data: projects } = await supabase
          .from("projects")
          .select("id, identifier_prefix")
          .in("id", projectIds);

        projectMap = new Map((projects ?? []).map(p => [p.id, p.identifier_prefix]));
      }

      return (data ?? []).map((task) => {
        let statusType: string;
        let projectPrefix: string;

        if (hasEmbeddedStatuses) {
          const taskStatuses = task.task_statuses as { type: string } | { type: string }[] | null;
          statusType = Array.isArray(taskStatuses)
            ? taskStatuses[0]?.type || "todo"
            : taskStatuses?.type || "todo";

          const projectRel = task.projects as { identifier_prefix: string } | { identifier_prefix: string }[] | null;
          projectPrefix = Array.isArray(projectRel)
            ? projectRel[0]?.identifier_prefix || "TASK"
            : projectRel?.identifier_prefix || "TASK";
        } else {
          statusType = statusMap.get(task.status_id) || "todo";
          projectPrefix = projectMap.get(task.project_id) || "TASK";
        }

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          due_date: task.due_date,
          status_id: task.status_id,
          identifier: task.task_number ?? 0,
          status_type: statusType,
          project_prefix: projectPrefix,
        };
      });
    },
    enabled: !!dealId,
  });
}
