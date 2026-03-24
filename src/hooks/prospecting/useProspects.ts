// Query prospects — crm_contacts with prospect_stage set

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { crmKeys } from "../crm/keys";
import type { ProspectStage } from "../../modules/prospecting/ProspectingComponents";

export interface ProspectContact {
  id: string;
  name: string;
  email: string;
  role: string | null;
  department: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_id: string;
  source: string | null;
  source_id: string | null;
  email_status: string | null;
  prospect_stage: ProspectStage;
  notes: string | null;
  is_primary: boolean | null;
  created_at: string;
  updated_at: string | null;
  company_name?: string;
  company_display_name?: string;
}

export const prospectKeys = {
  all: [...crmKeys.all, "prospects"] as const,
  list: (filters?: { search?: string; stage?: ProspectStage }) =>
    [...prospectKeys.all, "list", filters] as const,
};

export function useProspects(filters?: { search?: string; stage?: ProspectStage }) {
  return useQuery({
    queryKey: prospectKeys.list(filters),
    queryFn: async (): Promise<ProspectContact[]> => {
      let q = supabase
        .from("crm_contacts")
        .select("*, crm_companies(name, display_name)")
        .not("prospect_stage", "is", null);

      if (filters?.search) {
        q = q.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }
      if (filters?.stage) {
        q = q.eq("prospect_stage", filters.stage);
      }

      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;

      return (data || []).map((row: any) => ({
        ...row,
        company_name: row.crm_companies?.name,
        company_display_name: row.crm_companies?.display_name,
      }));
    },
  });
}
