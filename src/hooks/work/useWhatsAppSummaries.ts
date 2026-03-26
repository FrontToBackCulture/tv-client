// WhatsApp Summaries hook — fetch daily summaries for an initiative

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { workKeys } from "./keys";

export interface WhatsAppSummary {
  id: string;
  initiative_id: string;
  client_folder: string;
  date: string;
  summary: string;
  key_topics: string[] | null;
  action_items: string[] | null;
  participants: string[] | null;
  message_count: number | null;
  media_notes: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

export function useWhatsAppSummaries(initiativeId: string | null) {
  return useQuery({
    queryKey: workKeys.whatsappSummaries(initiativeId || ""),
    queryFn: async (): Promise<WhatsAppSummary[]> => {
      const { data, error } = await supabase
        .from("whatsapp_summaries")
        .select("*")
        .eq("initiative_id", initiativeId!)
        .order("date", { ascending: false });

      if (error) throw new Error(`Failed to fetch WhatsApp summaries: ${error.message}`);
      return data ?? [];
    },
    enabled: !!initiativeId,
  });
}
