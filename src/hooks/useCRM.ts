// React Query hooks for CRM module
// Direct Supabase calls - no middleware

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  Company,
  CompanyInsert,
  CompanyUpdate,
  CompanyWithRelations,
  CompanyFilters,
  Contact,
  ContactInsert,
  ContactUpdate,
  ContactFilters,
  Deal,
  DealInsert,
  DealUpdate,
  DealFilters,
  DealTask,
  DealWithTaskInfo,
  Activity,
  ActivityInsert,
  ActivityFilters,
  PipelineStats,
} from "../lib/crm/types";

// ============================================
// Query Keys
// ============================================
export const crmKeys = {
  all: ["crm"] as const,
  companies: () => [...crmKeys.all, "companies"] as const,
  company: (id: string) => [...crmKeys.companies(), id] as const,
  contacts: () => [...crmKeys.all, "contacts"] as const,
  contactsByCompany: (companyId: string) =>
    [...crmKeys.contacts(), "company", companyId] as const,
  contact: (id: string) => [...crmKeys.contacts(), id] as const,
  deals: () => [...crmKeys.all, "deals"] as const,
  dealsByCompany: (companyId: string) =>
    [...crmKeys.deals(), "company", companyId] as const,
  deal: (id: string) => [...crmKeys.deals(), id] as const,
  activities: () => [...crmKeys.all, "activities"] as const,
  activitiesByCompany: (companyId: string) =>
    [...crmKeys.activities(), "company", companyId] as const,
  pipeline: () => [...crmKeys.all, "pipeline"] as const,
};

// ============================================
// Real-time Subscriptions
// ============================================
export function useCRMRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to CRM table changes
    const channel = supabase
      .channel("crm-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_companies" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.companies() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_contacts" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_deals" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.deals() });
          queryClient.invalidateQueries({ queryKey: crmKeys.pipeline() });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_activities" },
        () => {
          queryClient.invalidateQueries({ queryKey: crmKeys.activities() });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// ============================================
// Companies
// ============================================

export function useCompanies(filters?: CompanyFilters) {
  return useQuery({
    queryKey: [...crmKeys.companies(), filters],
    queryFn: async (): Promise<Company[]> => {
      let query = supabase.from("crm_companies").select("*");

      if (filters?.stage) {
        const stages = Array.isArray(filters.stage)
          ? filters.stage
          : [filters.stage];
        query = query.in("stage", stages);
      }

      if (filters?.industry) {
        query = query.eq("industry", filters.industry);
      }

      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%`
        );
      }

      if (filters?.tags?.length) {
        query = query.overlaps("tags", filters.tags);
      }

      const { data, error } = await query.order("updated_at", {
        ascending: false,
      });

      if (error)
        throw new Error(`Failed to fetch companies: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useCompany(id: string | null) {
  return useQuery({
    queryKey: crmKeys.company(id || ""),
    queryFn: async (): Promise<Company | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("crm_companies")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch company: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCompanyWithRelations(id: string | null) {
  const companyQuery = useCompany(id);
  const contactsQuery = useContacts({ companyId: id || undefined });
  const dealsQuery = useDealsWithTasks({ companyId: id || undefined });
  const activitiesQuery = useActivities({ companyId: id || undefined, limit: 50 });

  const isLoading =
    companyQuery.isLoading ||
    contactsQuery.isLoading ||
    dealsQuery.isLoading ||
    activitiesQuery.isLoading;

  const data: CompanyWithRelations | null = companyQuery.data
    ? {
        ...companyQuery.data,
        contacts: contactsQuery.data,
        deals: dealsQuery.data,
        activities: activitiesQuery.data,
        primaryContact:
          contactsQuery.data?.find((c) => c.is_primary) ||
          contactsQuery.data?.[0] ||
          null,
        activeDealCount:
          dealsQuery.data?.filter((d) => !["won", "lost"].includes(d.stage))
            .length || 0,
        totalDealValue:
          dealsQuery.data
            ?.filter((d) => d.stage === "won")
            .reduce((sum, d) => sum + (d.value || 0), 0) || 0,
        lastActivityDate: activitiesQuery.data?.[0]?.activity_date,
      }
    : null;

  const refetch = () => {
    companyQuery.refetch();
    contactsQuery.refetch();
    dealsQuery.refetch();
    activitiesQuery.refetch();
  };

  return {
    data,
    isLoading,
    refetch,
    error:
      companyQuery.error ||
      contactsQuery.error ||
      dealsQuery.error ||
      activitiesQuery.error,
  };
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (company: CompanyInsert): Promise<Company> => {
      const { data, error } = await supabase
        .from("crm_companies")
        .insert(company)
        .select()
        .single();

      if (error) throw new Error(`Failed to create company: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies() });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: CompanyUpdate;
    }): Promise<Company> => {
      const { data, error } = await supabase
        .from("crm_companies")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update company: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies() });
      queryClient.invalidateQueries({ queryKey: crmKeys.company(data.id) });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("crm_companies")
        .delete()
        .eq("id", id);

      if (error) throw new Error(`Failed to delete company: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies() });
    },
  });
}

// ============================================
// Contacts
// ============================================

export function useContacts(filters?: ContactFilters) {
  return useQuery({
    queryKey: filters?.companyId
      ? crmKeys.contactsByCompany(filters.companyId)
      : [...crmKeys.contacts(), filters],
    queryFn: async (): Promise<Contact[]> => {
      let query = supabase.from("crm_contacts").select("*");

      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }

      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      if (filters?.isActive !== undefined) {
        query = query.eq("is_active", filters.isActive);
      }

      const { data, error } = await query.order("is_primary", {
        ascending: false,
      });

      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      return data ?? [];
    },
    enabled: filters?.companyId !== undefined || !filters,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: crmKeys.contact(id || ""),
    queryFn: async (): Promise<Contact | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch contact: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: ContactInsert): Promise<Contact> => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .insert({ ...contact, email: contact.email.toLowerCase() })
        .select()
        .single();

      if (error) throw new Error(`Failed to create contact: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.contactsByCompany(data.company_id),
      });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: ContactUpdate;
    }): Promise<Contact> => {
      const updateData = { ...updates, updated_at: new Date().toISOString() };
      if (updates.email) {
        updateData.email = updates.email.toLowerCase();
      }

      const { data, error } = await supabase
        .from("crm_contacts")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update contact: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.contactsByCompany(data.company_id),
      });
      queryClient.invalidateQueries({ queryKey: crmKeys.contact(data.id) });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("crm_contacts")
        .delete()
        .eq("id", id);

      if (error) throw new Error(`Failed to delete contact: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
    },
  });
}

// ============================================
// Deals
// ============================================

export function useDeals(filters?: DealFilters) {
  return useQuery({
    queryKey: filters?.companyId
      ? crmKeys.dealsByCompany(filters.companyId)
      : [...crmKeys.deals(), filters],
    queryFn: async (): Promise<(Deal & { company?: { name: string; referred_by?: string | null } })[]> => {
      let query = supabase
        .from("crm_deals")
        .select("*, company:crm_companies(name, referred_by)");

      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }

      if (filters?.stage) {
        const stages = Array.isArray(filters.stage)
          ? filters.stage
          : [filters.stage];
        query = query.in("stage", stages);
      }

      if (filters?.minValue !== undefined) {
        query = query.gte("value", filters.minValue);
      }

      if (filters?.maxValue !== undefined) {
        query = query.lte("value", filters.maxValue);
      }

      if (filters?.expectedCloseBefore) {
        query = query.lte("expected_close_date", filters.expectedCloseBefore);
      }

      if (filters?.expectedCloseAfter) {
        query = query.gte("expected_close_date", filters.expectedCloseAfter);
      }

      const { data, error } = await query.order("expected_close_date", {
        ascending: true,
      });

      if (error) throw new Error(`Failed to fetch deals: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useDeal(id: string | null) {
  return useQuery({
    queryKey: crmKeys.deal(id || ""),
    queryFn: async (): Promise<Deal | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("crm_deals")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch deal: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: DealInsert): Promise<Deal> => {
      const { data, error } = await supabase
        .from("crm_deals")
        .insert({
          ...deal,
          stage_changed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create deal: ${error.message}`);

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

      return data;
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
      updates: DealUpdate;
    }): Promise<Deal> => {
      // Get old deal for stage change tracking
      const { data: oldDeal } = await supabase
        .from("crm_deals")
        .select("stage, company_id")
        .eq("id", id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Reset stage_changed_at if stage is changing
      if (oldDeal && updates.stage && oldDeal.stage !== updates.stage) {
        updateData.stage_changed_at = new Date().toISOString();
        updateData.stale_snoozed_until = null;
      }

      const { data, error } = await supabase
        .from("crm_deals")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update deal: ${error.message}`);

      // Update company stage on won
      if (oldDeal && updates.stage === "won") {
        await supabase
          .from("crm_companies")
          .update({ stage: "client" })
          .eq("id", oldDeal.company_id);
      }

      return data;
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
      const { error } = await supabase.from("crm_deals").delete().eq("id", id);

      if (error) throw new Error(`Failed to delete deal: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.deals() });
      queryClient.invalidateQueries({ queryKey: crmKeys.pipeline() });
    },
  });
}

// ============================================
// Activities
// ============================================

export function useActivities(filters?: ActivityFilters) {
  return useQuery({
    queryKey: filters?.companyId
      ? crmKeys.activitiesByCompany(filters.companyId)
      : [...crmKeys.activities(), filters],
    queryFn: async (): Promise<Activity[]> => {
      let query = supabase.from("crm_activities").select("*");

      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }

      if (filters?.dealId) {
        query = query.eq("deal_id", filters.dealId);
      }

      if (filters?.contactId) {
        query = query.eq("contact_id", filters.contactId);
      }

      if (filters?.type) {
        const types = Array.isArray(filters.type)
          ? filters.type
          : [filters.type];
        query = query.in("type", types);
      }

      if (filters?.afterDate) {
        query = query.gte("activity_date", filters.afterDate);
      }

      if (filters?.beforeDate) {
        query = query.lte("activity_date", filters.beforeDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query.order("activity_date", {
        ascending: false,
      });

      if (error)
        throw new Error(`Failed to fetch activities: ${error.message}`);
      return data ?? [];
    },
    enabled: filters?.companyId !== undefined || !filters,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activity: ActivityInsert): Promise<Activity> => {
      const { data, error } = await supabase
        .from("crm_activities")
        .insert(activity)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create activity: ${error.message}`);

      // Update company's updated_at
      await supabase
        .from("crm_companies")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activity.company_id);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.activities() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.activitiesByCompany(data.company_id),
      });
      queryClient.invalidateQueries({
        queryKey: crmKeys.company(data.company_id),
      });
    },
  });
}

// ============================================
// Pipeline Stats
// ============================================

// ============================================
// Deal Tasks
// ============================================

export function useDealsWithTasks(filters?: DealFilters) {
  const dealsQuery = useDeals(filters);

  // Extract deal IDs for batch fetching
  const dealIds = (dealsQuery.data ?? []).map((d) => d.id);
  const dealIdsKey = dealIds.join(",");

  // Fetch tasks linked to these specific deals
  const tasksQuery = useQuery({
    queryKey: [...crmKeys.deals(), "tasks", dealIdsKey],
    queryFn: async (): Promise<Map<string, DealTask[]>> => {
      if (!dealIds.length) return new Map();

      // Step 1: Get task links from task_deal_links junction table
      const { data: links } = await supabase
        .from("task_deal_links")
        .select("task_id, deal_id")
        .in("deal_id", dealIds);

      const linkedTaskIds = (links ?? []).map((l) => l.task_id);

      // Step 2: Fetch tasks linked via junction table (simple query - no embedded relations)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let junctionTasks: any[] = [];
      if (linkedTaskIds.length > 0) {
        const { data, error } = await supabase
          .from("tasks")
          .select("id, title, priority, due_date, crm_deal_id, status_id, assignee_id")
          .in("id", linkedTaskIds);

        if (!error) junctionTasks = data ?? [];
      }

      // Step 3: Fetch tasks linked via crm_deal_id (simple query - no embedded relations)
      const { data: directTasks } = await supabase
        .from("tasks")
        .select("id, title, priority, due_date, crm_deal_id, status_id, assignee_id")
        .in("crm_deal_id", dealIds);

      // Merge tasks (dedup by id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTasksMap = new Map<string, any>();
      [...junctionTasks, ...(directTasks ?? [])].forEach(t => {
        allTasksMap.set(t.id, t);
      });
      const tasks = Array.from(allTasksMap.values());

      // Step 4: Fetch statuses for all tasks (separate query to avoid embedded relation issues)
      const statusIds = [...new Set(tasks.map(t => t.status_id).filter(Boolean))];
      let statusMap = new Map<string, string>();
      if (statusIds.length > 0) {
        const { data: statuses } = await supabase
          .from("task_statuses")
          .select("id, type")
          .in("id", statusIds);

        statusMap = new Map((statuses ?? []).map(s => [s.id, s.type]));
      }

      // Step 5: Fetch assignee names (separate query)
      const assigneeIds = [...new Set(tasks.map(t => t.assignee_id).filter(Boolean))];
      let assigneeMap = new Map<string, string>();
      if (assigneeIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, name")
          .in("id", assigneeIds);

        assigneeMap = new Map((users ?? []).map(u => [u.id, u.name]));
      }

      // Enrich tasks with status type and assignee name
      const enrichedTasks = tasks.map(t => ({
        ...t,
        status_type: statusMap.get(t.status_id) || "unstarted",
        assignee_name: assigneeMap.get(t.assignee_id) || null,
      }));

      // Step 6: Build deal-to-tasks mapping
      const tasksByDeal = new Map<string, DealTask[]>();

      // Create a map of task_id -> deal_id from junction table
      const junctionMap = new Map<string, string[]>();
      (links ?? []).forEach((link) => {
        const deals = junctionMap.get(link.task_id) || [];
        deals.push(link.deal_id);
        junctionMap.set(link.task_id, deals);
      });

      // Process each enriched task
      enrichedTasks.forEach((task) => {
        const dealTask: DealTask = {
          id: task.id,
          title: task.title,
          status_type: task.status_type,
          priority: task.priority,
          due_date: task.due_date,
          assignee_name: task.assignee_name,
        };

        // Add to deals via junction table
        const linkedDealIds = junctionMap.get(task.id) || [];
        linkedDealIds.forEach((dealId) => {
          const dealTasks = tasksByDeal.get(dealId) || [];
          if (!dealTasks.find((t) => t.id === task.id)) {
            dealTasks.push(dealTask);
          }
          tasksByDeal.set(dealId, dealTasks);
        });

        // Add to deal via legacy crm_deal_id field
        if (task.crm_deal_id && dealIds.includes(task.crm_deal_id)) {
          const dealTasks = tasksByDeal.get(task.crm_deal_id) || [];
          if (!dealTasks.find((t) => t.id === task.id)) {
            dealTasks.push(dealTask);
          }
          tasksByDeal.set(task.crm_deal_id, dealTasks);
        }
      });

      return tasksByDeal;
    },
    enabled: dealIds.length > 0,
  });

  // Combine deals with their tasks
  const enrichedDeals: DealWithTaskInfo[] = (dealsQuery.data ?? []).map((deal) => {
    const tasks = tasksQuery.data?.get(deal.id) || [];
    const openTasks = tasks.filter(
      (t) => !["completed", "canceled"].includes(t.status_type)
    );

    // Find next task (by due date, or soonest open task)
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

export function usePipelineStats() {
  return useQuery({
    queryKey: crmKeys.pipeline(),
    queryFn: async (): Promise<PipelineStats> => {
      const { data: deals, error } = await supabase
        .from("crm_deals")
        .select("*")
        .in("stage", [
          "target",
          "prospect",
          "lead",
          "qualified",
          "pilot",
          "proposal",
          "negotiation",
        ]);

      if (error) throw new Error(`Failed to fetch deals: ${error.message}`);

      const byStage = [
        "target",
        "prospect",
        "lead",
        "qualified",
        "pilot",
        "proposal",
        "negotiation",
      ].map((stage) => {
        const stageDeals = (deals ?? []).filter((d) => d.stage === stage);
        return {
          stage,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        };
      });

      return {
        byStage,
        totalValue: (deals ?? []).reduce((sum, d) => sum + (d.value || 0), 0),
        totalDeals: (deals ?? []).length,
      };
    },
  });
}

// ============================================
// Single Deal Tasks Hook
// ============================================

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

      // Step 1: Get task IDs from junction table
      const { data: links, error: linksError } = await supabase
        .from("task_deal_links")
        .select("task_id")
        .eq("deal_id", dealId);

      if (linksError) {
        console.error("[useDealTasks] Junction error:", linksError);
      }

      const junctionTaskIds = (links ?? []).map((l) => l.task_id);

      // Step 2: Get task IDs from legacy crm_deal_id field
      const { data: legacyTasks, error: legacyError } = await supabase
        .from("tasks")
        .select("id")
        .eq("crm_deal_id", dealId);

      if (legacyError) {
        console.error("[useDealTasks] Legacy error:", legacyError);
      }

      const legacyTaskIds = (legacyTasks ?? []).map((t) => t.id);

      // Step 3: Combine and dedupe
      const allTaskIds = [...new Set([...junctionTaskIds, ...legacyTaskIds])];

      if (allTaskIds.length === 0) {
        return [];
      }

      // Step 4: Fetch full task details with embedded relations (same as tv-app CRM service)
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, priority, due_date, status_id, task_number, project_id, task_statuses(type), projects(identifier_prefix)")
        .in("id", allTaskIds)
        .order("due_date", { ascending: true });

      if (error) {
        console.error("[useDealTasks] Tasks error:", error);
        return [];
      }

      // Check if embedded relations worked (task_statuses should have data)
      const hasEmbeddedStatuses = (data ?? []).some(
        (t) => t.task_statuses && (Array.isArray(t.task_statuses) ? t.task_statuses.length > 0 : true)
      );

      // Fallback: if embedded relations didn't work, fetch separately
      let statusMap = new Map<string, string>();
      let projectMap = new Map<string, string>();

      if (!hasEmbeddedStatuses && data && data.length > 0) {
        // Fetch statuses
        const statusIds = [...new Set(data.map(t => t.status_id).filter(Boolean))];
        const { data: statuses } = await supabase
          .from("task_statuses")
          .select("id, type")
          .in("id", statusIds);

        statusMap = new Map((statuses ?? []).map(s => [s.id, s.type]));

        // Fetch projects
        const projectIds = [...new Set(data.map(t => t.project_id).filter(Boolean))];
        const { data: projects } = await supabase
          .from("projects")
          .select("id, identifier_prefix")
          .in("id", projectIds);

        projectMap = new Map((projects ?? []).map(p => [p.id, p.identifier_prefix]));
      }

      // Transform to flat structure
      return (data ?? []).map((task) => {
        let statusType: string;
        let projectPrefix: string;

        if (hasEmbeddedStatuses) {
          // Use embedded relations
          const taskStatuses = task.task_statuses as { type: string } | { type: string }[] | null;
          statusType = Array.isArray(taskStatuses)
            ? taskStatuses[0]?.type || "unstarted"
            : taskStatuses?.type || "unstarted";

          const projectRel = task.projects as { identifier_prefix: string } | { identifier_prefix: string }[] | null;
          projectPrefix = Array.isArray(projectRel)
            ? projectRel[0]?.identifier_prefix || "TASK"
            : projectRel?.identifier_prefix || "TASK";
        } else {
          // Use fallback maps
          statusType = statusMap.get(task.status_id) || "unstarted";
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
