// Mutation: update a contact's prospect_stage

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { crmKeys } from "../crm/keys";
import { prospectKeys } from "./useProspects";
import type { ProspectStage } from "../../modules/prospecting/ProspectingComponents";

export function useUpdateProspectStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      stage,
    }: {
      contactId: string;
      stage: ProspectStage | null;
    }) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update({
          prospect_stage: stage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
      queryClient.invalidateQueries({ queryKey: prospectKeys.all });
    },
  });
}
