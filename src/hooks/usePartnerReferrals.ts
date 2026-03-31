// src/hooks/usePartnerReferrals.ts
// React Query hooks for partner referral requests

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface PartnerReferralRequest {
  id: string;
  partner_id: string;
  company_id: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  partner: { name: string; company: string | null } | null;
  company: { name: string } | null;
}

export const referralKeys = {
  all: ["partner-referrals"] as const,
  list: (status?: string) => ["partner-referrals", "list", status] as const,
};

export function usePartnerReferrals(status?: string) {
  return useQuery({
    queryKey: referralKeys.list(status),
    queryFn: async () => {
      let query = supabase
        .from("partner_referral_requests")
        .select("*, partner:partner_access(name, company), company:crm_companies(name)")
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as PartnerReferralRequest[];
    },
  });
}

export function useReviewReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      reviewed_by,
    }: {
      id: string;
      status: "approved" | "rejected";
      reviewed_by: string;
    }) => {
      const { error } = await supabase
        .from("partner_referral_requests")
        .update({
          status,
          reviewed_by,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw new Error(error.message);

      // If approved, set partner_id on the company
      if (status === "approved") {
        const { data: request } = await supabase
          .from("partner_referral_requests")
          .select("partner_id, company_id")
          .eq("id", id)
          .single();

        if (request) {
          await supabase
            .from("crm_companies")
            .update({ partner_id: request.partner_id })
            .eq("id", request.company_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referralKeys.all });
    },
  });
}
