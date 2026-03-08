// Email Groups CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  EmailGroup,
  EmailGroupInsert,
  EmailGroupUpdate,
  EmailGroupWithCount,
} from "../../lib/email/types";
import { emailKeys } from "./keys";

export function useEmailGroups() {
  return useQuery({
    queryKey: emailKeys.groups(),
    queryFn: async (): Promise<EmailGroupWithCount[]> => {
      const { data: groups, error } = await supabase
        .from("email_groups")
        .select("*")
        .order("name", { ascending: true });

      if (error)
        throw new Error(`Failed to fetch groups: ${error.message}`);

      // Get member counts for each group
      const { data: counts } = await supabase
        .from("email_contact_groups")
        .select("group_id");

      const countMap: Record<string, number> = {};
      (counts ?? []).forEach((row: any) => {
        countMap[row.group_id] = (countMap[row.group_id] || 0) + 1;
      });

      return (groups ?? []).map((group) => ({
        ...group,
        memberCount: countMap[group.id] || 0,
      }));
    },
  });
}

export function useEmailGroup(id: string | null) {
  return useQuery({
    queryKey: emailKeys.group(id || ""),
    queryFn: async (): Promise<EmailGroupWithCount | null> => {
      if (!id) return null;

      const { data: group, error } = await supabase
        .from("email_groups")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch group: ${error.message}`);

      const { count } = await supabase
        .from("email_contact_groups")
        .select("*", { count: "exact", head: true })
        .eq("group_id", id);

      return { ...group, memberCount: count || 0 };
    },
    enabled: !!id,
  });
}

export function useCreateEmailGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (group: EmailGroupInsert): Promise<EmailGroup> => {
      const { data, error } = await supabase
        .from("email_groups")
        .insert(group)
        .select()
        .single();

      if (error) throw new Error(`Failed to create group: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
    },
  });
}

export function useUpdateEmailGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: EmailGroupUpdate;
    }): Promise<EmailGroup> => {
      const { data, error } = await supabase
        .from("email_groups")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update group: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
      queryClient.invalidateQueries({ queryKey: emailKeys.group(data.id) });
    },
  });
}

export function useDeleteEmailGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("email_groups")
        .delete()
        .eq("id", id);

      if (error) throw new Error(`Failed to delete group: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
    },
  });
}
