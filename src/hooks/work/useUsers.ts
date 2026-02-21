// Work Users hook

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { User } from "../../lib/work/types";
import { workKeys } from "./keys";

export function useUsers(type?: "human" | "bot") {
  return useQuery({
    queryKey: [...workKeys.users(), type],
    queryFn: async (): Promise<User[]> => {
      let query = supabase.from("users").select("*").order("name");

      if (type) {
        query = query.eq("type", type);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch users: ${error.message}`);
      return data ?? [];
    },
  });
}
