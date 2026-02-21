// CRM Companies CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Company,
  CompanyInsert,
  CompanyUpdate,
  CompanyWithRelations,
  CompanyFilters,
} from "../../lib/crm/types";
import { crmKeys } from "./keys";
import { useContacts } from "./useContacts";
import { useDealsWithTasks } from "./useDeals";
import { useActivities } from "./useActivities";

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
