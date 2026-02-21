// CRM Activities CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Activity,
  ActivityInsert,
  ActivityFilters,
} from "../../lib/crm/types";
import { crmKeys } from "./keys";

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
